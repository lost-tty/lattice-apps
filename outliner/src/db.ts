// Lattice Outliner — Data layer
//
// Two prefixes: "page/" and "block/"
// Pages have their own UUID identity; blocks point to pageId.
// Renaming a page is a single Put — no block updates required.
// Demonstrates: List, Put, Delete, subscribe

import { signal, computed } from '@preact/signals';
import type { Store, Page, Block, BlockNode, WatchEvent } from './types';

// --- Encoding ---

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function unwrapList(resp: unknown): { key: Uint8Array; value: Uint8Array }[] {
  if (Array.isArray(resp)) return resp;
  if (resp != null && typeof resp === 'object')
    for (const v of Object.values(resp)) if (Array.isArray(v)) return v;
  return [];
}

// --- Reactive state ---

let store: Store;

export const pageData = signal<Record<string, Page>>({});
export const blockData = signal<Record<string, Block>>({});
export const currentPage = signal<string | null>(null); // stores page ID
export const activeBlockId = signal<string | null>(null);

/** Sorted list of pages. Journals first (newest first), then root pages alphabetically, then other folders. */
export const pageList = computed(() =>
  Object.values(pageData.value).sort((a, b) => {
    const aJ = a.folder === 'journals', bJ = b.folder === 'journals';
    if (aJ && !bJ) return -1;
    if (!aJ && bJ) return 1;
    if (aJ && bJ) return b.title.localeCompare(a.title); // newest journal first
    return a.title.localeCompare(b.title);
  }),
);

// --- Init ---

export async function init(s: Store) {
  store = s;

  const pages: Record<string, Page> = {};
  for (const e of unwrapList(await store.List({ prefix: encode('page/') }))) {
    try {
      const id = decode(e.key).slice(5); // 'page/'.length === 5
      pages[id] = { id, ...JSON.parse(decode(e.value)) };
    } catch (err) { console.warn('[outliner] bad page:', err); }
  }
  pageData.value = pages;

  const blocks: Record<string, Block> = {};
  for (const e of unwrapList(await store.List({ prefix: encode('block/') }))) {
    try {
      const id = decode(e.key).slice(6); // 'block/'.length === 6
      blocks[id] = { id, ...JSON.parse(decode(e.value)) };
    } catch (err) { console.warn('[outliner] bad block:', err); }
  }
  blockData.value = blocks;

  store.subscribe('watch', { prefix: encode('page/') }, (e: WatchEvent) => {
    const id = decode(e.key).slice(5);
    if (e.deleted || !e.value) {
      const { [id]: _, ...rest } = pageData.value;
      pageData.value = rest;
    } else {
      try {
        pageData.value = { ...pageData.value, [id]: { id, ...JSON.parse(decode(e.value)) } };
      } catch (err) { console.warn('[outliner] parse error:', err); }
    }
  });

  store.subscribe('watch', { prefix: encode('block/') }, (e: WatchEvent) => {
    const id = decode(e.key).slice(6);
    if (e.deleted || !e.value) {
      const { [id]: _, ...rest } = blockData.value;
      blockData.value = rest;
    } else {
      try {
        blockData.value = { ...blockData.value, [id]: { id, ...JSON.parse(decode(e.value)) } };
      } catch (err) { console.warn('[outliner] parse error:', err); }
    }
  });
}

// --- Tentative pages ---
// Pages created by navigating to a non-existent tag/link are tentative:
// visible in memory but not written to the store until the user adds content.
const tentativePages = new Set<string>();
const tentativeBlocks = new Set<string>();

export function isTentativePage(pageId: string): boolean {
  return tentativePages.has(pageId);
}

/** Persist a tentative page and its blocks to the store. */
function materializePage(pageId: string) {
  if (!tentativePages.has(pageId)) return;
  tentativePages.delete(pageId);
  const page = pageData.value[pageId];
  if (page) {
    const { id, ...rest } = page;
    store?.Put({ key: encode('page/' + id), value: encode(JSON.stringify(rest)) });
  }
  // Persist any tentative blocks for this page
  for (const blockId of [...tentativeBlocks]) {
    const block = blockData.value[blockId];
    if (block?.pageId === pageId) {
      tentativeBlocks.delete(blockId);
      const { id, ...rest } = block;
      store?.Put({ key: encode('block/' + id), value: encode(JSON.stringify(rest)) });
    }
  }
}

/** Discard a tentative page and its blocks from memory. */
function discardTentativePage(pageId: string) {
  if (!tentativePages.has(pageId)) return;
  tentativePages.delete(pageId);
  // Remove tentative blocks
  const next: Record<string, Block> = {};
  for (const [id, b] of Object.entries(blockData.value)) {
    if (b.pageId === pageId && tentativeBlocks.has(id)) {
      tentativeBlocks.delete(id);
    } else {
      next[id] = b;
    }
  }
  blockData.value = next;
  // Remove page from memory
  const { [pageId]: _, ...restPages } = pageData.value;
  pageData.value = restPages;
}

/** Reset state — for tests. */
export function reset() {
  pageData.value = {};
  blockData.value = {};
  currentPage.value = null;
  activeBlockId.value = null;
  tentativePages.clear();
  tentativeBlocks.clear();
  undoStacks.clear();
  redoStacks.clear();
  activeGroup = null;
  collapsedBlocks.value = new Set();
}

// --- Page CRUD ---

export function savePage(page: Page) {
  const now = new Date().toISOString();
  const saved = { ...page, updatedAt: now };
  pageData.value = { ...pageData.value, [page.id]: saved };
  const { id, ...rest } = saved;
  store?.Put({ key: encode('page/' + id), value: encode(JSON.stringify(rest)) });
}

/** Find or create a page by title. Returns the page ID. */
export function getOrCreatePage(title: string, folder?: string): string {
  const existing = Object.values(pageData.value).find(p => p.title === title);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date().toISOString();
  const resolvedFolder = folder ?? (isJournalSlug(title) ? 'journals' : undefined);
  const page: Page = { id, title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now };
  pageData.value = { ...pageData.value, [id]: page };
  store?.Put({ key: encode('page/' + id), value: encode(JSON.stringify({ title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now })) });
  return id;
}

