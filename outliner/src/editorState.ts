// Shared mutable state and helpers used across editor components.
//
// Mutable state lives in a plain object so it can be read and written
// from any module without setter functions.

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
