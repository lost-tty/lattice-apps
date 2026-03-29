// ============================================================================
// Lattice Inventory — Data Layer
//
// In-memory item map backed by LatticeSDK store.
// Optimistic writes: update map first, then persist in background.
// On load: fetch all from server. Live sync via watch subscription.
// ============================================================================

import type { Item, Store, SyncStatus, ViewPrefs } from './types';
import { ID } from './types';

const KEY_PREFIX = 'item/';
const PREFS_KEY = '_prefs/view';
const LOCAL_PREFS_KEY = 'lattice-inventory-prefs';
const SESSION_GROUPING_KEY = 'lattice-inventory-grouping-active';
const SESSION_COLLAPSED_KEY = 'lattice-inventory-collapsed';

type SyncCallback = (status: SyncStatus) => void;
type DataCallback = (items: Map<string, Item>, source: 'local' | 'remote') => void;

const enc = new TextEncoder();
const encode = (s: string): Uint8Array => enc.encode(s);
const decode = (b: Uint8Array): string => new TextDecoder().decode(b);


// --- DataStore ---

export class DataStore {
  private store: Store | null = null;
  private items: Map<string, Item> = new Map();
  private pendingWrites: Map<string, 'put' | 'delete'> = new Map();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onSync: SyncCallback = () => {};
  private onData: DataCallback = () => {};
  private unwatch: (() => void) | null = null;

  async init(store: Store, onSync: SyncCallback, onData: DataCallback): Promise<Map<string, Item>> {
    this.store = store;
    this.onSync = onSync;
    this.onData = onData;

    await this.fullSync();
    this.unwatch = store.subscribe('watch', { prefix: encode('') }, (e) => this.handleWatchEvent(e));

    return this.items;
  }

  private async fullSync(): Promise<void> {
    if (!this.store) return;
    this.onSync('syncing');

    try {
      const entries = (await this.store.List({ prefix: encode(KEY_PREFIX) })).items;
      const newItems = new Map<string, Item>();

      for (const e of entries) {
        const key = decode(e.key);
        const id = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
        try {
          const fields = JSON.parse(decode(e.value));
          if (typeof fields === 'object' && fields !== null) {
            delete fields.id;  // strip legacy id field (id comes from KV key)
            const item = { [ID]: id, ...fields } as Item;
            newItems.set(id, item);
          }
        } catch {
          // skip malformed
        }
      }

      this.items = newItems;
      this.onSync('idle');
      this.onData(this.items, 'remote');
    } catch (e) {
      console.error('[db] full sync failed:', e);
      this.onSync('error');
    }
  }

  private async handleWatchEvent(e: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) {
    const rawKey = decode(e.key);
    if (!rawKey.startsWith(KEY_PREFIX)) return;

    const id = rawKey.slice(KEY_PREFIX.length);

    if (e.deleted || !e.value) {
      if (!this.items.has(id)) return;
      this.items.delete(id);
    } else {
      try {
        const fields = JSON.parse(decode(e.value!));
        if (typeof fields !== 'object' || fields === null) return;
        delete fields.id;

        // Skip if the item hasn't actually changed (echo suppression)
        const existing = this.items.get(id);
        if (existing) {
          const existingKeys = Object.keys(existing);
          const incomingKeys = Object.keys(fields);
          if (existingKeys.length === incomingKeys.length &&
              existingKeys.every(k => existing[k] === fields[k])) {
            return;
          }
        }

        const item = { [ID]: id, ...fields } as Item;
        this.items.set(id, item);
      } catch {
        return;
      }
    }
    this.onData(new Map(this.items), 'remote');
  }

  getAll(): Map<string, Item> {
    return new Map(this.items);
  }

  async save(id: string, item: Item): Promise<void> {
    const now = new Date().toISOString();
    if (!item.created_at) item.created_at = now;
    item.updated_at = now;

    this.items.set(id, item);
    this.onData(this.items, 'local');

    await this.serverPut(id, item);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
    this.onData(this.items, 'local');

    await this.serverDelete(id);
  }