export async function deletePage(pageId: string) {
  const deletes: Promise<void>[] = [];
  const next: Record<string, Block> = {};
  for (const [id, b] of Object.entries(blockData.value)) {
    if (b.pageId === pageId) deletes.push(store.Delete({ key: encode('block/' + id) }));
    else next[id] = b;
  }
  blockData.value = next;
  deletes.push(store.Delete({ key: encode('page/' + pageId) }));
  const { [pageId]: _, ...restPages } = pageData.value;
  pageData.value = restPages;
  if (currentPage.value === pageId) currentPage.value = null;
  await Promise.all(deletes);
}

// --- Navigation ---

/** Find a page by its slug. Returns the page or undefined. */
export function findPageBySlug(slug: string): Page | undefined {
  return Object.values(pageData.value).find(p => p.slug === slug);
}

/** Navigate to a page by title. Creates the page and a seed block if they don't exist.
 *  New pages are tentative (in-memory only) until the user adds content. */
export function navigateTo(title: string) {
  // Clean up previous tentative page if navigating away without content
  const prev = currentPage.value;
  if (prev && tentativePages.has(prev)) {
    const hasContent = Object.values(blockData.value).some(
      b => b.pageId === prev && b.content.trim() !== '',
    );
    if (!hasContent) discardTentativePage(prev);
  }

  const existing = Object.values(pageData.value).find(p => p.title === title);
  if (existing) {
    // Page exists (persisted or tentative) — just navigate
    const hasBlocks = Object.values(blockData.value).some(b => b.pageId === existing.id);
    if (!hasBlocks) {
      const id = crypto.randomUUID();
      undoRedoInProgress = true;
      saveBlock({ id, content: '', pageId: existing.id, parent: null, order: 0 });
      undoRedoInProgress = false;
      activeBlockId.value = id;
    }
    currentPage.value = existing.id;
    return;
  }

  // Create tentative page (in memory only, no store write)
  const id = crypto.randomUUID();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date().toISOString();
  const folder = isJournalSlug(title) ? 'journals' : undefined;
  const page: Page = { id, title, slug, folder, createdAt: now, updatedAt: now };
  pageData.value = { ...pageData.value, [id]: page };
  tentativePages.add(id);

  // Create tentative seed block (in memory only)
  const blockId = crypto.randomUUID();
  const block: Block = { id: blockId, content: '', pageId: id, parent: null, order: 0, createdAt: now, updatedAt: now };
  blockData.value = { ...blockData.value, [blockId]: block };
  tentativeBlocks.add(blockId);
  activeBlockId.value = blockId;

  currentPage.value = id;
}

/** Navigate to a page by its ID. Creates a seed block if none exist. */
export function navigateById(pageId: string) {
  if (!pageData.value[pageId]) return;
  // Clean up previous tentative page
  const prev = currentPage.value;
  if (prev && prev !== pageId && tentativePages.has(prev)) {
    const hasContent = Object.values(blockData.value).some(
      b => b.pageId === prev && b.content.trim() !== '',
    );
    if (!hasContent) discardTentativePage(prev);
  }
  const hasBlocks = Object.values(blockData.value).some(b => b.pageId === pageId);
  if (!hasBlocks) {
    const id = crypto.randomUUID();
    undoRedoInProgress = true;
    saveBlock({ id, content: '', pageId, parent: null, order: 0 });
    undoRedoInProgress = false;
    activeBlockId.value = id;
  }
  currentPage.value = pageId;
}

// --- Undo / Redo ---
//
// Every mutation to blocks is captured as a patch (before/after snapshots).
// Patches are grouped into undo entries via beginUndo/commitUndo.
// Stacks are persisted to sessionStorage; oldest entries are evicted on quota error.

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

/** Start grouping mutations into a single undo entry. */
export function beginUndo(label: string) {
  if (activeGroup) commitUndo();
  activeGroup = [];
  groupLabel = label;
  groupPageId = currentPage.value ?? '';
}

