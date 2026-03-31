// Lattice Outliner — Editor
//
// Top-level editor component that dispatches to the appropriate view.

import { currentPage, isJournalPage } from './db';
import { JournalView } from './JournalView';
import { SinglePageView } from './SinglePageView';

export function Editor() {
  const pageId = currentPage.value;
  if (!pageId) {
    return (
      <div class="editor empty">
        <p>Select a page or start with today's journal.</p>
      </div>
    );
  }

  if (isJournalPage(pageId)) {
    return <JournalView key={pageId} startPageId={pageId} />;
  }

  return <SinglePageView pageId={pageId} />;
}
