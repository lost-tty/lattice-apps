// Lattice Outliner — Main
//
// Connect SDK, open store, load data, sync URL ↔ currentPage, mount Preact.

import { render } from 'preact';
import { effect } from '@preact/signals';
import { App } from './App';
import { init, navigateTo, navigateById, todaySlug, currentPage, pageData, findPageBySlug } from './db';

const root = document.getElementById('app')!;

/** Extract page slug from the URL hash. Expects #/page/:slug */
function slugFromUrl(): string | null {
  const m = location.hash.match(/^#\/page\/([^/]+)/);
  return m ? m[1] : null;
}

/** Navigate to the page matching the current URL, or fall back to today. */
function syncFromUrl() {
  const slug = slugFromUrl();
  if (slug) {
    const page = findPageBySlug(slug);
    if (page) { navigateById(page.id); return; }
    // slug looks like a title we haven't seen — try to create/open it
    navigateTo(slug);
    return;
  }
  navigateTo(todaySlug());
}

async function main() {
  root.textContent = 'Connecting…';

  try {
    const sdk = await LatticeSDK.connect();
    const store = await sdk.openAppStore();
    await init(store);

    // Initial navigation from URL
    syncFromUrl();

    // Push URL when currentPage changes
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

    // Back/forward — browser already updated location.hash,
    // so the effect above will see a matching hash and skip the push.
    window.addEventListener('popstate', () => syncFromUrl());

    root.textContent = '';
    render(<App />, root);
  } catch (e) {
    console.error('[outliner] init failed:', e);
    root.textContent = `Failed to connect: ${e}`;
  }
}

main();