/** Commit the current group to the undo stack. */
export function commitUndo() {
  if (!activeGroup || activeGroup.length === 0 || !groupPageId) {
    activeGroup = null;
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
}

/** Record a block mutation. Called automatically by saveBlock/deleteBlock. */
function recordPatch(id: string, before: Block | null, after: Block | null) {
  // Skip no-ops: same content, type, parent, order, col
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

let undoRedoInProgress = false;

/** Can undo/redo on the current page? */
export function canUndo(): boolean {
  const pageId = currentPage.value;
  return !!pageId && getUndoStack(pageId).length > 0;
}

export function canRedo(): boolean {
  const pageId = currentPage.value;
  return !!pageId && getRedoStack(pageId).length > 0;
}

/** Apply patches in reverse to undo. */
export function undo() {
  const pageId = currentPage.value;
  if (!pageId) return;
  const stack = getUndoStack(pageId);
  const entry = stack.pop();
  if (!entry) return;
  undoRedoInProgress = true;
  for (let i = entry.patches.length - 1; i >= 0; i--) {
    const { id, before } = entry.patches[i];
    if (before) {
      saveBlock(before);
    } else {
      const next = { ...blockData.value };
      delete next[id];
      blockData.value = next;
      store?.Delete({ key: encode('block/' + id) });
    }
  }
  undoRedoInProgress = false;
  const redo = getRedoStack(pageId);
  redo.push(entry);
  persistStack(pageId, 'undo', stack);
  persistStack(pageId, 'redo', redo);
}

/** Reapply patches to redo. */
export function redo() {
  const pageId = currentPage.value;
  if (!pageId) return;
  const redo = getRedoStack(pageId);
  const entry = redo.pop();
  if (!entry) return;
  undoRedoInProgress = true;
  for (const { id, after } of entry.patches) {
    if (after) {
      saveBlock(after);
    } else {
      const next = { ...blockData.value };
      delete next[id];
      blockData.value = next;
      store?.Delete({ key: encode('block/' + id) });
    }
  }
  undoRedoInProgress = false;
  const stack = getUndoStack(pageId);
  stack.push(entry);
  persistStack(pageId, 'undo', stack);
  persistStack(pageId, 'redo', redo);
}

// --- Block CRUD ---

export function saveBlock(block: Block) {
  const existing = blockData.value[block.id] ?? null;

  // Skip if nothing meaningful changed
  if (existing &&
    existing.content === block.content &&
    existing.type === block.type &&
    existing.parent === block.parent &&
    existing.order === block.order &&
    existing.col === block.col &&
    existing.pageId === block.pageId) return;

  const now = new Date().toISOString();
  const saved = {
    ...block,
    createdAt: block.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!undoRedoInProgress) recordPatch(block.id, existing, saved);
  blockData.value = { ...blockData.value, [block.id]: saved };

  // If this block has content and belongs to a tentative page, materialize it
  if (block.content.trim() !== '' && tentativePages.has(block.pageId)) {
    materializePage(block.pageId);
  }

  // Don't persist tentative blocks (they get persisted via materializePage)
  if (tentativeBlocks.has(block.id)) return;

  const { id, ...rest } = saved;
  store?.Put({ key: encode('block/' + id), value: encode(JSON.stringify(rest)) });
}

export async function deleteBlock(id: string) {
  const toDelete = [id, ...collectDescendants(id)];
  if (!undoRedoInProgress) {
    for (const bid of toDelete) {
      const existing = blockData.value[bid];
      if (existing) recordPatch(bid, existing, null);
    }
  }
  const next: Record<string, Block> = {};
  const deletes: Promise<void>[] = [];
  for (const [bid, b] of Object.entries(blockData.value)) {
    if (toDelete.includes(bid)) deletes.push(store.Delete({ key: encode('block/' + bid) }));
    else next[bid] = b;
  }
  blockData.value = next;
  await Promise.all(deletes);
}

function collectDescendants(parentId: string): string[] {
  const result: string[] = [];
  for (const b of Object.values(blockData.value)) {
    if (b.parent === parentId) {
      result.push(b.id);
      result.push(...collectDescendants(b.id));
    }
  }
  return result;
}

// --- Tree helpers ---

export function buildTree(pageId: string): BlockNode[] {
  const blocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
  return buildSubtree(blocks, null);
}

function buildSubtree(blocks: Block[], parentId: string | null): BlockNode[] {
  return blocks
    .filter(b => b.parent === parentId)
    .sort((a, b) => a.order - b.order)
    .map(b => ({ ...b, children: buildSubtree(blocks, b.id) }));
}

export interface FlatBlock extends BlockNode { depth: number }

export function flattenTree(nodes: BlockNode[], depth: number = 0): FlatBlock[] {
  const result: FlatBlock[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (!collapsedBlocks.value.has(node.id)) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

/** Validate and repair the block tree for a page.
 *  1. Finds blocks with dangling parent references (parent doesn't exist)
 *     and reparents them to root.
 *  2. Walks the flat tree and ensures depth consistency — a block can only
 *     nest one level deeper than the previous deepest block.
 *  Returns the number of blocks repaired. */
export function validateTree(pageId: string): number {
  let repaired = 0;
  undoRedoInProgress = true;

  // Step 1: fix dangling parent references (parent block doesn't exist)
  const allBlocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
  for (const block of allBlocks) {
    if (block.parent && !blockData.value[block.parent]) {
      saveBlock({ ...block, parent: null });
      repaired++;
    }
  }

  // Step 2: validate depth consistency in the (now connected) tree
  const flat = flattenTree(buildTree(pageId));
  const lastAtDepth: (string | null)[] = [null];

  for (const b of flat) {
    const block = blockData.value[b.id];
    if (!block) continue;

    const maxDepth = lastAtDepth.length;
    const effectiveDepth = Math.min(b.depth, maxDepth);
    const correctParent = effectiveDepth > 0 ? (lastAtDepth[effectiveDepth - 1] ?? null) : null;

    if (block.parent !== correctParent) {
      saveBlock({ ...block, parent: correctParent });
      repaired++;
    }

    lastAtDepth[effectiveDepth] = b.id;
    lastAtDepth.length = effectiveDepth + 1;
  }

  undoRedoInProgress = false;
  return repaired;
}

/** Check if a block has children. */
export function hasChildren(blockId: string): boolean {
  return Object.values(blockData.value).some(b => b.parent === blockId);
}

// --- Collapse state (local-only, stored in IndexedDB) ---

export const collapsedBlocks = signal<Set<string>>(new Set());

function loadCollapsed() {
  try {
    const raw = localStorage.getItem('outliner:collapsed');
    if (raw) collapsedBlocks.value = new Set(JSON.parse(raw));
  } catch { /* ignore */ }
}

function persistCollapsed() {
  try {
    localStorage.setItem('outliner:collapsed', JSON.stringify([...collapsedBlocks.value]));
  } catch { /* ignore */ }
}

export function isCollapsed(blockId: string): boolean {
  return collapsedBlocks.value.has(blockId);
}

export function toggleCollapse(blockId: string) {
  const next = new Set(collapsedBlocks.value);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  collapsedBlocks.value = next;
  persistCollapsed();
}

// Load on module init
loadCollapsed();

/** Check if `blockId` is a descendant of `ancestorId`. */
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

// --- Sibling / order helpers ---

export function getSiblings(blockId: string): Block[] {
  const block = blockData.value[blockId];
  if (!block) return [];
  return Object.values(blockData.value)
    .filter(b => b.pageId === block.pageId && b.parent === block.parent)
    .sort((a, b) => a.order - b.order);
}

function nextOrder(siblings: { order: number }[]): number {
  return siblings.reduce((m, s) => Math.max(m, s.order), -1) + 1;
}

function orderBetween(a: number | undefined, b: number | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return b! - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

/** Rebalance sibling orders if they've become too cramped (fractional). */
function maybeRebalance(pageId: string, parent: string | null) {
  const siblings = Object.values(blockData.value)
    .filter(b => b.pageId === pageId && b.parent === parent)
    .sort((a, b) => a.order - b.order);
  if (siblings.length < 2) return;
  for (let i = 1; i < siblings.length; i++) {
    if (Math.abs(siblings[i].order - siblings[i - 1].order) < 1e-8) {
      siblings.forEach((s, idx) => { if (s.order !== idx) saveBlock({ ...s, order: idx }); });
      return;
    }
  }
}

// --- Nesting predicates ---
//
// These predicates form the single source of truth for which blocks can
// nest inside which, and where blocks may be placed as siblings.
//
// All predicates use a permit-based pattern: only explicitly allowed
// combinations return true. Unknown block kinds are denied by default.
//
//  Block kinds (determined at runtime from type + content):
//    bullet    — type is undefined or 'bullet'
//    heading   — type === 'paragraph' AND content starts with #
//    paragraph — type === 'paragraph' AND NOT a heading
//    table     — type === 'table'
//
//  Nesting matrix:
//
//    canAcceptChildren   — which blocks may have children?
//      ✓ bullet          (sub-items in a list)
//      ✓ heading         (section contains its content)
//      ✗ paragraph       (plain text has no sub-items in markdown)
//      ✗ table           (cells are managed internally)
//
//    isStructuralBlock   — which blocks have a fixed depth?
//      ✓ heading         (depth determined by # level, not indentation)
//
//    canBeSiblingAt      — which blocks may live at a given tree level?
//      • If the level contains headings → only headings are permitted
//      • If the level has no headings  → bullets and paragraphs are permitted

type BlockKind = 'bullet' | 'heading' | 'paragraph' | 'table';

/** Convert a block to its single-line markdown representation for editing. */
export function blockToMarkdown(block: Block): string {
  if (block.type === 'paragraph' || block.type === 'table') return block.content;
  return '- ' + block.content;
}

/** Parse a single-line markdown string back into type + content. */
export function markdownToBlock(md: string): { type: 'bullet' | 'paragraph'; content: string } {
  if (md.startsWith('- ') || md.startsWith('* ') || md.startsWith('+ ')) {
    return { type: 'bullet', content: md.slice(2) };
  }
  return { type: 'paragraph', content: md };
}

/** Determine the kind of a block. */
export function blockKind(block: Block): BlockKind {
  if (block.type === 'table') return 'table';
  if (block.type === 'paragraph') {
    return parseHeading(block.content).level ? 'heading' : 'paragraph';
  }
  return 'bullet';
}

/** Can `block` accept children? Permit list: bullet, heading. */
export function canAcceptChildren(block: Block): boolean {
  const kind = blockKind(block);
  return kind === 'bullet' || kind === 'heading';
}

/** Is `block` a structural element whose depth is fixed? Permit list: heading. */
export function isStructuralBlock(block: Block): boolean {
  return blockKind(block) === 'heading';
}

/** Can `block` be placed as a sibling at the given tree level?
 *  - Level with headings: only headings permitted.
 *  - Level without headings: bullets and paragraphs permitted. */
export function canBeSiblingAt(block: Block, pageId: string, parent: string | null): boolean {
  const levelKinds = new Set(
    Object.values(blockData.value)
      .filter(b => b.pageId === pageId && b.parent === parent)
      .map(b => blockKind(b)),
  );
  const kind = blockKind(block);
  if (kind === 'table') return true;
  if (levelKinds.has('heading')) return kind === 'heading';
  return kind === 'bullet' || kind === 'paragraph';
}

// --- Block operations ---

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
  maybeRebalance(after.pageId, after.parent);
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

// --- Table helpers ---

/** A row in a table grid: the shared order value and the cells sorted by col. */
export interface TableRow { order: number; cells: Block[] }

/** Read the 2D grid of a table block. Groups children by order (= row),
 *  sorts rows by order, cells within each row by col. */
export function getTableGrid(tableId: string): TableRow[] {
  const children = Object.values(blockData.value)
    .filter(b => b.parent === tableId);
  const rowMap = new Map<number, Block[]>();
  for (const c of children) {
    const row = rowMap.get(c.order) ?? [];
    row.push(c);
    rowMap.set(c.order, row);
  }
  return [...rowMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([order, cells]) => ({ order, cells: cells.sort((a, b) => (a.col ?? 0) - (b.col ?? 0)) }));
}

/** Create a table block from a 2D array of cell strings. Returns the table block ID. */
export function createTable(
  afterId: string,
  rows: string[][],
): string {
  const after = blockData.value[afterId];
  if (!after) return '';
  const siblings = getSiblings(afterId);
  const idx = siblings.findIndex(b => b.id === afterId);
  const next = siblings[idx + 1];
  const tableOrder = orderBetween(after.order, next?.order);
  const tableId = crypto.randomUUID();
  saveBlock({ id: tableId, content: '', pageId: after.pageId, parent: after.parent, order: tableOrder, type: 'table' });

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const id = crypto.randomUUID();
      saveBlock({ id, content: rows[r][c], pageId: after.pageId, parent: tableId, order: r, col: c });
    }
  }

  maybeRebalance(after.pageId, after.parent);
  return tableId;
}

/** Insert a new row into a table. Returns the IDs of the new cells. */
export function insertTableRow(tableId: string, afterRowOrder?: number): string[] {
  const grid = getTableGrid(tableId);
  const table = blockData.value[tableId];
  if (!table) return [];

  const colCount = grid.length > 0 ? grid[0].cells.length : 1;
  const colOrders = grid.length > 0 ? grid[0].cells.map(c => c.col ?? 0) : [0];

  let rowOrder: number;
  if (afterRowOrder == null) {
    // Append at end
    rowOrder = grid.length > 0 ? grid[grid.length - 1].order + 1 : 0;
  } else {
    const idx = grid.findIndex(r => r.order === afterRowOrder);
    const nextRow = grid[idx + 1];
    rowOrder = orderBetween(afterRowOrder, nextRow?.order);
  }

  const ids: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const id = crypto.randomUUID();
    saveBlock({ id, content: '', pageId: table.pageId, parent: tableId, order: rowOrder, col: colOrders[c] });
    ids.push(id);
  }
  return ids;
}

/** Insert a new column into a table. Returns the IDs of the new cells. */
export function insertTableCol(tableId: string, afterColOrder?: number): string[] {
  const grid = getTableGrid(tableId);
  const table = blockData.value[tableId];
  if (!table) return [];

  let colOrder: number;
  if (afterColOrder == null) {
    // Append at right
    const maxCol = grid.length > 0
      ? Math.max(...grid[0].cells.map(c => c.col ?? 0))
      : -1;
    colOrder = maxCol + 1;
  } else {
    // Find next col order across any row
    const allCols = grid.length > 0 ? grid[0].cells.map(c => c.col ?? 0).sort((a, b) => a - b) : [];
    const idx = allCols.indexOf(afterColOrder);
    const nextCol = allCols[idx + 1];
    colOrder = orderBetween(afterColOrder, nextCol);
  }

  const ids: string[] = [];
  for (const row of grid) {
    const id = crypto.randomUUID();
    saveBlock({ id, content: '', pageId: table.pageId, parent: tableId, order: row.order, col: colOrder });
    ids.push(id);
  }
  return ids;
}

/** Move a table row to a new position (before or after a target row). */
export function reorderTableRow(
  tableId: string,
  fromRowOrder: number,
  targetRowOrder: number,
  position: 'before' | 'after',
) {
  if (fromRowOrder === targetRowOrder) return;
  const grid = getTableGrid(tableId);
  const targetIdx = grid.findIndex(r => r.order === targetRowOrder);
  if (targetIdx < 0) return;

  let newOrder: number;
  if (position === 'before') {
    const prev = grid[targetIdx - 1];
    newOrder = orderBetween(prev?.order, targetRowOrder);
  } else {
    const next = grid[targetIdx + 1];
    newOrder = orderBetween(targetRowOrder, next?.order);
  }

  // Update all cells in the source row
  const cells = Object.values(blockData.value)
    .filter(b => b.parent === tableId && b.order === fromRowOrder);
  for (const cell of cells) {
    saveBlock({ ...cell, order: newOrder });
  }
}

/** Move a table column to a new position (before or after a target column). */
export function reorderTableCol(
  tableId: string,
  fromCol: number,
  targetCol: number,
  position: 'before' | 'after',
) {
  if (fromCol === targetCol) return;
  const grid = getTableGrid(tableId);
  if (grid.length === 0) return;
  const colOrders = grid[0].cells.map(c => c.col ?? 0);
  const targetIdx = colOrders.indexOf(targetCol);
  if (targetIdx < 0) return;

  let newCol: number;
  if (position === 'before') {
    const prev = colOrders[targetIdx - 1];
    newCol = orderBetween(prev, targetCol);
  } else {
    const next = colOrders[targetIdx + 1];
    newCol = orderBetween(targetCol, next);
  }

  // Update all cells in the source column
  const cells = Object.values(blockData.value)
    .filter(b => b.parent === tableId && (b.col ?? 0) === fromCol);
  for (const cell of cells) {
    saveBlock({ ...cell, col: newCol });
  }
}

/** Delete a table row (all cells with the given order). */
export function deleteTableRow(tableId: string, rowOrder: number): void {
  const cells = Object.values(blockData.value)
    .filter(b => b.parent === tableId && b.order === rowOrder);
  for (const cell of cells) deleteBlock(cell.id);
  // If no rows left, delete the table block itself
  const remaining = Object.values(blockData.value).filter(b => b.parent === tableId);
  if (remaining.length === 0) deleteBlock(tableId);
}

/** Delete a table column (all cells with the given col value). */
export function deleteTableCol(tableId: string, colOrder: number): void {
  const cells = Object.values(blockData.value)
    .filter(b => b.parent === tableId && (b.col ?? 0) === colOrder);
  for (const cell of cells) deleteBlock(cell.id);
  // If no cols left, delete the table block itself
  const remaining = Object.values(blockData.value).filter(b => b.parent === tableId);
  if (remaining.length === 0) deleteBlock(tableId);
}

// --- Paste helpers ---

/** Parse pasted text into a flat list of content+depth items.
 *  Handles CommonMark-style bullet lists with continuation lines,
 *  headings, tables, and plain paragraphs.
 *  Blank lines act as paragraph separators (never produce empty blocks).
 *  Depths are normalised so the shallowest line = 0. */
export type ParsedItem = {
  content: string;
  relativeDepth: number;
  type: 'bullet' | 'paragraph' | 'table-row';
  cells?: string[];   // populated for table-row items
};

export function parseMarkdownToItems(text: string): ParsedItem[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];

  const result: Array<{ content: string; depth: number; type: 'bullet' | 'paragraph' | 'table-row'; cells?: string[] }> = [];
  // -1 = no heading seen yet; unindented bullets start at depth 0
  let headingDepth = -1;
  // Sorted unique indent values seen in the current heading section
  let bulletIndents: number[] = [];
  // Track the last bullet for continuation lines
  let lastBulletDepth = -1;
  let lastBulletContentCol = 0;  // column where content starts (indent + "- ".length)
  let afterBlankLine = false;

  for (const line of lines) {
    // Blank lines: never produce blocks, but mark a paragraph break
    if (line.trim() === '') {
      afterBlankLine = true;
      continue;
    }

    // Horizontal rule: --- resets all nesting context
    if (line.trim() === '---') {
      headingDepth = -1;
      bulletIndents = [];
      lastBulletDepth = -1;
      afterBlankLine = false;
      result.push({ content: '---', type: 'paragraph', depth: 0 });
      continue;
    }

    // Table row: | ... | (skip separator rows like |---|---|)
    if (isTableRow(line.trim())) {
      if (isTableSeparator(line.trim())) continue; // drop separator — it's structural, not content
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      result.push({ content: line.trim(), type: 'table-row', cells, depth: headingDepth + 1 });
      afterBlankLine = false;
      continue;
    }

    // Heading: # through ######
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      headingDepth = hm[1].length - 1;   // # → 0, ## → 1, ### → 2 …
      bulletIndents = [];                 // fresh indent context for this section
      lastBulletDepth = -1;
      afterBlankLine = false;
      result.push({ content: line.trim(), type: 'paragraph', depth: headingDepth });
      continue;
    }

    // Bullet: -, *, or + with optional leading whitespace
    const bm = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bm) {
      const indent = bm[1].length;
      if (!bulletIndents.includes(indent)) {
        bulletIndents.push(indent);
        bulletIndents.sort((a, b) => a - b);
      }
      const indentRank = bulletIndents.indexOf(indent);
      const depth = headingDepth + 1 + indentRank;
      lastBulletDepth = depth;
      lastBulletContentCol = indent + 2;  // "- " is 2 chars
      afterBlankLine = false;
      result.push({ content: bm[2], type: 'bullet', depth });
      continue;
    }

    // Plain text — joins with the previous block (no blank line) or starts a
    // new paragraph (after a blank line).  Only structural markers (- # --- |)
    // can start new blocks; plain text never splits on newlines alone.
    if (!afterBlankLine && result.length > 0) {
      // Continuation: append to the previous block's content
      result[result.length - 1].content += '\n' + line.trim();
      continue;
    }

    // After a blank line: indented text stays in the bullet context
    if (lastBulletDepth >= 0) {
      const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (lineIndent >= lastBulletContentCol) {
        result.push({ content: line.trim(), type: 'paragraph', depth: lastBulletDepth + 1 });
        afterBlankLine = false;
        continue;
      }
    }

    // Standalone paragraph — breaks out of any bullet context
    lastBulletDepth = -1;
    afterBlankLine = false;
    result.push({ content: line.trim(), type: 'paragraph', depth: headingDepth + 1 });
  }

  if (result.length === 0) return [];
  const minDepth = Math.min(...result.map(r => r.depth));
  return result.map(r => ({
    content: r.content,
    relativeDepth: r.depth - minDepth,
    type: r.type,
    ...(r.cells ? { cells: r.cells } : {}),
  }));
}

