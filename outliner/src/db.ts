// Lattice Outliner — Data layer
//
// Core state, initialization, page/block CRUD, undo/redo, tree helpers,
// ordering, nesting predicates, collapse, backlinks, and journal helpers.

import { signal, computed } from '@preact/signals';
import { v5 as uuidv5 } from 'uuid';
import type { Store, StoreOp, Page, Block, BlockNode, WatchEvent } from './types';
import { parseStoredBlock, serializeBlock, isJournalSlug, formatJournalTitle } from './parse';

// --- Encoding ---

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function listValue(e: { entries: { value: Uint8Array }[] }): Uint8Array | null {
  return e.entries[0]?.value ?? null;
}

// --- Reactive state ---

let store: Store;

export const pageData = signal<Record<string, Page>>({});
export const blockData = signal<Record<string, Block>>({});
export const currentPage = signal<string | null>(null); // stores page ID
export const activeBlockId = signal<string | null>(null);

// --- Title index (lowercase title → page ID) ---

const titleIndex = new Map<string, string>();

function indexPage(page: Page) { titleIndex.set(page.title.toLowerCase(), page.id); }
function unindexPage(page: Page) { titleIndex.delete(page.title.toLowerCase()); }
function findPageByTitle(title: string): Page | undefined {
  const id = titleIndex.get(title.toLowerCase());
  return id ? pageData.value[id] : undefined;
}

// --- Deterministic page IDs ---

/** App-specific namespace for uuidv5. Used to derive deterministic page IDs
 *  from slug so concurrent creation on different devices produces
 *  the same store key. */
const PAGE_NAMESPACE = '75294972-e300-4597-834a-6e4f63a30678';
function deterministicPageId(slug: string): string {
  return uuidv5(slug, PAGE_NAMESPACE);
}

// --- Page dedup ---

/** Dedup pages with the same title during init.
 *  Keeps the page with the earliest createdAt; reparents blocks and
 *  deletes discarded page keys from the store. Mutates both records. */