  private async serverPut(id: string, item: Item): Promise<void> {
    if (!this.store) return;
    const key = KEY_PREFIX + id;
    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(item)) {
      if (k === 'id') continue;
      payload[k] = item[k];
    }
    try {
      this.onSync('syncing');
      await this.store.Put({ key: encode(key), value: encode(JSON.stringify(payload)) });
      this.pendingWrites.delete(id);
      this.onSync(this.pendingWrites.size > 0 ? 'syncing' : 'idle');
    } catch (e) {
      console.error('[db] server put failed:', e);
      this.pendingWrites.set(id, 'put');
      this.onSync('error');
      this.scheduleRetry();
    }
  }

  private async serverDelete(id: string): Promise<void> {
    if (!this.store) return;
    const key = KEY_PREFIX + id;
    try {
      this.onSync('syncing');
      await this.store.Delete({ key: encode(key) });
      this.pendingWrites.delete(id);
      this.onSync(this.pendingWrites.size > 0 ? 'syncing' : 'idle');
    } catch (e) {
      console.error('[db] server delete failed:', e);
      this.pendingWrites.set(id, 'delete');
      this.onSync('error');
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      for (const [id, op] of this.pendingWrites) {
        if (op === 'put') {
          const item = this.items.get(id);
          if (item) await this.serverPut(id, item);
        } else {
          await this.serverDelete(id);
        }
      }
    }, 5000);
  }

  get pendingCount(): number {
    return this.pendingWrites.size;
  }

  exportItems(): { id: string; fields: Record<string, unknown> }[] {
    return [...this.items.entries()].map(([id, item]) => {
      const fields: Record<string, unknown> = {};
      for (const k of Object.keys(item)) {
        fields[k] = item[k];
      }
      return { id, fields };
    });
  }

  async importItems(entries: { id?: string; fields?: Record<string, unknown>; [key: string]: unknown }[]): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      let id: string;
      let fields: Record<string, unknown>;
      if (entry.fields && typeof entry.fields === 'object') {
        id = entry.id || crypto.randomUUID();
        fields = entry.fields as Record<string, unknown>;
      } else {
        id = (entry.id as string) || crypto.randomUUID();
        fields = {};
        for (const k of Object.keys(entry)) {
          if (k === 'id') continue;
          fields[k] = entry[k];
        }
      }
      if (Object.keys(fields).length === 0) continue;
      const item = { [ID]: id } as Item;
      for (const k of Object.keys(fields)) {
        item[k] = fields[k];
      }
      await this.save(id, item);
      count++;
    }
    return count;
  }

  /** Full KV store export — includes items AND preferences. */
  async exportAll(): Promise<{ entries: { key: string; value: unknown }[] }> {
    if (!this.store) throw new Error('Store not initialized');
    return await (this.store as any).call('ExportJSON', {});
  }

  /** Full KV store import — items AND preferences. Re-syncs local state after. */
  async importAll(data: { entries: { key: string; value: unknown }[] }): Promise<number> {
    if (!this.store) throw new Error('Store not initialized');
    const { count } = await (this.store as any).call('ImportJSON', data as any);
    await this.fullSync();
    try { localStorage.removeItem(LOCAL_PREFS_KEY); } catch { /* ignore */ }
    return count;
  }

  // --- Preferences ---

  async loadPrefs(): Promise<ViewPrefs | null> {
    try {
      const raw = localStorage.getItem(LOCAL_PREFS_KEY);
      if (raw) {
        const local = JSON.parse(raw);
        if (local && typeof local === 'object') return local as ViewPrefs;
      }
    } catch { /* ignore */ }

    if (!this.store) return null;
    try {
      const { value: raw } = await this.store.Get({ key: encode(PREFS_KEY) });
      if (raw) {
        const value = JSON.parse(decode(raw));
        if (value && typeof value === 'object') {
          try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
          return value as ViewPrefs;
        }
      }
    } catch (e) {
      console.error('[db] loadPrefs failed:', e);
    }
    return null;
  }

  async savePrefs(prefs: ViewPrefs): Promise<void> {
    try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    if (!this.store) return;
    try {
      await this.store.Put({ key: encode(PREFS_KEY), value: encode(JSON.stringify(prefs)) });
    } catch (e) {
      console.error('[db] savePrefs failed:', e);
    }
  }

  loadGroupingActive(): boolean | null {
    try {
      const raw = sessionStorage.getItem(SESSION_GROUPING_KEY);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch { /* ignore */ }
    return null;
  }

  saveGroupingActive(active: boolean): void {
    try { sessionStorage.setItem(SESSION_GROUPING_KEY, String(active)); } catch { /* ignore */ }
  }

  loadCollapsed(): Set<string> | null {
    try {
      const raw = sessionStorage.getItem(SESSION_COLLAPSED_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return null;
  }

  saveCollapsed(collapsed: Set<string>): void {
    try { sessionStorage.setItem(SESSION_COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch { /* ignore */ }
  }

  destroy() {
    if (this.unwatch) this.unwatch();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }
}
