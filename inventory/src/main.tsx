// ============================================================================
// Lattice Inventory — Main (Preact)
//
// Bootstrap: connect SDK, open store, load data, wire up UI + live sync.
// ============================================================================

import { render } from 'preact';
import { DataStore } from './db';
import { setDataStore, initState, setSyncStatus, items, rebuildIndex } from './state';
import type { Item, SyncStatus } from './types';
import { App } from './App';

const app = document.getElementById('app')!;

async function main() {
  app.innerHTML = '<div class="app-loading">Connecting to store...</div>';

  try {
    // 1. Connect SDK and open the KV store
    const sdk = await LatticeSDK.connect();
    window.SDK = sdk;
    const store = await sdk.openAppStore();

    // 2. Initialize data layer
    const dataStore = new DataStore();
    setDataStore(dataStore);

    const itemsMap = await dataStore.init(
      store,
      (status: SyncStatus) => setSyncStatus(status),
      (updatedItems: Map<string, Item>, source: 'local' | 'remote') => {
        if (source === 'remote') {
          items.value = updatedItems;
          rebuildIndex();
        }
      },
    );

    // 3. Load persisted view preferences
    const prefs = await dataStore.loadPrefs();

    // 4. Initialize state with items + prefs
    initState(itemsMap, prefs);

    // 5. Mount Preact app
    app.innerHTML = '';
    render(<App />, app);

  } catch (e) {
    console.error('[inventory] init failed:', e);
    app.innerHTML = `<div class="app-error">Failed to connect: ${e}</div>`;
  }
}

main();