function dedupPages(pages: Record<string, Page>, blocks: Record<string, Block>) {
  const seen = new Map<string, string>(); // lowercase title → surviving page ID
  const losers: string[] = [];
  // Sort by createdAt so the earliest page wins the slot in `seen`
  const sorted = Object.values(pages).sort((a, b) =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  for (const page of sorted) {
    const key = page.title.toLowerCase();
    const winnerId = seen.get(key);
    if (!winnerId) {
      seen.set(key, page.id);
    } else {
      // Reparent blocks from loser → winner
      for (const block of Object.values(blocks)) {
        if (block.pageId === page.id) {
          const reparented = { ...block, pageId: winnerId };
          blocks[block.id] = reparented;
          emitPut(encode('block/' + block.id), encode(JSON.stringify(serializeBlock(reparented))));
        }
      }
      losers.push(page.id);
    }
  }
  for (const id of losers) {
    delete pages[id];
    emitDelete(encode('page/' + id));
  }
}

/** Merge a duplicate page (loserId) into an existing page (winnerId).
 *  Called when a duplicate arrives via the watch handler. */
function mergePage(loserId: string, winnerId: string) {
  const nextBlocks = { ...blockData.value };
  for (const [bid, block] of Object.entries(nextBlocks)) {
    if (block.pageId === loserId) {
      const reparented = { ...block, pageId: winnerId };
      nextBlocks[bid] = reparented;
      emitPut(encode('block/' + bid), encode(JSON.stringify(serializeBlock(reparented))));
    }
  }
  blockData.value = nextBlocks;
  // Remove the duplicate page
  const { [loserId]: _, ...restPages } = pageData.value;
  pageData.value = restPages;
  emitDelete(encode('page/' + loserId));
}

/** Sorted list of pages. Journals first (newest first), then regular pages alphabetically. */
export const pageList = computed(() =>
  Object.values(pageData.value).sort((a, b) => {
    const aJ = isJournalSlug(a.title), bJ = isJournalSlug(b.title);
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
      const value = listValue(e);
      if (!value) continue;
      const id = decode(e.key).slice(5); // 'page/'.length === 5
      pages[id] = { id, ...JSON.parse(decode(value)) };
    } catch (err) { console.warn('[outliner] bad page:', err); }
  }

  const blocks: Record<string, Block> = {};
  for (const e of (await store.List({ prefix: encode('block/') })).items) {
    try {
      const value = listValue(e);
      if (!value) continue;
      const id = decode(e.key).slice(6); // 'block/'.length === 6
      blocks[id] = parseStoredBlock(normalizeStored(JSON.parse(decode(value))), id);
    } catch (err) { console.warn('[outliner] bad block:', err); }
  }

  // Dedup pages with the same title, keeping earliest createdAt.
  dedupPages(pages, blocks);

  // Build title index
  titleIndex.clear();
  for (const p of Object.values(pages)) indexPage(p);

  pageData.value = pages;
  blockData.value = blocks;

  store.subscribe('watch', { prefix: encode('page/') }, (e: WatchEvent) => {
    const id = decode(e.key).slice(5);
    if (e.deleted || !e.value) {
      const page = pageData.value[id];
      if (page) unindexPage(page);
      const { [id]: _, ...rest } = pageData.value;
      pageData.value = rest;
    } else {
      try {
        const incoming: Page = { id, ...JSON.parse(decode(e.value)) };
        const existingId = titleIndex.get(incoming.title.toLowerCase());
        if (existingId && existingId !== id) {
          // Duplicate arrived via sync — merge into the existing page
          mergePage(id, existingId);
          return;
        }
        // Update index for title changes (renames)
        const prev = pageData.value[id];
        if (prev) unindexPage(prev);
        indexPage(incoming);
        pageData.value = { ...pageData.value, [id]: incoming };
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
        blockData.value = {
          ...blockData.value,
          [id]: parseStoredBlock(normalizeStored(JSON.parse(decode(e.value))), id),
        };
      } catch (err) { console.warn('[outliner] parse error:', err); }
    }
  });
}

/** Be liberal in what we accept from the store. Older writes used
 *  `childLayout`; code-side is `layout`. Remap on ingress so the parser
 *  sees a single canonical shape. */
function normalizeStored(raw: any): any {
  if (raw.childLayout !== undefined && raw.layout === undefined) {
    raw.layout = raw.childLayout;
  }
  delete raw.childLayout;
  return raw;
}

/** True if the block has user-authored text. Grids/hrules count as content;
 *  paragraphs/bullets/headings only when their text isn't blank. */
export function blockHasText(b: Block): boolean {
  switch (b.kind) {
    case 'grid':
    case 'hrule': return true;
    default: return b.text.trim() !== '';
  }
}

/** Return the user-visible text of a block (no markdown prefix). Used by
 *  search / wiki-link / tag scanners that don't care about kind. */
export function blockText(b: Block): string {
  switch (b.kind) {
    case 'grid':
    case 'hrule': return '';
    default: return b.text;
  }
}

// --- Tentative pages ---
// Pages created by navigating to a non-existent tag/link are tentative:
// visible in memory but not written to the store until the user adds content.
// Block-level tentativity lives as `block.tentative` on the Block itself
// (see types.ts); saveBlock/deleteBlock honor it.
const tentativePages = new Set<string>();

export function isTentativePage(pageId: string): boolean {
  return tentativePages.has(pageId);
}

/** Strip the `tentative` flag. Identity if the flag is already absent. */
function stripTentative(b: Block): Block {
  if (!b.tentative) return b;
  const { tentative, ...rest } = b;
  return rest as Block;
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
  const nextBlocks = { ...blockData.value };
  for (const [id, b] of Object.entries(blockData.value)) {
    if (b.pageId === pageId && b.tentative) {
      const persisted = stripTentative(b);
      nextBlocks[id] = persisted;
      emitPut(encode('block/' + id), encode(JSON.stringify(serializeBlock(persisted))));
    }
  }
  blockData.value = nextBlocks;
}

/** Discard a tentative page and its blocks from memory. */
function discardTentativePage(pageId: string) {
  if (!tentativePages.has(pageId)) return;
  tentativePages.delete(pageId);
  const next: Record<string, Block> = {};
  for (const [id, b] of Object.entries(blockData.value)) {
    if (!(b.pageId === pageId && b.tentative)) next[id] = b;
  }
  blockData.value = next;
  const page = pageData.value[pageId];
  if (page) unindexPage(page);
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
  titleIndex.clear();
  collapsedBlocks.value = new Set();
  if (resetHook) resetHook();
}

// --- Page CRUD ---

export function savePage(page: Page) {
  const prev = pageData.value[page.id];
  if (prev) unindexPage(prev);
  const now = new Date().toISOString();
  const saved = { ...page, updatedAt: now };
  pageData.value = { ...pageData.value, [page.id]: saved };
  indexPage(saved);
  const { id, ...rest } = saved;
  emitPut(encode('page/' + id), encode(JSON.stringify(rest)));
}

/** Find or create a page by title. Returns the page ID. */
export function getOrCreatePage(title: string): string {
  const existing = findPageByTitle(title);
  if (existing) return existing.id;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = deterministicPageId(slug);
  const now = new Date().toISOString();
  const page: Page = { id, title, slug, createdAt: now, updatedAt: now };
  pageData.value = { ...pageData.value, [id]: page };
  indexPage(page);
  emitPut(encode('page/' + id), encode(JSON.stringify({ title, slug, createdAt: now, updatedAt: now })));
  return id;
}

export function deletePage(pageId: string) {
  const page = pageData.value[pageId];
  const next: Record<string, Block> = {};
  for (const [id, b] of Object.entries(blockData.value)) {
    if (b.pageId === pageId) emitDelete(encode('block/' + id));
    else next[id] = b;
  }
  blockData.value = next;
  if (page) unindexPage(page);
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
      b => b.pageId === prev && blockHasText(b),
    );
    if (!hasContent) discardTentativePage(prev);
  }

  const existing = findPageByTitle(title);
  if (existing) {
    // Page exists (persisted or tentative) — just navigate
    const hasBlocks = Object.values(blockData.value).some(b => b.pageId === existing.id);
    if (!hasBlocks) {
      const id = crypto.randomUUID();
      undoRedoInProgress = true;
      saveBlock({ id, kind: 'paragraph', text: '', pageId: existing.id, parent: null, order: 0 });
      undoRedoInProgress = false;
      activeBlockId.value = id;
    }
    currentPage.value = existing.id;
    return;
  }

  // Create tentative page (in memory only, no store write)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = deterministicPageId(slug);
  const now = new Date().toISOString();
  const page: Page = { id, title, slug, createdAt: now, updatedAt: now };
  pageData.value = { ...pageData.value, [id]: page };
  indexPage(page);
  tentativePages.add(id);

  // Create tentative seed block (in memory only)
  const blockId = crypto.randomUUID();
  const block: Block = { id: blockId, kind: 'paragraph', text: '', pageId: id, parent: null, order: 0, createdAt: now, updatedAt: now, tentative: true };
  blockData.value = { ...blockData.value, [blockId]: block };
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
      b => b.pageId === prev && blockHasText(b),
    );
    if (!hasContent) discardTentativePage(prev);
  }
  const hasBlocks = Object.values(blockData.value).some(b => b.pageId === pageId);
  if (!hasBlocks) {
    const id = crypto.randomUUID();
    undoRedoInProgress = true;
    saveBlock({ id, kind: 'paragraph', text: '', pageId, parent: null, order: 0, tentative: true });
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

  // Compare canonical serialized form (minus updatedAt, which always
  // differs) so no-op writes don't churn patches/store.
  if (existing && sameSerialized(existing, block)) return;

  const now = new Date().toISOString();
  const saved: Block = {
    ...block,
    createdAt: block.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  } as Block;
  if (!undoRedoInProgress && patchHook) patchHook(block.id, existing, saved);

  // Tentative block without real text: keep in memory, don't persist.
  // When it eventually gets text we fall through and strip the flag.
  if (saved.tentative && !blockHasText(saved)) {
    blockData.value = { ...blockData.value, [block.id]: saved };
    return;
  }

  const persisted = stripTentative(saved);
  blockData.value = { ...blockData.value, [block.id]: persisted };

  if (blockHasText(persisted) && tentativePages.has(persisted.pageId)) {
    materializePage(persisted.pageId);
  }

  emitPut(encode('block/' + persisted.id), encode(JSON.stringify(serializeBlock(persisted))));
}

