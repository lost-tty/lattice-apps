// Dev entry point — uses a localStorage-backed mock store instead of the Lattice SDK.

import { render } from 'preact';
import { effect } from '@preact/signals';
import { App } from './App';
import { init, navigateTo, navigateById, currentPage, pageData, findPageBySlug } from './db';
import { todaySlug } from './parse';
import type { Store, WatchEvent } from './types';

const root = document.getElementById('app')!;

// --- localStorage-backed store ---

const PREFIX = 'outliner-dev:';

function createLocalStore(): Store {
  const watchers: { prefix: string; cb: (e: WatchEvent) => void }[] = [];
  const encode = (s: string) => new TextEncoder().encode(s);
  const decode = (b: Uint8Array) => new TextDecoder().decode(b);

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
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)!;
        if (!storageKey.startsWith(PREFIX)) continue;
        const key = storageKey.slice(PREFIX.length);
        if (key.startsWith(p)) {
          items.push({ key: encode(key), value: encode(localStorage.getItem(storageKey)!) });
        }
      }
      return { items };
    },

    async Get({ key }) {
      const val = localStorage.getItem(PREFIX + decode(key));
      return { value: val ? encode(val) : null };
    },

    async Put({ key, value }) {
      const k = decode(key);
      const v = decode(value);
      localStorage.setItem(PREFIX + k, v);
      notify(k, value, false);
    },

    async Delete({ key }) {
      const k = decode(key);
      localStorage.removeItem(PREFIX + k);
      notify(k, null, true);
    },

    async Batch({ ops }) {
      const notifications: Array<{ key: string; value: Uint8Array | null; deleted: boolean }> = [];
      for (const op of ops) {
        if ('put' in op) {
          const k = decode(op.put.key);
          localStorage.setItem(PREFIX + k, decode(op.put.value));
          notifications.push({ key: k, value: op.put.value, deleted: false });
        } else if ('delete' in op) {
          const k = decode(op.delete.key);
          localStorage.removeItem(PREFIX + k);
          notifications.push({ key: k, value: null, deleted: true });
        }
      }
      for (const n of notifications) notify(n.key, n.value, n.deleted);
    },

    subscribe(_stream, { prefix }, cb) {
      const entry = { prefix: decode(prefix), cb };
      watchers.push(entry);
      return () => {
        const i = watchers.indexOf(entry);
        if (i >= 0) watchers.splice(i, 1);
      };
    },
  };
}

// --- URL sync (same as main.tsx) ---

function slugFromUrl(): string | null {
  const m = location.hash.match(/^#\/page\/([^/]+)/);
  return m ? m[1] : null;
}

function syncFromUrl() {
  const slug = slugFromUrl();
  if (slug) {
    const page = findPageBySlug(slug);
    if (page) { navigateById(page.id); return; }
    navigateTo(slug);
    return;
  }
  navigateTo(todaySlug());
}

async function main() {
  const store = createLocalStore();
  await init(store);

  syncFromUrl();

  effect(() => {
    const pageId = currentPage.value;
    if (!pageId) return;
    const page = pageData.value[pageId];
    if (!page) return;
    const target = `#/page/${page.slug}`;
    if (location.hash !== target) {
      history.pushState(null, '', target);
    }
  });

  window.addEventListener('popstate', () => syncFromUrl());

  render(<App />, root);
}

main();
