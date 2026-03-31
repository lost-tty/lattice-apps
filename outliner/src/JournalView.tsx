import { useRef, useState, useCallback, useLayoutEffect } from 'preact/hooks';
import { getJournalPages } from './db';
import { PageSection } from './PageSection';

// How many journal days to load per batch (large enough to fill most viewports)
const JOURNAL_BATCH = 15;

export function JournalView({ startPageId }: { startPageId: string }) {
  const allJournals = getJournalPages();
  const startIdx = Math.max(allJournals.findIndex(p => p.id === startPageId), 0);

  const [newerCount, setNewerCount] = useState(startIdx > 0 ? JOURNAL_BATCH : 0);
  const [olderCount, setOlderCount] = useState(JOURNAL_BATCH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevNewerCount = useRef(0);

  const newerStart = Math.max(startIdx - newerCount, 0);
  const olderEnd = Math.min(startIdx + olderCount, allJournals.length);
  const visibleJournals = allJournals.slice(newerStart, olderEnd);

  const hasNewer = newerStart > 0;
  const hasOlder = olderEnd < allJournals.length;

  // After newer entries prepend, restore scroll so the anchor doesn't jump.
  useLayoutEffect(() => {
    if (newerCount > prevNewerCount.current && anchorRef.current && scrollRef.current) {
      anchorRef.current.scrollIntoView({ block: 'start' });
    }
    prevNewerCount.current = newerCount;
  }, [newerCount]);

  // Load more on scroll (both directions).
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (hasOlder && el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setOlderCount(c => c + JOURNAL_BATCH);
    }
    if (hasNewer && el.scrollTop < 400) {
      setNewerCount(c => c + JOURNAL_BATCH);
    }
  }, [hasNewer, hasOlder]);

  return (
    <div class="editor" ref={scrollRef} onScroll={onScroll}>
      <div class="editor-main journal-view">
        {visibleJournals.map(page => (
          <div key={page.id} ref={page.id === startPageId ? anchorRef : undefined}>
            <PageSection pageId={page.id} titleClickable />
          </div>
        ))}
      </div>
    </div>
  );
}
