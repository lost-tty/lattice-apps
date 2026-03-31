// Structural block editing operations: create, indent, outdent, join, remove, move.

import type { Block } from './types';
import {
  blockData, saveBlock, deleteBlock,
  buildTree, flattenTree, getSiblings, nextOrder, orderBetween,
  blockKind, canAcceptChildren, isStructuralBlock, canBeSiblingAt,
} from './db';

// --- Descendant / heading section helpers ---

export function isDescendant(blockId: string, ancestorId: string): boolean {
  let current = blockData.value[blockId];
  while (current?.parent) {
    if (current.parent === ancestorId) return true;
    current = blockData.value[current.parent];
  }
  return false;
}

/** After a structural change, ensure heading sections capture their content.
 *  Walks siblings at the given level in order. Non-heading blocks that follow
 *  a heading are reparented as children of that heading. */
export function fixHeadingSections(pageId: string, parent: string | null): void {
  const siblings = Object.values(blockData.value)
    .filter(b => b.pageId === pageId && b.parent === parent)
    .sort((a, b) => a.order - b.order);

  let currentHeading: string | null = null;

  for (const sib of siblings) {
    if (blockKind(sib) === 'heading') {
      currentHeading = sib.id;
    } else if (currentHeading) {
      // Non-heading after a heading → should be a child of the heading
      const children = Object.values(blockData.value)
        .filter(b => b.pageId === pageId && b.parent === currentHeading);
      saveBlock({ ...sib, parent: currentHeading, order: nextOrder(children) });
    }
  }
}

// --- Drag-and-drop ---

/** Move a block via drag-and-drop. position: 'before' | 'after' | 'nested' */
export function moveBlock(
  blockId: string,
  targetId: string,
  position: 'before' | 'after' | 'nested',
) {
  const block = blockData.value[blockId];
  const target = blockData.value[targetId];
  if (!block || !target || blockId === targetId) return;
  if (isDescendant(targetId, blockId)) return;

  const sourceParent = block.parent;
  const sourcePageId = block.pageId;

  if (position === 'nested') {
    if (!canAcceptChildren(target)) return;
    const children = Object.values(blockData.value)
      .filter(b => b.pageId === target.pageId && b.parent === targetId)
      .sort((a, b) => a.order - b.order);
    const firstOrder = children.length > 0 ? children[0].order : 0;
    saveBlock({ ...block, parent: targetId, pageId: target.pageId, order: orderBetween(undefined, firstOrder) });
    fixHeadingSections(target.pageId, targetId);
    fixHeadingSections(sourcePageId, sourceParent);
    return;
  }

  if (!canBeSiblingAt(block, target.pageId, target.parent)) return;

  const siblings = Object.values(blockData.value)
    .filter(b => b.pageId === target.pageId && b.parent === target.parent && b.id !== blockId)
    .sort((a, b) => a.order - b.order);
  const targetIdx = siblings.findIndex(b => b.id === targetId);

  let order: number;
  if (position === 'before') {
    const prev = targetIdx > 0 ? siblings[targetIdx - 1] : null;
    order = orderBetween(prev?.order, target.order);
  } else {
    const next = targetIdx < siblings.length - 1 ? siblings[targetIdx + 1] : null;
    order = orderBetween(target.order, next?.order);
  }

  saveBlock({ ...block, parent: target.parent, pageId: target.pageId, order });
  fixHeadingSections(target.pageId, target.parent);
  fixHeadingSections(sourcePageId, sourceParent);
}

// --- Block creation ---

/** Create a new block after `afterId`, returns the new block's ID.
 *  If the level contains headings and the new block is not a heading,
 *  it becomes a child of the anchor instead of a sibling. */
export function createBlockAfter(afterId: string, content: string = '', type?: 'bullet' | 'paragraph'): string {
  const after = blockData.value[afterId];
  if (!after) return '';
  const blockType = type ?? after.type ?? 'bullet';

  // Build a provisional block to test predicates
  const provisional = { content, type: blockType } as Block;
  if (!canBeSiblingAt(provisional, after.pageId, after.parent) && canAcceptChildren(after)) {
    return createChildBlock(afterId, content, blockType as any);
  }

  const siblings = getSiblings(afterId);
  const idx = siblings.findIndex(b => b.id === afterId);
  const next = siblings[idx + 1];
  const order = orderBetween(after.order, next?.order);
  const id = crypto.randomUUID();
  saveBlock({ id, content, pageId: after.pageId, parent: after.parent, order, type: blockType });
  return id;
}