/** Insert a list of blocks immediately after `afterId`, preserving relative
 *  nesting.  relativeDepth 0 = sibling of afterId; 1 = child of the nearest
 *  depth-0 block; etc.  Returns the ID of the last inserted block.
 *  Consecutive table-row items are merged into a single table block with cell children. */
export function insertBlocksAfter(
  afterId: string,
  items: Array<{ content: string; relativeDepth: number; type?: 'bullet' | 'paragraph' | 'table-row'; cells?: string[] }>,
): string {
  if (items.length === 0) return afterId;
  const anchor = blockData.value[afterId];
  if (!anchor) return afterId;

  const pageId = anchor.pageId;
  const siblings = getSiblings(afterId);
  const anchorIdx = siblings.findIndex(b => b.id === afterId);
  const anchorNextOrder = siblings[anchorIdx + 1]?.order; // upper bound for depth-0 slots

  // prevAtDepth[d] = {id, order} of the most recently inserted block at relative depth d.
  // Seed depth-0 with the anchor so the first depth-0 item slots in after it.
  const prevAtDepth: Record<number, { id: string; order: number }> = {
    0: { id: afterId, order: anchor.order },
  };

  let lastId = afterId;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Group consecutive table rows into a single table block
    if (item.type === 'table-row' && item.cells) {
      const rows: string[][] = [];
      let j = i;
      while (j < items.length && items[j].type === 'table-row' && items[j].cells) {
        rows.push(items[j].cells!);
        j++;
      }
      // Insert table block at the current depth
      const d = item.relativeDepth;
      const tableId = crypto.randomUUID();
      if (d === 0) {
        const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
        saveBlock({ id: tableId, content: '', pageId, parent: anchor.parent, order, type: 'table' });
        prevAtDepth[0] = { id: tableId, order };
      } else {
        const parentEntry = prevAtDepth[d - 1];
        if (!parentEntry) { i = j - 1; continue; }
        const children = Object.values(blockData.value)
          .filter(b => b.pageId === pageId && b.parent === parentEntry.id);
        const order = nextOrder(children);
        saveBlock({ id: tableId, content: '', pageId, parent: parentEntry.id, order, type: 'table' });
        prevAtDepth[d] = { id: tableId, order };
      }
      // Create cell blocks
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const cellId = crypto.randomUUID();
          saveBlock({ id: cellId, content: rows[r][c], pageId, parent: tableId, order: r, col: c });
        }
      }
      lastId = tableId;
      i = j - 1; // skip consumed rows
      continue;
    }

    const d = item.relativeDepth;
    const id = crypto.randomUUID();

    const type = item.type ?? 'bullet';

    if (d === 0) {
      const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
      saveBlock({ id, content: item.content, pageId, parent: anchor.parent, order, type });
      prevAtDepth[0] = { id, order };
    } else {
      const parentEntry = prevAtDepth[d - 1];
      if (!parentEntry) continue; // malformed relative depth — skip
      const children = Object.values(blockData.value)
        .filter(b => b.pageId === pageId && b.parent === parentEntry.id);
      const order = nextOrder(children);
      saveBlock({ id, content: item.content, pageId, parent: parentEntry.id, order, type });
      prevAtDepth[d] = { id, order };
    }

    // Invalidate deeper tracking when stepping back to a shallower level
    for (const k in prevAtDepth) if (Number(k) > d) delete prevAtDepth[Number(k)];

    lastId = id;
  }

  maybeRebalance(pageId, anchor.parent);
  return lastId;
}

