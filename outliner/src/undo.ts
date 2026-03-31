// Undo/redo system.
//
// Every block mutation is captured as a patch (before/after snapshot).
// Patches are grouped into undo entries via beginUndo/commitUndo.
// Stacks are persisted to sessionStorage per page.

import type { Block } from './types';
import { currentPage, blockData, saveBlock, registerUndoHooks, setUndoSuppressed, purgeBlock, beginBatch, flushBatch } from './db';

type Patch = { id: string; before: Block | null; after: Block | null };
type UndoEntry = { label: string; patches: Patch[] };

const MAX_UNDO = 200;

const hasSessionStorage = typeof sessionStorage !== 'undefined';

function storageKey(pageId: string, type: 'undo' | 'redo') {
  return `outliner:${type}:${pageId}`;
}

function loadStack(pageId: string, type: 'undo' | 'redo'): UndoEntry[] {
  if (!hasSessionStorage) return [];
  try {
    const raw = sessionStorage.getItem(storageKey(pageId, type));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistStack(pageId: string, type: 'undo' | 'redo', stack: UndoEntry[]) {
  if (!hasSessionStorage) return;
  const key = storageKey(pageId, type);
  const json = JSON.stringify(stack);
  while (true) {
    try {
      sessionStorage.setItem(key, json);
      return;
    } catch {
      if (stack.length > 1) {
        stack.shift();
      } else {
        try { sessionStorage.removeItem(key); } catch {}
        return;
      }
    }
  }
}

// Per-page stacks, lazily loaded
const undoStacks = new Map<string, UndoEntry[]>();
const redoStacks = new Map<string, UndoEntry[]>();

function getUndoStack(pageId: string): UndoEntry[] {
  if (!undoStacks.has(pageId)) undoStacks.set(pageId, loadStack(pageId, 'undo'));
  return undoStacks.get(pageId)!;
}

function getRedoStack(pageId: string): UndoEntry[] {
  if (!redoStacks.has(pageId)) redoStacks.set(pageId, loadStack(pageId, 'redo'));
  return redoStacks.get(pageId)!;
}

let activeGroup: Patch[] | null = null;
let groupLabel = '';
let groupPageId = '';

/** Record a block mutation. Called via the patch hook from saveBlock/deleteBlock. */
function recordPatch(id: string, before: Block | null, after: Block | null) {
  if (before && after &&
    before.content === after.content &&
    before.type === after.type &&
    before.parent === after.parent &&
    before.order === after.order &&
    before.col === after.col) return;
  const pageId = before?.pageId ?? (after as Block).pageId;
  if (!activeGroup) {
    const stack = getUndoStack(pageId);
    stack.push({ label: 'edit', patches: [{ id, before, after }] });
    if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
    const redo = getRedoStack(pageId);
    redo.length = 0;
    persistStack(pageId, 'undo', stack);
    persistStack(pageId, 'redo', redo);
    return;
  }
  activeGroup.push({ id, before, after });
}

// --- Public API ---

/** Start grouping mutations into a single undo entry. */
export function beginUndo(label: string) {
  if (activeGroup) commitUndo();
  activeGroup = [];
  groupLabel = label;
  groupPageId = currentPage.value ?? '';
  beginBatch();
}

/** Commit the current group to the undo stack and flush store ops. */
export function commitUndo() {
  if (!activeGroup || activeGroup.length === 0 || !groupPageId) {
    activeGroup = null;
    flushBatch();
    return;
  }
  const stack = getUndoStack(groupPageId);
  stack.push({ label: groupLabel, patches: activeGroup });
  if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
  const redo = getRedoStack(groupPageId);
  redo.length = 0;
  persistStack(groupPageId, 'undo', stack);
  persistStack(groupPageId, 'redo', redo);
  activeGroup = null;
  flushBatch();
}

export function canUndo(): boolean {
  const pageId = currentPage.value;
  return !!pageId && getUndoStack(pageId).length > 0;
}

export function canRedo(): boolean {
  const pageId = currentPage.value;
  return !!pageId && getRedoStack(pageId).length > 0;
}

export function undo() {
  const pageId = currentPage.value;
  if (!pageId) return;
  const stack = getUndoStack(pageId);
  const entry = stack.pop();
  if (!entry) return;
  setUndoSuppressed(true);
  beginBatch();
  for (let i = entry.patches.length - 1; i >= 0; i--) {
    const { id, before } = entry.patches[i];
    if (before) {
      saveBlock(before);
    } else {
      purgeBlock(id);
    }
  }
  flushBatch();
  setUndoSuppressed(false);
  const redo = getRedoStack(pageId);
  redo.push(entry);
  persistStack(pageId, 'undo', stack);
  persistStack(pageId, 'redo', redo);
}

export function redo() {
  const pageId = currentPage.value;
  if (!pageId) return;
  const redoStack = getRedoStack(pageId);
  const entry = redoStack.pop();
  if (!entry) return;
  setUndoSuppressed(true);
  beginBatch();
  for (const { id, after } of entry.patches) {
    if (after) {
      saveBlock(after);
    } else {
      purgeBlock(id);
    }
  }
  flushBatch();
  setUndoSuppressed(false);
  const stack = getUndoStack(pageId);
  stack.push(entry);
  persistStack(pageId, 'undo', stack);
  persistStack(pageId, 'redo', redoStack);
}

// --- Hook registration ---
// Wire into db.ts's saveBlock/deleteBlock at module load time.

registerUndoHooks(
  recordPatch,
  () => { undoStacks.clear(); redoStacks.clear(); activeGroup = null; },
);
