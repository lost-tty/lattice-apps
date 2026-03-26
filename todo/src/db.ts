// ============================================================================
// Lattice Todo — Data Layer
//
// Lattice KV store for persistence, live sync via watch().
// Simple and thin — no IndexedDB cache needed for a todo list.
// ============================================================================

import type { Store, Todo } from './types';

const KEY_PREFIX = 'todo/';

export class TodoStore {
  private store: Store | null = null;
  private items: Map<string, Todo> = new Map();
  private unwatch: (() => void) | null = null;
  private onChange: () => void = () => {};

  async init(store: Store, onChange: () => void): Promise<Map<string, Todo>> {
    this.store = store;
    this.onChange = onChange;

    // Initial load
    const entries = await store.list(KEY_PREFIX);
    const dec = new TextDecoder();
    for (const e of entries) {
      const key = dec.decode(e.key);
      const id = key.slice(KEY_PREFIX.length);
      try {
        const data = JSON.parse(dec.decode(e.value));
        if (data && typeof data === 'object') {
          this.items.set(id, { id, ...data } as Todo);
        }
      } catch { /* skip malformed */ }
    }

    // Watch for remote changes
    this.unwatch = store.watch(KEY_PREFIX, (e) => this.handleWatch(e));

    return this.items;
  }

  private handleWatch(e: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) {
    const dec = new TextDecoder();
    const key = dec.decode(e.key);
    if (!key.startsWith(KEY_PREFIX)) return;
    const id = key.slice(KEY_PREFIX.length);

    if (e.deleted || !e.value) {
      if (!this.items.has(id)) return;
      this.items.delete(id);
    } else {
      try {
        const data = JSON.parse(dec.decode(e.value));
        if (!data || typeof data !== 'object') return;
        const existing = this.items.get(id);
        const updated: Todo = { id, ...data };
        // Skip if identical
        if (existing && existing.text === updated.text &&
            existing.done === updated.done && existing.order === updated.order) return;
        this.items.set(id, updated);
      } catch { return; }
    }
    this.onChange();
  }

  getAll(): Map<string, Todo> {
    return new Map(this.items);
  }

  async save(todo: Todo): Promise<void> {
    this.items.set(todo.id, todo);
    if (!this.store) return;
    const { id, ...data } = todo;
    await this.store.putJSON(KEY_PREFIX + id, data);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
    if (!this.store) return;
    await this.store.delete(KEY_PREFIX + id);
  }

  destroy() {
    this.unwatch?.();
  }
}