/** Create a new block as the last child of `parentId`. */
export function createChildBlock(parentId: string, content: string = '', type: 'bullet' | 'paragraph' = 'bullet'): string {
  const parent = blockData.value[parentId];
  if (!parent) return '';
  const children = Object.values(blockData.value)
    .filter(b => b.pageId === parent.pageId && b.parent === parentId);
  const id = crypto.randomUUID();
  saveBlock({ id, content, pageId: parent.pageId, parent: parentId, order: nextOrder(children), type });
  return id;
}

/** Check if a block is a paragraph (not a bullet). */
export function isParagraph(blockId: string): boolean {
  const block = blockData.value[blockId];
  return block?.type === 'paragraph';
}

// --- Indent / Outdent ---

/** Indent: make block a child of its previous sibling. */
export function indentBlock(blockId: string) {
  const block = blockData.value[blockId];
  if (!block) return;
  if (isStructuralBlock(block)) return;
  const siblings = getSiblings(blockId);
  const idx = siblings.findIndex(b => b.id === blockId);
  if (idx <= 0) return;
  const newParent = siblings[idx - 1];
  if (!canAcceptChildren(newParent)) return;
  const children = Object.values(blockData.value)
    .filter(b => b.pageId === block.pageId && b.parent === newParent.id);
  saveBlock({ ...block, parent: newParent.id, order: nextOrder(children) });
}

/** Outdent: make block a sibling of its parent. */
export function outdentBlock(blockId: string) {
  const block = blockData.value[blockId];
  if (!block?.parent) return;
  const parent = blockData.value[block.parent];
  if (!parent) return;
  if (isStructuralBlock(block)) return;
  if (isStructuralBlock(parent)) return; // can't escape a heading section
  if (!canBeSiblingAt(block, block.pageId, parent.parent)) return;
  const parentSiblings = Object.values(blockData.value)
    .filter(b => b.pageId === block.pageId && b.parent === parent.parent)
    .sort((a, b) => a.order - b.order);
  const parentIdx = parentSiblings.findIndex(b => b.id === parent.id);
  const nextSib = parentSiblings[parentIdx + 1];
  const order = orderBetween(parent.order, nextSib?.order);
  saveBlock({ ...block, parent: parent.parent, order });
}

// --- Join / Remove ---

/** Join a block onto the end of the previous block in the flat tree.
 * Returns { prevId, cursorPos } on success, or null if there is no previous block.
 * cursorPos is the offset in the merged content where the cursor should be placed. */
export function joinBlockWithPrevious(blockId: string, currentContent: string): { prevId: string; cursorPos: number } | null {
  const block = blockData.value[blockId];
  if (!block) return null;
  const tree = buildTree(block.pageId);
  const flat = flattenTree(tree);
  const idx = flat.findIndex(b => b.id === blockId);
  if (idx <= 0) return null;
  const prev = flat[idx - 1];
  const prevContent = prev.content;
  const joinedContent = prevContent + currentContent;
  const cursorPos = prevContent.length;
  saveBlock({ ...blockData.value[prev.id], content: joinedContent });
  deleteBlock(blockId);
  return { prevId: prev.id, cursorPos };
}

/** Remove a block. Returns the previous block ID to focus, or null. */
export function removeBlock(blockId: string): string | null {
  const block = blockData.value[blockId];
  if (!block) return null;
  const hasKids = Object.values(blockData.value).some(b => b.parent === blockId);
  if (hasKids) return null;
  const tree = buildTree(block.pageId);
  const flat = flattenTree(tree);
  const idx = flat.findIndex(b => b.id === blockId);
  if (idx <= 0) {
    // First block: check if there are following blocks
    if (flat.length > 1) {
      // Delete the first block since there are other blocks
      deleteBlock(blockId);
      return flat[1].id;
    }
    return null;
  }
  const prevId = flat[idx - 1].id;
  deleteBlock(blockId);
  return prevId;
}
