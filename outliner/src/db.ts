// Lattice Outliner — Data layer
//
// Core state, initialization, page/block CRUD, undo/redo, tree helpers,
// ordering, nesting predicates, collapse, backlinks, and journal helpers.

import { signal, computed } from '@preact/signals';
import type { Store, StoreOp, Page, Block, BlockNode, WatchEvent } from './types';
import { parseHeading, isJournalSlug, formatJournalTitle } from './parse';

// --- Encoding ---

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  for (const e of (await store.List({ prefix: encode('page/') })).items) {
    try {
      const id = decode(e.key).slice(5); // 'page/'.length === 5
      pages[id] = { id, ...JSON.parse(decode(e.value)) };
    } catch (err) { console.warn('[outliner] bad page:', err); }
  }
  pageData.value = pages;

  const blocks: Record<string, Block> = {};
  for (const e of (await store.List({ prefix: encode('block/') })).items) {
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
    emitPut(encode('page/' + id), encode(JSON.stringify(rest)));
  }
  // Persist any tentative blocks for this page
  for (const blockId of [...tentativeBlocks]) {
    const block = blockData.value[blockId];
    if (block?.pageId === pageId) {
      tentativeBlocks.delete(blockId);
      const { id, ...rest } = block;
      emitPut(encode('block/' + id), encode(JSON.stringify(rest)));
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
  collapsedBlocks.value = new Set();
  if (resetHook) resetHook();
}

// --- Page CRUD ---

export function savePage(page: Page) {
  const now = new Date().toISOString();
  const saved = { ...page, updatedAt: now };
  pageData.value = { ...pageData.value, [page.id]: saved };
  const { id, ...rest } = saved;
  emitPut(encode('page/' + id), encode(JSON.stringify(rest)));
}

/** Find or create a page by title. Returns the page ID. */
export function getOrCreatePage(title: string, folder?: string): string {
  const titleLower = title.toLowerCase();
  const existing = Object.values(pageData.value).find(p => p.title.toLowerCase() === titleLower);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const slug = titleLower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date().toISOString();
  const resolvedFolder = folder ?? (isJournalSlug(title) ? 'journals' : undefined);
  const page: Page = { id, title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now };
  pageData.value = { ...pageData.value, [id]: page };
  emitPut(encode('page/' + id), encode(JSON.stringify({ title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now })));
  return id;
}

export function deletePage(pageId: string) {
  const next: Record<string, Block> = {};
  for (const [id, b] of Object.entries(blockData.value)) {
    if (b.pageId === pageId) emitDelete(encode('block/' + id));
    else next[id] = b;
  }
  blockData.value = next;
  emitDelete(encode('page/' + pageId));
  const { [pageId]: _, ...restPages } = pageData.value;
  pageData.value = restPages;
  if (currentPage.value === pageId) currentPage.value = null;
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

  const titleLower = title.toLowerCase();
  const existing = Object.values(pageData.value).find(p => p.title.toLowerCase() === titleLower);
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

// --- Undo hook infrastructure ---
//
// The undo system lives in undo.ts to avoid circular deps. It registers
// a patch hook so saveBlock/deleteBlock record mutations automatically.

type PatchHook = (id: string, before: Block | null, after: Block | null) => void;

let patchHook: PatchHook | null = null;
let resetHook: (() => void) | null = null;
let undoRedoInProgress = false;

/** Register undo hooks. Called by undo.ts at import time. */
export function registerUndoHooks(onPatch: PatchHook, onReset: () => void) {
  patchHook = onPatch;
  resetHook = onReset;
}

/** Suppress/unsuppress patch recording (used by undo/redo application). */
export function setUndoSuppressed(v: boolean) { undoRedoInProgress = v; }

/** Remove a block from memory and store without recording a patch.
 *  Used by undo/redo to reverse block creation. */
export function purgeBlock(id: string) {
  const next = { ...blockData.value };
  delete next[id];
  blockData.value = next;
  emitDelete(encode('block/' + id));
}

// --- Batch accumulation ---
//
// When a batch is active, store writes accumulate instead of firing
// immediately. flushBatch submits them as one atomic Batch call.
// All store writes go through emitPut/emitDelete so the batching
// decision lives in one place.

let pendingOps: StoreOp[] | null = null;

/** Start accumulating store ops. */
export function beginBatch() { pendingOps = []; }

/** Submit accumulated ops as one atomic Batch, then clear. */
export function flushBatch() {
  const ops = pendingOps;
  pendingOps = null;
  if (ops && ops.length > 0) store?.Batch({ ops });
}

function emitPut(key: Uint8Array, value: Uint8Array) {
  if (pendingOps) pendingOps.push({ put: { key, value } });
  else store?.Put({ key, value });
}

function emitDelete(key: Uint8Array) {
  if (pendingOps) pendingOps.push({ delete: { key } });
  else store?.Delete({ key });
}

// --- Block CRUD ---

export function saveBlock(block: Block) {
  const existing = blockData.value[block.id] ?? null;

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
  if (!undoRedoInProgress && patchHook) patchHook(block.id, existing, saved);
  blockData.value = { ...blockData.value, [block.id]: saved };

  if (block.content.trim() !== '' && tentativePages.has(block.pageId)) {
    materializePage(block.pageId);
  }

  if (tentativeBlocks.has(block.id)) return;

  const { id, ...rest } = saved;
  emitPut(encode('block/' + id), encode(JSON.stringify(rest)));
}

export function deleteBlock(id: string) {
  const toDelete = [id, ...collectDescendants(id)];
  if (!undoRedoInProgress && patchHook) {
    for (const bid of toDelete) {
      const existing = blockData.value[bid];
      if (existing) patchHook(bid, existing, null);
    }
  }
  const next: Record<string, Block> = {};
  for (const [bid, b] of Object.entries(blockData.value)) {
    if (!toDelete.includes(bid)) next[bid] = b;
  }
  blockData.value = next;
  for (const bid of toDelete) emitDelete(encode('block/' + bid));
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

export function validateTree(pageId: string): number {
  let repaired = 0;
  undoRedoInProgress = true;

  const allBlocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
  for (const block of allBlocks) {
    if (block.parent && !blockData.value[block.parent]) {
      saveBlock({ ...block, parent: null });
      repaired++;
    }
  }

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

export function hasChildren(blockId: string): boolean {
  return Object.values(blockData.value).some(b => b.parent === blockId);
}

// --- Collapse state (local-only, stored in localStorage) ---

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

// --- Sibling / order helpers ---

export function getSiblings(blockId: string): Block[] {
  const block = blockData.value[blockId];
  if (!block) return [];
  return Object.values(blockData.value)
    .filter(b => b.pageId === block.pageId && b.parent === block.parent)
    .sort((a, b) => a.order - b.order);
}

export function nextOrder(siblings: { order: number }[]): number {
  return siblings.reduce((m, s) => Math.max(m, s.order), -1) + 1;
}

export function orderBetween(a: number | undefined, b: number | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return b! - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

/** Rebalance sibling orders if they've become too cramped (fractional). */
export function maybeRebalance(pageId: string, parent: string | null) {
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

/** Can `block` be placed as a sibling at the given tree level? */
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

// --- Backlinks & tags ---

/** Find all blocks on other pages that reference this page by wiki link or #tag. */
export function getBacklinks(pageId: string): { block: Block; children: FlatBlock[] }[] {
  const page = pageData.value[pageId];
  if (!page) return [];
  const titleLower = page.title.toLowerCase();
  const wikiRe = new RegExp(`\\[\\[${escapeRegex(page.title)}\\]\\]`, 'i');
  const multiWordTagRe = new RegExp(`#\\[\\[${escapeRegex(page.title)}\\]\\]`, 'i');
  const simpleTagRe = /^\w[\w\-/]*$/.test(page.title)
    ? new RegExp(`(^|\\s)#${escapeRegex(page.title)}(?=\\s|$)`, 'i')
    : null;
  const refBlocks = Object.values(blockData.value)
    .filter(b => b.pageId !== pageId && (
      wikiRe.test(b.content) ||
      multiWordTagRe.test(b.content) ||
      (simpleTagRe && simpleTagRe.test(b.content))
    ));
  return refBlocks.map(block => {
    const allBlocks = Object.values(blockData.value).filter(b => b.pageId === block.pageId);
    const childTree = buildSubtree(allBlocks, block.id);
    const children = flattenTree(childTree, 1);
    return { block, children };
  });
}

/** Collect all tags used across all blocks, with their occurrence count. */
export function getTagCounts(): { tag: string; count: number }[] {
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