// --- Import / Export ---

/** Serialise a page as an indented Markdown bullet list. Each block becomes
 *  one `- content` line, indented 2 spaces per depth level.
 *  Collapsed state and timestamps are not preserved (see importPage). */
export function exportPage(pageId: string): string {
  const flat = flattenTree(buildTree(pageId));
  let headingDepth = 0; // depth offset introduced by the current heading section
  const isStructural = (c: string) => /^#{1,6} /.test(c) || c === '---';
  // Collect table block IDs so we can skip their cell children in the flat list
  const tableCellIds = new Set<string>();
  const lines: string[] = [];
  // Track previous block kind to insert blank lines at type transitions
  let prevKind: 'bullet' | 'paragraph' | 'structural' | 'table' | null = null;
  // Track the deepest valid bullet export depth in the current section.
  // A bullet can only nest at maxBulletDepth + 1; orphans are clamped.
  let maxBulletDepth = -1;

  for (let i = 0; i < flat.length; i++) {
    const b = flat[i];

    // Skip cells — they were already exported with their table parent
    if (tableCellIds.has(b.id)) continue;

    if (b.type === 'table') {
      if (prevKind && prevKind !== 'structural') lines.push('');
      const grid = getTableGrid(b.id);
      for (const cell of grid.flatMap(r => r.cells)) tableCellIds.add(cell.id);
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        lines.push('| ' + row.cells.map(c => c.content).join(' | ') + ' |');
        if (r === 0) {
          lines.push('| ' + row.cells.map(() => '---').join(' | ') + ' |');
        }
      }
      prevKind = 'table';
      maxBulletDepth = -1; // tables break bullet nesting context
      continue;
    }

    if (isStructural(b.content)) {
      if (lines.length > 0) lines.push('');
      headingDepth = b.depth + 1;
      lines.push(b.content);
      // Blank line after heading/HR when followed by non-structural content
      const next = flat[i + 1];
      if (next && !tableCellIds.has(next.id) && !isStructural(next.content)) {
        lines.push('');
      }
      prevKind = 'structural';
      maxBulletDepth = -1; // structural elements reset bullet nesting
      continue;
    }

    if (b.type === 'paragraph') {
      // Empty paragraph blocks export as blank line separators
      if (b.content === '') {
        if (prevKind) lines.push('');
        prevKind = null; // reset — blank line already emitted
        continue;
      }
      // Blank line before paragraph if it follows a bullet, table, or another paragraph
      if (prevKind === 'bullet' || prevKind === 'paragraph' || prevKind === 'table') {
        lines.push('');
      }
      const indent = '  '.repeat(Math.max(0, b.depth - headingDepth));
      for (const cl of b.content.split('\n')) {
        lines.push(`${indent}${cl}`);
      }
      prevKind = 'paragraph';
      maxBulletDepth = -1; // paragraphs break bullet nesting context
    } else {
      // Bullet — blank line if previous was a paragraph
      if (prevKind === 'paragraph' || prevKind === 'table') {
        lines.push('');
      }
      // Clamp depth: a bullet can only nest one level deeper than the
      // deepest bullet exported so far. Orphan children collapse upward.
      // This ensures the exported markdown is valid CommonMark nesting.
      const rawDepth = b.depth - headingDepth;
      const bulletDepth = Math.min(rawDepth, maxBulletDepth + 1);
      maxBulletDepth = bulletDepth;
      const prefix = '  '.repeat(Math.max(0, bulletDepth));
      const contentLines = b.content.split('\n');
      lines.push(`${prefix}- ${contentLines[0]}`);
      for (let j = 1; j < contentLines.length; j++) {
        lines.push(`${prefix}  ${contentLines[j]}`);
      }
      prevKind = 'bullet';
    }
  }
  return lines.join('\n');
}

