// ============================================================================
// Lattice Todo — Main
//
// Bootstrap: connect SDK, open store, load data, mount Preact.
// ============================================================================

import { render } from 'preact';
import { db, initState } from './state';
import { App } from './App';

const app = document.getElementById('app')!;

async function main() {
  app.innerHTML = '<div class="app-loading">Connecting...</div>';

  try {
    const sdk = await LatticeSDK.connect();
    window.SDK = sdk;
    const store = await sdk.openAppStore();
    await db.init(store, () => initState());

    initState();

    app.innerHTML = '';
    render(<App />, app);
  } catch (e) {
    console.error('[todo] init failed:', e);
    app.innerHTML = `<div class="app-error">Failed to connect: ${e}</div>`;
  }
}

main();
