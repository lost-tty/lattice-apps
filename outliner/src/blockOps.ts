// Structural block editing operations: create, indent, outdent, join, remove, move, carry forward.

import type { Block } from './types';
import {
  blockData, saveBlock, deleteBlock, pageData,
  buildTree, flattenTree, getSiblings, nextOrder, orderBetween,
  blockKind, canAcceptChildren, isStructuralBlock, canBeSiblingAt,
} from './db';
import { parseTodoStatus } from './parse';
import { beginUndo, commitUndo } from './undo';

// --- Descendant helpers ---

/** Recursively update pageId on all descendants of a block. */
function updateDescendantPageIds(parentId: string, newPageId: string) {
  for (const b of Object.values(blockData.value)) {
    if (b.parent === parentId) {
      saveBlock({ ...b, pageId: newPageId });
      updateDescendantPageIds(b.id, newPageId);
    }
  }
}

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
    if (target.pageId !== sourcePageId) updateDescendantPageIds(blockId, target.pageId);
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
  if (target.pageId !== sourcePageId) updateDescendantPageIds(blockId, target.pageId);
  fixHeadingSections(target.pageId, target.parent);
  fixHeadingSections(sourcePageId, sourceParent);
}

// --- Block creation ---

/** Default content for a newly created block: an empty bullet. Callers
 *  may pass any markdown (`# H`, bare prose, etc.) — the kind is derived
 *  from the prefix. */
const DEFAULT_NEW_CONTENT = '- ';

/** Create a new block after `afterId`, returns the new block's ID.
 *  If the level contains headings and the new block is not a heading,
 *  it becomes a child of the anchor instead of a sibling. */
export function createBlockAfter(afterId: string, content: string = DEFAULT_NEW_CONTENT): string {
  const after = blockData.value[afterId];
  if (!after) return '';

  const provisional = { content } as Block;
  if (!canBeSiblingAt(provisional, after.pageId, after.parent) && canAcceptChildren(after)) {
    return createChildBlock(afterId, content);
  }

  const siblings = getSiblings(afterId);
  const idx = siblings.findIndex(b => b.id === afterId);
  const next = siblings[idx + 1];
  const order = orderBetween(after.order, next?.order);
  const id = crypto.randomUUID();
  saveBlock({ id, content, pageId: after.pageId, parent: after.parent, order });
  return id;
}

