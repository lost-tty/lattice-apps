// ============================================================================
// Lattice Inventory — Data Layer
//
// IndexedDB for instant local reads. LatticeSDK store for persistence.
// Optimistic writes: IndexedDB first, then server in background.
// On load: fetch all from server, replace local store.
// ============================================================================

import type { Item, Store, SyncStatus, ViewPrefs } from './types';
import { ID } from './types';

const DB_NAME = 'lattice-inventory';
const DB_VERSION = 2;
const STORE_NAME = 'items';
const KEY_PREFIX = 'item/';
const PREFS_KEY = '_prefs/view';
const LOCAL_PREFS_KEY = 'lattice-inventory-prefs';
const SESSION_GROUPING_KEY = 'lattice-inventory-grouping-active';
const SESSION_COLLAPSED_KEY = 'lattice-inventory-collapsed';

type SyncCallback = (status: SyncStatus) => void;
type DataCallback = (items: Map<string, Item>, source: 'local' | 'remote') => void;

// --- IndexedDB helpers ---
// Items are stored with an explicit 'id' property in IDB for keyPath,
// but this is stripped when loading into the in-memory Item (which uses Symbol ID).

interface IDBItem {
  _idb_id: string;
  [key: string]: unknown;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop old store if upgrading from v1
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: '_idb_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function toIDBItem(id: string, item: Item): IDBItem {
  const obj: IDBItem = { _idb_id: id };
  for (const key of Object.keys(item)) {
    obj[key] = item[key];
  }
  return obj;
}

function fromIDBItem(idbItem: IDBItem): Item {
  const id = idbItem._idb_id;
  const item = { [ID]: id } as Item;
  for (const key of Object.keys(idbItem)) {
    if (key === '_idb_id' || key === 'id') continue;  // strip legacy id
    item[key] = idbItem[key];
  }
  return item;
}

function idbPut(db: IDBDatabase, id: string, item: Item): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(toIDBItem(id, item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<IDBItem[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- DataStore ---

export class DataStore {
  private db: IDBDatabase | null = null;
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
    this.db = await openDB();

    await this.fullSync();
    this.unwatch = store.watch(KEY_PREFIX, (e) => this.handleWatchEvent(e));

    return this.items;
  }

  private async fullSync(): Promise<void> {
    if (!this.store || !this.db) return;
    this.onSync('syncing');

    try {
      const entries = await this.store.list(KEY_PREFIX);
      const decoder = new TextDecoder();
      const newItems = new Map<string, Item>();

      for (const e of entries) {
        const key = decoder.decode(e.key);
        const id = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
        try {
          const fields = JSON.parse(decoder.decode(e.value));
          if (typeof fields === 'object' && fields !== null) {
            delete fields.id;  // strip legacy id field (id comes from KV key)
            const item = { [ID]: id, ...fields } as Item;
            newItems.set(id, item);
          }
        } catch {
          // skip malformed
        }
      }

      await idbClear(this.db);
      for (const [id, item] of newItems) {
        await idbPut(this.db, id, item);
      }

      this.items = newItems;
      this.onSync('idle');
      this.onData(this.items, 'remote');
    } catch (e) {
      console.error('[db] full sync failed:', e);
      const local = await idbGetAll(this.db);
      this.items = new Map(local.map(i => {
        const item = fromIDBItem(i);
        return [item[ID], item];
      }));
      this.onSync('error');
      this.onData(this.items, 'remote');
    }
  }

  private async handleWatchEvent(e: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) {
    const decoder = new TextDecoder();
    const rawKey = decoder.decode(e.key);
    if (!rawKey.startsWith(KEY_PREFIX)) return;

    const id = rawKey.slice(KEY_PREFIX.length);

    if (e.deleted || !e.value) {
      // Skip if already absent
      if (!this.items.has(id)) return;
      this.items.delete(id);
      if (this.db) await idbDelete(this.db, id);
    } else {
      try {
        const fields = JSON.parse(decoder.decode(e.value));
        if (typeof fields !== 'object' || fields === null) return;
        delete fields.id;  // strip legacy

        // Skip if the item hasn't actually changed (echo suppression by value)
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
        if (this.db) await idbPut(this.db, id, item);
      } catch {
        return;
      }
    }
    // New Map reference so the signal fires
    this.onData(new Map(this.items), 'remote');
  }

  getAll(): Map<string, Item> {
    return new Map(this.items);
  }

  /** Save an item. The item[ID] must be set. */
  async save(id: string, item: Item): Promise<void> {
    const now = new Date().toISOString();
    if (!item.created_at) item.created_at = now;
    item.updated_at = now;

    this.items.set(id, item);
    if (this.db) await idbPut(this.db, id, item);
    this.onData(this.items, 'local');

    await this.serverPut(id, item);
  }

  async remove(id: string): Promise<void> {

    this.items.delete(id);
    if (this.db) await idbDelete(this.db, id);
    this.onData(this.items, 'local');

    await this.serverDelete(id);
  }

  /** Put to server — only persists user fields (strips Symbol ID, timestamps hidden). */
  private async serverPut(id: string, item: Item): Promise<void> {
    if (!this.store) return;
    const key = KEY_PREFIX + id;
    // Serialize only string-keyed properties (Symbol ID excluded automatically, strip legacy id)
    const payload: Record<string, unknown> = {};
    for (const k of Object.keys(item)) {
      if (k === 'id') continue;
      payload[k] = item[k];
    }
    try {
      this.onSync('syncing');
      await this.store.putJSON(key, payload);
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
      await this.store.delete(key);
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
      // Support both { id, fields } format and flat { id, name, ... } legacy format
      let id: string;
      let fields: Record<string, unknown>;
      if (entry.fields && typeof entry.fields === 'object') {
        id = entry.id || crypto.randomUUID();
        fields = entry.fields as Record<string, unknown>;
      } else {
        // Legacy format: flat object with id inside
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
    return this.store.exportJSON();
  }

  /** Full KV store import — items AND preferences. Re-syncs local state after. */
  async importAll(data: { entries: { key: string; value: unknown }[] }): Promise<number> {
    if (!this.store) throw new Error('Store not initialized');
    const count = await this.store.importJSON(data);
    // Re-sync local items from the store so in-memory state matches
    await this.fullSync();
    // Refresh localStorage prefs cache from the imported KV data
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
      const { value } = await this.store.getJSON(PREFS_KEY);
      if (value && typeof value === 'object') {
        try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
        return value as ViewPrefs;
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
      await this.store.putJSON(PREFS_KEY, prefs);
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
    if (this.unwatch) {
      this.unwatch();
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.db) this.db.close();
  }
}