function sameSerialized(a: Block, b: Block): boolean {
  const sa = serializeBlock(a); sa.updatedAt = undefined; sa.createdAt = undefined;
  const sb = serializeBlock(b); sb.updatedAt = undefined; sb.createdAt = undefined;
  return JSON.stringify(sa) === JSON.stringify(sb);
}

export function deleteBlock(id: string) {
  const toDelete = [id, ...collectDescendants(id)];
  // Emit deletes only for blocks that were actually persisted; tentative
  // blocks were never in the store. Collect before we purge memory.
  const toEmitDelete: string[] = [];
  for (const bid of toDelete) {
    const existing = blockData.value[bid];
    if (!existing) continue;
    if (!undoRedoInProgress && patchHook) patchHook(bid, existing, null);
    if (!existing.tentative) toEmitDelete.push(bid);
  }
  const next: Record<string, Block> = {};
  for (const [bid, b] of Object.entries(blockData.value)) {
    if (!toDelete.includes(bid)) next[bid] = b;
  }
  blockData.value = next;
  for (const bid of toEmitDelete) emitDelete(encode('block/' + bid));
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
    .map(b => ({ ...b, children: buildSubtree(blocks, b.id) }) as BlockNode);
}

export type FlatBlock = BlockNode & { depth: number };