/** Create a new block as the last child of `parentId`. */
export function createChildBlock(parentId: string, content: string = DEFAULT_NEW_CONTENT): string {
  const parent = blockData.value[parentId];
  if (!parent) return '';
  const children = Object.values(blockData.value)
    .filter(b => b.pageId === parent.pageId && b.parent === parentId);
  const id = crypto.randomUUID();
  saveBlock({ id, content, pageId: parent.pageId, parent: parentId, order: nextOrder(children) });
  return id;
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
  // Strip the current block's own bullet prefix before appending so the join
  // doesn't embed `- ` inside the merged bullet.
  const tail = currentContent.startsWith('- ') ? currentContent.slice(2) : currentContent;
  const joinedContent = prevContent + tail;
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

// --- Carry forward ---

/** Read todo status from a block's content, tolerating the bullet prefix
 *  that v2 bullets carry (`"- [ ] task"` → status `'todo'`). */
function blockTodoStatus(content: string): { status: string | null; text: string; syntax: 'checkbox' | 'keyword' | null } {
  const rest = content.startsWith('- ') ? content.slice(2) : content;
  return parseTodoStatus(rest);
}

/** Check if a block or any of its descendants has an incomplete todo. */
export function hasIncompleteTodos(blockId: string): boolean {
  const block = blockData.value[blockId];
  if (!block) return false;
  const { status } = blockTodoStatus(block.content);
  if (status && status !== 'done' && status !== 'cancelled') return true;
  return Object.values(blockData.value)
    .filter(b => b.parent === blockId)
    .some(b => hasIncompleteTodos(b.id));
}

/** Inner carry-forward logic for a single block subtree.
 *  Does NOT manage its own undo group — caller must wrap in beginUndo/commitUndo.
 *
 *  Rules:
 *  - The block must be an incomplete todo, or contain incomplete todo descendants.
 *  - Complete blocks are pruned (skipped along with their entire subtree).
 *  - Incomplete todo children are carried forward (copied to target, source gets link marker).
 *  - Non-todo children of a carried-forward block are moved (deleted from source, created on target).
 *  - Source todo blocks get their status prefix replaced with [[target page title]].
 *  - Non-todo root blocks get [[target page title]] prepended. */
function doCarryForward(
  blockId: string,
  targetPageId: string,
  linkText: string,
  targetOrder: { value: number },
): boolean {
  const block = blockData.value[blockId];
  if (!block) return false;

  const { status } = blockTodoStatus(block.content);
  const isComplete = status === 'done' || status === 'cancelled';
  if (isComplete) return false;
  if (!hasIncompleteTodos(blockId)) return false;

  function walkAndCopy(sourceId: string, targetParent: string | null, isRoot: boolean) {
    const src = blockData.value[sourceId];
    if (!src) return;

    const { status: srcStatus, text: srcText } = blockTodoStatus(src.content);
    const isComplete = srcStatus === 'done' || srcStatus === 'cancelled';
    const isTodo = srcStatus !== null;
    // For bullet blocks, preserve the `- ` prefix when rewriting source content.
    const bulletPrefix = src.content.startsWith('- ') ? '- ' : '';

    if (isComplete) return;

    const newId = crypto.randomUUID();

    const children = Object.values(blockData.value)
      .filter(b => b.pageId === src.pageId && b.parent === sourceId)
      .sort((a, b) => a.order - b.order);

    if (targetParent === null) {
      saveBlock({ id: newId, content: src.content, pageId: targetPageId, parent: null, order: targetOrder.value++, layout: src.layout });
    } else {
      saveBlock({ id: newId, content: src.content, pageId: targetPageId, parent: targetParent, order: src.order, layout: src.layout });
    }

    // Recurse into children before modifying source (deleteBlock would remove descendants)
    for (const child of children) {
      walkAndCopy(child.id, newId, false);
    }

    // Update source block
    if (isTodo) {
      saveBlock({ ...src, content: `${bulletPrefix}${linkText} ${srcText}` });
    } else if (isRoot) {
      saveBlock({ ...src, content: `${bulletPrefix}${linkText} ${src.content.slice(bulletPrefix.length)}` });
    } else {
      const remainingChildren = Object.values(blockData.value)
        .filter(b => b.parent === sourceId && b.pageId === src.pageId);
      for (const child of remainingChildren) {
        saveBlock({ ...child, parent: src.parent });
      }
      deleteBlock(sourceId);
    }
  }

  walkAndCopy(blockId, null, true);
  return true;
}

/** Carry forward a single block (and its eligible subtree) to a target page. */
export function carryForward(blockId: string, targetPageId: string): void {
  const block = blockData.value[blockId];
  if (!block || block.pageId === targetPageId) return;

  const targetPage = pageData.value[targetPageId];
  if (!targetPage) return;

  const targetRoots = Object.values(blockData.value)
    .filter(b => b.pageId === targetPageId && b.parent === null);
  const targetOrder = { value: nextOrder(targetRoots) };

  beginUndo('carry forward');
  doCarryForward(blockId, targetPageId, `[[${targetPage.title}]]`, targetOrder);
  commitUndo();
}

/** Carry forward all incomplete todos from a source page to a target page. */
export function carryForwardAll(sourcePageId: string, targetPageId: string): void {
  const targetPage = pageData.value[targetPageId];
  if (!targetPage) return;

  const roots = Object.values(blockData.value)
    .filter(b => b.pageId === sourcePageId && b.parent === null)
    .sort((a, b) => a.order - b.order);

  const targetRoots = Object.values(blockData.value)
    .filter(b => b.pageId === targetPageId && b.parent === null);
  const targetOrder = { value: nextOrder(targetRoots) };
  const linkText = `[[${targetPage.title}]]`;

  beginUndo('carry forward all');
  for (const root of roots) {
    doCarryForward(root.id, targetPageId, linkText, targetOrder);
  }
  commitUndo();
}