/** Export all pages as an array of {path, content} entries suitable for zipping.
 *  Journals go into journals/ subfolder, other pages into pages/. */
export function exportAllPages(): Array<{ path: string; content: string }> {
  return pageList.value.map(page => {
    const folder = page.folder === 'journals' ? 'journals' : 'pages';
    const filename = `${page.slug}.md`;
    return { path: `${folder}/${filename}`, content: exportPage(page.id) };
  });
}

/** Import a set of {path, content} entries (as produced by parseTar / exportAllPages).
 *  Derives the page title from the filename (without extension).
 *  Folder is inferred from the path: journals/ → 'journals', otherwise none. */
export function importAllPages(files: Array<{ path: string; content: string }>): void {
  for (const file of files) {
    // "journals/2026-03-27.md" → title "2026-03-27", folder "journals"
    // "pages/my-notes.md"     → title "my-notes",    folder undefined
    const parts = file.path.split('/');
    const basename = parts[parts.length - 1].replace(/\.md$/, '');
    const folder = parts.length > 1 && parts[0] === 'journals' ? 'journals' : undefined;
    const pageId = getOrCreatePage(basename, folder);
    importPage(pageId, file.content);
  }
}

/** Replace all blocks on a page with the content of an indented Markdown
 *  bullet list produced by exportPage.  Nesting, order, and inline content
 *  are fully restored; collapsed state and timestamps are not. */
