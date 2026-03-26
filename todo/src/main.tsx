// ============================================================================
// Lattice Todo — Main
//
// Bootstrap: init LatticeSDK, load data, mount Preact.
// ============================================================================

import { render } from 'preact';
import { db, todos, initState } from './state';
import { App } from './App';

const app = document.getElementById('app')!;

async function main() {
  app.innerHTML = '<div class="app-loading">Connecting...</div>';

  try {
    const store = await LatticeSDK.connect();
    const items = await db.init(store, () => {
      todos.value = db.getAll();
    });

    initState(items);

    app.innerHTML = '';
    render(<App />, app);
  } catch (e) {
    console.error('[todo] init failed:', e);
    app.innerHTML = `<div class="app-error">Failed to connect: ${e}</div>`;
  }
}

main();
