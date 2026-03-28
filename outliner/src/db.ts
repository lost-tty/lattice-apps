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
      saveBlock({ id, content: '', pageId: existing.id, parent: null, order: 0 });
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
    saveBlock({ id, content: '', pageId, parent: null, order: 0 });
    activeBlockId.value = id;
  }
  currentPage.value = pageId;
}

// --- Block CRUD ---

export function saveBlock(block: Block) {
  const existing = blockData.value[block.id];
  const now = new Date().toISOString();
  const saved = {
    ...block,
    createdAt: block.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
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
    if (!node.collapsed) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

/** Check if a block has children. */
export function hasChildren(blockId: string): boolean {
  return Object.values(blockData.value).some(b => b.parent === blockId);
}

/** Toggle collapsed state (persisted to store). */
export function toggleCollapse(blockId: string) {
  const block = blockData.value[blockId];
  if (!block) return;
  saveBlock({ ...block, collapsed: !block.collapsed });
}

/** Check if `blockId` is a descendant of `ancestorId`. */
function isDescendant(blockId: string, ancestorId: string): boolean {
  let current = blockData.value[blockId];
  while (current?.parent) {
    if (current.parent === ancestorId) return true;
    current = blockData.value[current.parent];
  }
  return false;
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

  if (position === 'nested') {
    const children = Object.values(blockData.value)
      .filter(b => b.pageId === target.pageId && b.parent === targetId)
      .sort((a, b) => a.order - b.order);
    const firstOrder = children.length > 0 ? children[0].order : 0;
    saveBlock({ ...block, parent: targetId, pageId: target.pageId, order: orderBetween(undefined, firstOrder) });
    return;
  }

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

// --- Block operations ---

/** Create a new block after `afterId`, returns the new block's ID. */
export function createBlockAfter(afterId: string, content: string = '', type?: 'bullet' | 'paragraph'): string {
  const after = blockData.value[afterId];
  if (!after) return '';
  const siblings = getSiblings(afterId);
  const idx = siblings.findIndex(b => b.id === afterId);
  const next = siblings[idx + 1];
  const order = orderBetween(after.order, next?.order);
  const id = crypto.randomUUID();
  const blockType = type ?? after.type ?? 'bullet';
  saveBlock({ id, content, pageId: after.pageId, parent: after.parent, order, type: blockType });
  maybeRebalance(after.pageId, after.parent);
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
  const siblings = getSiblings(blockId);
  const idx = siblings.findIndex(b => b.id === blockId);
  if (idx <= 0) return;
  const newParent = siblings[idx - 1];
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
 * cursorPos is the offset in the merged content where the cursor should be placed
 * (i.e. right before the joined-in text, after any implicit space).
 */
export function joinBlockWithPrevious(blockId: string): { prevId: string; cursorPos: number } | null {
  const block = blockData.value[blockId];
  if (!block) return null;
  const tree = buildTree(block.pageId);
  const flat = flattenTree(tree);
  const idx = flat.findIndex(b => b.id === blockId);
  if (idx <= 0) return null;
  const prev = flat[idx - 1];
  const prevContent = prev.content;
  const currentContent = block.content;
  const needsSpace = prevContent.length > 0 && !/\s$/.test(prevContent);
  const joinedContent = prevContent + (needsSpace ? ' ' : '') + currentContent;
  const cursorPos = prevContent.length + (needsSpace ? 1 : 0);
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
  if (idx <= 0) return null; // don't delete the only/first block
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
 *  Handles both plain bullet-list markdown (`- text`, `  - text`) and
 *  indented plain text.  Depths are normalised so the shallowest line = 0. */
export type ParsedItem = {
  content: string;
  relativeDepth: number;
  type: 'bullet' | 'paragraph' | 'table-row';
  cells?: string[];   // populated for table-row items
};

export function parseMarkdownToItems(text: string): ParsedItem[] {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  const result: Array<{ content: string; depth: number; type: 'bullet' | 'paragraph' | 'table-row'; cells?: string[] }> = [];
  // -1 = no heading seen yet; unindented bullets start at depth 0
  let headingDepth = -1;
  // Sorted unique indent values seen in the current heading section
  let bulletIndents: number[] = [];

  for (const line of lines) {
    // Horizontal rule: --- resets all nesting context
    if (line.trim() === '---') {
      headingDepth = -1;
      bulletIndents = [];
      result.push({ content: '---', type: 'paragraph', depth: 0 });
      continue;
    }

    // Table row: | ... | (skip separator rows like |---|---|)
    if (isTableRow(line.trim())) {
      if (isTableSeparator(line.trim())) continue; // drop separator — it's structural, not content
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      result.push({ content: line.trim(), type: 'table-row', cells, depth: headingDepth + 1 });
      continue;
    }

    // Heading: # through ######
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      headingDepth = hm[1].length - 1;   // # → 0, ## → 1, ### → 2 …
      bulletIndents = [];                 // fresh indent context for this section
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
      result.push({ content: bm[2], type: 'bullet', depth: headingDepth + 1 + indentRank });
      continue;
    }

    // Plain text — paragraph, sits one level below the current heading (or at 0 if none)
    result.push({ content: line.trim(), type: 'paragraph', depth: headingDepth + 1 });
  }

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
  for (let i = 0; i < flat.length; i++) {
    const b = flat[i];

    // Skip cells — they were already exported with their table parent
    if (tableCellIds.has(b.id)) continue;

    if (b.type === 'table') {
      // Export table as Markdown table rows
      const grid = getTableGrid(b.id);
      for (const cell of grid.flatMap(r => r.cells)) tableCellIds.add(cell.id);
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        lines.push('| ' + row.cells.map(c => c.content).join(' | ') + ' |');
        if (r === 0) {
          // Separator after header row
          lines.push('| ' + row.cells.map(() => '---').join(' | ') + ' |');
        }
      }
      continue;
    }

    if (isStructural(b.content)) {
      if (lines.length > 0) lines.push('');
      headingDepth = b.depth + 1;
      lines.push(b.content);
      const next = flat[i + 1];
      if (next && !isStructural(next.content) && next.type !== 'table') lines.push('');
    } else if (b.type === 'paragraph') {
      const indent = '  '.repeat(Math.max(0, b.depth - headingDepth));
      lines.push(`${indent}${b.content}`);
    } else {
      const bulletDepth = b.depth - headingDepth;
      lines.push(`${'  '.repeat(Math.max(0, bulletDepth))}- ${b.content}`);
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
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');

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