export function flattenTree(nodes: BlockNode[], depth: number = 0): FlatBlock[] {
  const result: FlatBlock[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth } as FlatBlock);
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

type BlockKind = 'bullet' | 'heading' | 'paragraph' | 'table' | 'hrule';

/** Convert a block to its single-line markdown representation for editing.
 *  Re-emits the canonical content prefix the editor displays. Grid cells
 *  emit their bare text; the surrounding grid renderer composes `| … |`. */
export function blockToMarkdown(block: Block): string {
  return serializeBlock(block).content;
}

/** Parse a single-line markdown string into the kind-specific fields of a
 *  block (kind/text/todo/level). Callers spread it onto an existing block
 *  via `setBlockMarkdown`. Normalizes `*` / `+` bullets to canonical `- `. */
export function markdownToBlock(md: string): { kind: Block['kind']; text?: string; todo?: any; level?: number } {
  const normalized = (md.startsWith('* ') || md.startsWith('+ ')) ? '- ' + md.slice(2) : md;
  const stored = { content: normalized, pageId: '', parent: null, order: 0 };
  const parsed = parseStoredBlock(stored, '');
  const { id, pageId, parent, order, createdAt, updatedAt, col, collapsed, ...overlay } = parsed as any;
  return overlay;
}

/** Replace a block's kind/text/etc by parsing a markdown string. Identity
 *  fields (id, pageId, parent, order, col, timestamps) are preserved.
 *  Stale kind-specific fields from the previous kind are stripped before
 *  the new overlay is applied — without this, switching from bullet to
 *  heading would leave `todo` orphaned on the result. */
export function setBlockMarkdown(node: Block, md: string): Block {
  const { kind, text, level, todo, ...identity } = node as any;
  return { ...identity, ...markdownToBlock(md) } as Block;
}

/** String kind used by the nesting-rule predicates below. */
export function blockKind(block: Block): BlockKind {
  return block.kind === 'grid' ? 'table' : block.kind;
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
 *  - Pure-heading levels stay pure: a non-heading becomes a child of
 *    its heading anchor instead.
 *  - Mixed levels (heading + other siblings from imports etc.) accept
 *    anything — the mixing is already there.
 *  - Heading-free levels stay heading-free: headings don't sneak into
 *    a plain-bullet list via `createBlockAfter`. */
export function canBeSiblingAt(block: Block, pageId: string, parent: string | null): boolean {
  const levelKinds = new Set(
    Object.values(blockData.value)
      .filter(b => b.pageId === pageId && b.parent === parent)
      .map(b => blockKind(b)),
  );
  const kind = blockKind(block);
  if (kind === 'table') return true;
  if (levelKinds.size === 1 && levelKinds.has('heading')) return kind === 'heading';
  if (levelKinds.has('heading')) return true;
  return kind === 'bullet' || kind === 'paragraph' || kind === 'hrule';
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
  const refBlockIds = new Set<string>();
  const allRefBlocks = Object.values(blockData.value)
    .filter(b => b.pageId !== pageId && (() => {
      const t = blockText(b);
      return wikiRe.test(t) || multiWordTagRe.test(t) || (simpleTagRe && simpleTagRe.test(t));
    })());
  for (const b of allRefBlocks) refBlockIds.add(b.id);

  // Filter out blocks whose ancestor is already a ref block (avoid duplicate entries)
  const rootRefBlocks = allRefBlocks.filter(b => {
    let pid = b.parent;
    while (pid) {
      if (refBlockIds.has(pid)) return false;
      pid = blockData.value[pid]?.parent ?? null;
    }
    return true;
  });

  return rootRefBlocks.map(block => {
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
    const t = blockText(block);
    let m;
    multiWordRe.lastIndex = 0;
    while ((m = multiWordRe.exec(t))) {
      exact.set(m[2], (exact.get(m[2]) ?? 0) + 1);
    }
    singleWordRe.lastIndex = 0;
    while ((m = singleWordRe.exec(t))) {
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

// --- Journal helpers ---

/** All journal pages, sorted newest first. */
export function getJournalPages(): Page[] {
  return Object.values(pageData.value)
    .filter(p => isJournalSlug(p.title))
    .sort((a, b) => b.title.localeCompare(a.title));
}

/** Is this page a journal page? */
export function isJournalPage(pageId: string): boolean {
  const page = pageData.value[pageId];
  return !!page && isJournalSlug(page.title);
}

/** Return a human-readable title for a page ID. */
export function pageTitle(pageId: string): string {
  const page = pageData.value[pageId];
  if (!page) return pageId;
  return isJournalSlug(page.title) ? formatJournalTitle(page.title) : page.title;
}