export function importPage(pageId: string, markdown: string): void {
  // Delete existing content (cascade handles children, so root blocks suffice)
  Object.values(blockData.value)
    .filter(b => b.pageId === pageId && b.parent === null)
    .forEach(b => deleteBlock(b.id));

  // Use parseMarkdownToItems so headings, ---, and bullets all get consistent
  // relative depths, then insert blocks based on those depths.
  const items = parseMarkdownToItems(markdown);

  const lastIdAtDepth: string[] = [];
  const orderAtDepth: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const { content, relativeDepth: depth, type, cells } = items[i];

    // Group consecutive table rows into a table block
    if (type === 'table-row' && cells) {
      const rows: string[][] = [];
      let j = i;
      while (j < items.length && items[j].type === 'table-row' && items[j].cells) {
        rows.push(items[j].cells!);
        j++;
      }
      const parent = depth > 0 ? (lastIdAtDepth[depth - 1] ?? null) : null;
      if (orderAtDepth[depth] === undefined) orderAtDepth[depth] = 0;
      const tableId = crypto.randomUUID();
      saveBlock({ id: tableId, content: '', pageId, parent, order: orderAtDepth[depth], type: 'table' });
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const cellId = crypto.randomUUID();
          saveBlock({ id: cellId, content: rows[r][c], pageId, parent: tableId, order: r, col: c });
        }
      }
      lastIdAtDepth[depth] = tableId;
      lastIdAtDepth.length = depth + 1;
      orderAtDepth[depth]++;
      orderAtDepth.length = depth + 1;
      i = j - 1;
      continue;
    }

    const parent = depth > 0 ? (lastIdAtDepth[depth - 1] ?? null) : null;
    if (orderAtDepth[depth] === undefined) orderAtDepth[depth] = 0;
    const id = crypto.randomUUID();
    saveBlock({ id, content, pageId, parent, order: orderAtDepth[depth], type: type ?? 'bullet' });
    lastIdAtDepth[depth] = id;
    lastIdAtDepth.length = depth + 1;
    orderAtDepth[depth]++;
    orderAtDepth.length = depth + 1;
  }

  // Safety net: repair any orphan parent references that slipped through
  validateTree(pageId);
}

// --- Content rendering ---

export function parseWikiLinks(text: string): Array<string | { page: string }> {
  const parts: Array<string | { page: string }> = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ page: match[1] });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Check if block content is a table separator row (|---|---|). */
export function isTableSeparator(text: string): boolean {
  return /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(text.trim());
}

/** Check if block content is a table row (| ... | ... |). */
export function isTableRow(text: string): boolean {
  const t = text.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}

/** Parse a table row into its cell contents. Returns null if not a table row. */
export function parseTableCells(text: string): string[] | null {
  if (!isTableRow(text) || isTableSeparator(text)) return null;
  return text.trim().slice(1, -1).split('|').map(c => c.trim());
}

