// Mock Lattice SDK — in-memory Store for testing and development

import type { Store, WatchEvent } from './types';

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

export function createMockStore(): Store {
  const data = new Map<string, Uint8Array>();
  const watchers: { prefix: string; cb: (e: WatchEvent) => void }[] = [];

  function notify(key: string, value: Uint8Array | null, deleted: boolean) {
    for (const w of watchers) {
      if (key.startsWith(w.prefix)) {
        w.cb({ key: encode(key), value, deleted });
      }
    }
  }

  return {
    async List({ prefix }) {
      const p = decode(prefix);
      const items: { key: Uint8Array; value: Uint8Array }[] = [];
      for (const [k, v] of data) {
        if (k.startsWith(p)) items.push({ key: encode(k), value: v });
      }
      return { items };
    },

    async Get({ key }) {
      return { value: data.get(decode(key)) ?? null };
    },

    async Put({ key, value }) {
      const k = decode(key);
      data.set(k, value);
      notify(k, value, false);
    },

    async Delete({ key }) {
      const k = decode(key);
      data.delete(k);
      notify(k, null, true);
    },

    async Batch({ ops }) {
      // Apply all mutations atomically
      const notifications: Array<{ key: string; value: Uint8Array | null; deleted: boolean }> = [];
      for (const op of ops) {
        if ('put' in op) {
          const k = decode(op.put.key);
          data.set(k, op.put.value);
          notifications.push({ key: k, value: op.put.value, deleted: false });
        } else if ('delete' in op) {
          const k = decode(op.delete.key);
          data.delete(k);
          notifications.push({ key: k, value: null, deleted: true });
        }
      }
      // Notify after all mutations are applied
      for (const n of notifications) notify(n.key, n.value, n.deleted);
    },

    subscribe(stream, { prefix }, cb) {
      const entry = { prefix: decode(prefix), cb };
      watchers.push(entry);
      return () => {
        const i = watchers.indexOf(entry);
        if (i >= 0) watchers.splice(i, 1);
      };
    },
  };
}

export function createMockSDK() {
  const store = createMockStore();
  return {
    connect: async () => ({
      openAppStore: async () => store,
    }),
    store, // exposed for test inspection
  };
}
