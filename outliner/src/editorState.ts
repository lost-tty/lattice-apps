// Shared mutable state and helpers used across editor components.
//
// Mutable state lives in a plain object so it can be read and written
// from any module without setter functions.

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { FlatBlock } from './db';
import type { Block, BlockNode } from './types';
import { activeBlockId, blockData } from './db';
import { parseHeading, parseTodoStatus } from './parse';

// --- Mutable state ---

export const shared = {
  dragBlockId: null as string | null,
  dragIsColumn: false,
  pendingActivation: null as { blockId: string; cursor: 'start' | 'end' | number } | null,
};

/** Page ID whose section is currently anchored at the top of the scroll viewport.
 *  Populated by stacked-content views (e.g. JournalView); null when the current
 *  view has a single page. The mobile topbar reads this for its title. */
export const anchoredPageId = signal<string | null>(null);

/** Debug-panel state keyed by pageId. Shared across the inline toolbar
 *  (rendered by PageSection) and the mobile topbar toolbar (rendered by
 *  App), so both toggle the same panel without needing to pipe state
 *  through a registry. `'off'` / missing means no panel is open.
 *  Persists across page navigation — reopening a page restores its
 *  previously-visible debug panel. */
export type DebugPanelKind = 'off' | 'markdown' | 'ast';
export const debugPanels = signal<Record<string, DebugPanelKind>>({});

/** How far (in px) the mobile topbar is slid up. 0 = fully visible;
 *  equal to the topbar's height = fully hidden. Derived from scroll deltas
 *  (not raw scrollTop) so the bar reveals as soon as the user starts
 *  scrolling up, regardless of how deep they had scrolled. CSS transitions
 *  the transform from this value at all times. */
export const topbarSlide = signal(0);

/** Track editor scroll so the topbar slides out of view as the user scrolls,
 *  and snaps to full view or fully hidden based on the last scroll direction
 *  when scrolling stops — native iOS feel. */
export function useEditorScrollHide(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let last = el.scrollTop;
    let slide = 0;
    let lastDir: 1 | -1 = 1;
    let snapTimer: number | undefined;

    // Topbar height is stable within a viewport; measure once and refresh on
    // resize/orientation change instead of hitting the DOM every scroll frame.
    let topbarH = 44;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>('.topbar');
      if (bar) topbarH = bar.offsetHeight;
    };
    measure();
    window.addEventListener('resize', measure);

    const onScroll = () => {
      const t = Math.max(0, el.scrollTop);
      const delta = t - last;
      if (delta > 0) lastDir = 1;
      else if (delta < 0) lastDir = -1;
      slide = Math.max(0, Math.min(topbarH, slide + delta));
      last = t;
      topbarSlide.value = slide;

      clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        if (slide > 0 && slide < topbarH) {
          slide = lastDir > 0 ? topbarH : 0;
          topbarSlide.value = slide;
        }
      }, 120);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      clearTimeout(snapTimer);
      topbarSlide.value = 0;
    };
  }, []);
}

// --- Drag helpers ---

export function clearDropIndicators() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-nested').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-nested');
  });
}

// Must match --indent in style.css
export const INDENT_PX = 24;

/** Start a block-level drag operation. */
export function startBlockDrag(e: DragEvent, blockId: string) {
  shared.dragBlockId = blockId;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', blockId);
  const block = (e.target as HTMLElement).closest('.block') as HTMLElement;
  if (block) {
    e.dataTransfer!.setDragImage(block, 0, block.offsetHeight / 2);
    requestAnimationFrame(() => block.classList.add('dragging'));
  }
}

// --- Activation ---

/** Activate a block with a specific cursor position. */
export function activateBlock(blockId: string, cursor: 'start' | 'end' | number = 'end') {
  shared.pendingActivation = { blockId, cursor };
  activeBlockId.value = blockId;
}

// --- Shared helpers ---

/** Compute visual depth: subtract heading ancestor levels so children
 *  of headings render at the heading's visual level. */
export function getVisualDepth(node: FlatBlock): number {
  let depth = node.depth;
  let pid = node.parent;
  while (pid) {
    const p = blockData.value[pid];
    if (p && p.type === 'paragraph' && parseHeading(p.content).level) depth--;
    pid = p?.parent ?? null;
  }
  return depth;
}

/** Return the content template for a new sibling of this block.
 *  Checkboxes continue unchecked, todo keywords carry over, etc. */
export function continuationContent(block: Block): string {
  const { status, syntax } = parseTodoStatus(block.content);
  if (syntax === 'checkbox') return '[ ] ';
  if (status) return status === 'done' || status === 'cancelled' ? '' : `${status.toUpperCase()} `;
  return '';
}

/** Collect all descendant IDs from a FlatBlock's children tree. */
export function collectDescendantIds(node: FlatBlock): Set<string> {
  const ids = new Set<string>();
  function walk(children: BlockNode[]) {
    for (const child of children) {
      ids.add(child.id);
      walk(child.children);
    }
  }
  walk(node.children);
  return ids;
}