/** Render block content to HTML with markdown, wiki links, and tags. */
export function renderContent(text: string): string {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Extract code spans first (protect inner content from formatting)
  const codes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\x00C${codes.length - 1}\x00`;
  });

  // Markdown checkboxes — blocks already have a visual bullet, so no leading hyphen needed
  html = html.replace(/^\[([ xX])\] /, (_, state) =>
    `<span class="md-checkbox${state !== ' ' ? ' checked' : ''}"></span> `,
  );

  html = html.replace(/(^|\s)#\[\[([^\]]+)\]\]/g, '$1<span class="tag" data-page="$2">#$2</span>');
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link" data-page="$1">$1</span>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="hyperlink" href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/(^|\s)#(\w[\w\-/]*)(?=\s|$)/g, '$1<span class="tag" data-page="$2">#$2</span>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/==(.+?)==(?:\[\.hl-(\d+)\])?/g, (_, text, n) =>
    n ? `<mark class="hl-${n}">${text}</mark>` : `<mark>${text}</mark>`,
  );

  // Protect existing <a> and <span> tags from bare-URL matching, then auto-link bare URLs.
  const tags: string[] = [];
  html = html.replace(/<[^>]+>/g, (tag) => { tags.push(tag); return `\x00T${tags.length - 1}\x00`; });
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a class="hyperlink" href="$2" target="_blank" rel="noopener">$2</a>');
  html = html.replace(/\x00T(\d+)\x00/g, (_, i) => tags[parseInt(i)]);

  html = html.replace(/\x00C(\d+)\x00/g, (_, i) => `<code>${codes[parseInt(i)]}</code>`);

  return html;
}



/** Toggle a markdown checkbox prefix: `[ ]` ↔ `[x]` */
export function toggleCheckbox(content: string): string {
  if (/^\[ \] /.test(content)) return content.replace(/^\[ \] /, '[x] ');
  if (/^\[[xX]\] /.test(content)) return content.replace(/^\[[xX]\] /, '[ ] ');
  return content;
}

/** Extract a Markdown heading prefix (# through ######) from block content.
 *  Returns the heading level (1–6) and the text after the prefix, or level null
 *  if the content does not start with a heading marker. */
export function parseHeading(content: string): { level: number | null; text: string } {
  const m = content.match(/^(#{1,6}) (.+)/);
  if (!m) return { level: null, text: content };
  return { level: m[1].length, text: m[2] };
}

/** Extract TODO/DOING/DONE status from block content prefix. */
const TODO_KEYWORDS = ['TODO', 'DOING', 'NOW', 'LATER', 'WAIT', 'DONE', 'CANCELLED'];
const TODO_REGEX = new RegExp(`^(${TODO_KEYWORDS.join('|')}) `);

export function parseTodoStatus(content: string): { status: string | null; text: string } {
  const match = content.match(TODO_REGEX);
  if (!match) return { status: null, text: content };
  // Normalise NOW → doing, CANCELLED → cancelled, etc.
  const raw = match[1].toLowerCase();
  const status = raw === 'now' ? 'doing' : raw;
  return { status, text: content.slice(match[0].length) };
}

/** Cycle TODO status: none → TODO → DOING → DONE → none (primary cycle).
 *  LATER, WAIT, NOW, CANCELLED are accepted on input but cycle forward to
 *  the next primary state. */
export function cycleTodoStatus(content: string): string {
  const { status, text } = parseTodoStatus(content);
  const next: Record<string, string> = {
    todo: 'DOING', doing: 'DONE', done: 'CANCELLED', cancelled: '',
    later: 'DOING', wait: 'DOING',
  };
  if (!status) return `TODO ${content}`;
  const prefix = next[status] ?? '';
  return prefix ? `${prefix} ${text}` : text;
}

/** Find all blocks on other pages that reference this page by wiki link or #tag.
 *  Returns each referencing block with its children flattened (depth relative to the ref block). */
export function getBacklinks(pageId: string): { block: Block; children: FlatBlock[] }[] {
  const page = pageData.value[pageId];
  if (!page) return [];
  const wikiPattern = `[[${page.title}]]`;
  const multiWordTag = `#[[${page.title}]]`;
  const refBlocks = Object.values(blockData.value)
    .filter(b => b.pageId !== pageId && (
      b.content.includes(wikiPattern) ||
      b.content.includes(multiWordTag) ||
      (/^\w[\w\-/]*$/.test(page.title) && new RegExp(`(^|\\s)#${escapeRegex(page.title)}(?=\\s|$)`).test(b.content))
    ));
  return refBlocks.map(block => {
    const allBlocks = Object.values(blockData.value).filter(b => b.pageId === block.pageId);
    const childTree = buildSubtree(allBlocks, block.id);
    const children = flattenTree(childTree, 1);
    return { block, children };
  });
}

/** Collect all tags used across all blocks, with their occurrence count.
 *  Case-insensitive dedup: merges counts, keeps the most-used casing. */
export function getTagCounts(): { tag: string; count: number }[] {
  // First pass: count each exact tag
  const exact = new Map<string, number>();
  const multiWordRe = /(^|\s)#\[\[([^\]]+)\]\]/g;
  const singleWordRe = /(^|\s)#(\w[\w\-/]*)(?=\s|$)/g;
  for (const block of Object.values(blockData.value)) {
    let m;
    multiWordRe.lastIndex = 0;
    while ((m = multiWordRe.exec(block.content))) {
      exact.set(m[2], (exact.get(m[2]) ?? 0) + 1);
    }
    singleWordRe.lastIndex = 0;
    while ((m = singleWordRe.exec(block.content))) {
      exact.set(m[2], (exact.get(m[2]) ?? 0) + 1);
    }
  }
  // Second pass: merge case-insensitively, keep the casing with highest count
  const merged = new Map<string, { tag: string; count: number }>();
  for (const [tag, count] of exact) {
    const key = tag.toLowerCase();
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { tag, count });
    } else {
      prev.count += count;
      if (count > (exact.get(prev.tag) ?? 0)) prev.tag = tag;
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}

/** Return the folder a page belongs to, or undefined for root pages. */
export function pageFolder(pageId: string): string | undefined {
  return pageData.value[pageId]?.folder;
}

// --- Journal helpers ---

export function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isJournalSlug(slug: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(slug);
}

export function formatJournalTitle(slug: string): string {
  const d = new Date(slug + 'T00:00:00');
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** All journal pages, sorted newest first. */
export function getJournalPages(): Page[] {
  return Object.values(pageData.value)
    .filter(p => p.folder === 'journals')
    .sort((a, b) => b.title.localeCompare(a.title));
}

/** Is this page a journal page? */
export function isJournalPage(pageId: string): boolean {
  return pageData.value[pageId]?.folder === 'journals';
}

/** Return a human-readable title for a page ID. */
export function pageTitle(pageId: string): string {
  const page = pageData.value[pageId];
  if (!page) return pageId;
  return isJournalSlug(page.title) ? formatJournalTitle(page.title) : page.title;
}
