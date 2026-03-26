// ============================================================================
// Lattice Inventory — Reactive State (Preact Signals)
// ============================================================================

import { signal, batch } from '@preact/signals';
import type { Item, GroupIndex, Column, SortState, SyncStatus, ViewPrefs, CellRef, ColumnSelection } from './types';
import { ID } from './types';
import { buildIndex, sortItems } from './engine';
import { DataStore } from './db';
import { pushUndo, popUndo, popRedo, initUndo } from './undo';
import type { FieldChange, DeletedItem, UndoEntry } from './undo';

// --- Core signals ---

export const items = signal<Map<string, Item>>(new Map());
export const index = signal<GroupIndex[]>([]);
export const collapsed = signal<Set<string>>(new Set());
export const focusedId = signal<string | null>(null);
export const focusedCol = signal<string | null>(null);
/** Cell being edited, or null if in ready state.
 *  deep=false: Enter mode — input shown, arrows save+navigate between cells.
 *  deep=true:  Edit mode — input shown, arrows move cursor within text.
 *  null:       Ready — no input, arrows navigate cells. */
export const editing = signal<{ itemId: string; colKey: string; deep: boolean } | null>(null);
export const selectedCells = signal<CellRef[]>([]);
export const selectedRows = signal<Set<string>>(new Set());
export const selectedColumn = signal<ColumnSelection | null>(null);
export const search = signal('');
export const groupLevels = signal<string[]>([]);
export const groupingActive = signal(false);
export const globalColumns = signal<string[]>([]);
export const columnOrder = signal<string[]>([]);
export const declaredColumns = signal<string[]>([]);
export const sort = signal<SortState | null>(null);
export const syncing = signal(false);
export const pendingWrites = signal(0);
export const filters = signal<Record<string, string[]>>({});

// --- Modal/overlay signals ---
export const showNewItemModal = signal(false);
export const showBulkAddModal = signal(false);

export const confirmDialog = signal<{
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null>(null);

export const contextMenu = signal<{
  x: number;
  y: number;
  targetIds: string[];
} | null>(null);

export const pendingEditChar = signal<string | null>(null);



export const draftItems = signal<Set<string>>(new Set());

/** Get columns for a given item from the index (no DOM scraping). */
export function getColumnsForItem(itemId: string): string[] {
  const grp = findGroupForItem(itemId);
  if (!grp) return [];
  const globalSet = new Set(globalColumns.value);
  const orderedColumns = applyColumnOrder(grp.columns);

  // In flat view: only globals are proper columns
  if (grp.group === '__all__') {
    return orderedColumns
      .filter(c => globalSet.has(c.key))
      .map(c => c.key);
  }
  return orderedColumns.map(c => c.key);
}

export const pinnedColumnWidths = signal<Map<string, number>>(new Map());

// --- DataStore reference ---
let dataStore: DataStore;

export function getDataStore(): DataStore {
  return dataStore;
}

export function setDataStore(ds: DataStore) {
  dataStore = ds;
}

// --- Row highlight color palette ---
export const ROW_COLORS: { name: string; border: string; bg: string; bgDark: string }[] = [
  { name: 'red',    border: 'oklch(0.65 0.20 25)',  bg: 'oklch(0.65 0.20 25 / 0.10)',  bgDark: 'oklch(0.65 0.20 25 / 0.15)' },
  { name: 'orange', border: 'oklch(0.72 0.16 55)',  bg: 'oklch(0.72 0.16 55 / 0.10)',  bgDark: 'oklch(0.72 0.16 55 / 0.15)' },
  { name: 'yellow', border: 'oklch(0.82 0.16 95)',  bg: 'oklch(0.82 0.16 95 / 0.10)',  bgDark: 'oklch(0.82 0.16 95 / 0.15)' },
  { name: 'green',  border: 'oklch(0.72 0.16 145)', bg: 'oklch(0.72 0.16 145 / 0.10)', bgDark: 'oklch(0.72 0.16 145 / 0.15)' },
  { name: 'teal',   border: 'oklch(0.72 0.12 195)', bg: 'oklch(0.72 0.12 195 / 0.10)', bgDark: 'oklch(0.72 0.12 195 / 0.15)' },
  { name: 'blue',   border: 'oklch(0.68 0.16 250)', bg: 'oklch(0.68 0.16 250 / 0.10)', bgDark: 'oklch(0.68 0.16 250 / 0.15)' },
  { name: 'purple', border: 'oklch(0.65 0.18 310)', bg: 'oklch(0.65 0.18 310 / 0.10)', bgDark: 'oklch(0.65 0.18 310 / 0.15)' },
  { name: 'gray',   border: 'oklch(0.60 0.02 260)', bg: 'oklch(0.60 0.02 260 / 0.10)', bgDark: 'oklch(0.60 0.02 260 / 0.15)' },
];

// --- Helpers ---

export function uuid(): string {
  return crypto.randomUUID();
}

export function toast(msg: string, isError = false) {
  const t = document.createElement('div');
  t.className = `toast ${isError ? 'err' : 'ok'}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/** Get a display label for an item — value of first visible column, or the id. */
export function itemLabel(itemId: string): string {
  const item = items.value.get(itemId);
  if (!item) return itemId;
  const grp = findGroupForItem(itemId);
  if (grp && grp.columns.length > 0) {
    const orderedCols = applyColumnOrder(grp.columns);
    for (const col of orderedCols) {
      const v = item[col.key];
      if (v != null && v !== '') return String(v);
    }
  }
  // Fallback: first non-empty field
  for (const key of Object.keys(item)) {
    const v = item[key];
    if (v != null && v !== '') return String(v);
  }
  return itemId.slice(0, 8);
}

/** Get the first column key for an item's group. */
export function firstColumnKey(itemId: string): string | null {
  const grp = findGroupForItem(itemId);
  if (!grp || grp.columns.length === 0) return null;
  const orderedCols = applyColumnOrder(grp.columns);
  return orderedCols[0]?.key ?? null;
}

// --- Derived state ---

function effectiveLevels(): string[] {
  return groupingActive.value ? groupLevels.value : [];
}

function applySortToTree(groups: GroupIndex[], s: SortState) {
  for (const grp of groups) {
    if (grp.path === s.group && grp.items.length > 0) {
      grp.items = sortItems(grp.items, s.column, s.dir);
    }
    if (grp.children.length > 0) {
      applySortToTree(grp.children, s);
    }
  }
}

export function rebuildIndex() {
  const allItems = [...items.value.values()];
  const newIndex = buildIndex(allItems, effectiveLevels(), search.value || undefined, filters.value, globalColumns.value, declaredColumns.value);
  if (sort.value) {
    applySortToTree(newIndex, sort.value);
  }
  index.value = newIndex;
}

export function persistPrefs() {
  const prefs: ViewPrefs = {
    groupLevels: groupLevels.value,
    filters: filters.value,
    globalColumns: globalColumns.value,
    sort: sort.value,
    columnOrder: columnOrder.value,
    declaredColumns: declaredColumns.value,
  };
  dataStore.savePrefs(prefs);
}

// --- Undo batching ---

let undoBatch: FieldChange[] | null = null;
let undoBatchLabel: string | null = null;

/** Start collecting field changes into a single undo entry. */
export function beginUndoBatch(label: string) {
  undoBatch = [];
  undoBatchLabel = label;
}

/** Flush the collected batch as one undo entry. */
export function commitUndoBatch() {
  if (undoBatch && undoBatch.length > 0) {
    pushUndo({ type: 'fields', label: undoBatchLabel || 'Edit', changes: undoBatch });
  }
  undoBatch = null;
  undoBatchLabel = null;
}

// --- Shared helpers ---

/** Snapshot an item's string-keyed fields (for undo). */
export function snapshotFields(item: Item): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const k of Object.keys(item)) fields[k] = item[k];
  return fields;
}

/** Copy group-level fields from source to target item. */
export function copyGroupFields(source: Item, target: Item) {
  for (const levelKey of groupLevels.value) {
    const val = source[levelKey];
    if (val != null && val !== '') target[levelKey] = val;
  }
}

/** Expand collapsed groups along the path for an item. */
export function expandGroupsForItem(item: Item) {
  const newCollapsed = new Set(collapsed.value);
  let path = '';
  for (const levelKey of groupLevels.value) {
    const v = String(item[levelKey] ?? '(none)');
    path = path ? `${path}/${v}` : v;
    newCollapsed.delete(path);
  }
  collapsed.value = newCollapsed;
}

/** Compute the next row/col index for an arrow key press. */
export function arrowMove(key: string, row: number, col: number, rows: number, cols: number): { row: number; col: number } {
  let r = row, c = col;
  if (key === 'ArrowDown')  r = Math.min(rows - 1, r + 1);
  if (key === 'ArrowUp')    r = Math.max(0, r - 1);
  if (key === 'ArrowRight') c = Math.min(cols - 1, c + 1);
  if (key === 'ArrowLeft')  c = Math.max(0, c - 1);
  return { row: r, col: c };
}

/** Force Preact signal to fire by creating new Map reference. */
export function notifyItemsChanged() {
  items.value = new Map(items.value);
}

// --- Field operations ---

export async function saveField(itemId: string, key: string, rawValue: string, isNumber = false) {
  const item = items.value.get(itemId);
  if (!item) return;

  // Capture old value for undo
  const oldValue = item[key] ?? null;

  let value: unknown = rawValue.trim();
  if (value === '') {
    delete item[key];
    value = null;
  } else if (isNumber || (typeof item[key] === 'number')) {
    const n = parseFloat(rawValue);
    value = isNaN(n) ? rawValue : n;
    item[key] = value;
  } else {
    item[key] = value;
  }

  // Record undo (skip if value unchanged, skip drafts)
  if (oldValue !== value && !draftItems.value.has(itemId)) {
    const change: FieldChange = { itemId, key, oldValue, newValue: value };
    if (undoBatch) {
      undoBatch.push(change);
    } else {
      pushUndo({ type: 'fields', label: 'Edit', changes: [change] });
    }
  }

  if (draftItems.value.has(itemId)) {
    await commitDraft(itemId, item);
  } else {
    await dataStore.save(itemId, item);
  }
}

// --- Item operations ---

export async function duplicateItem(itemId: string) {
  const original = items.value.get(itemId);
  if (!original) return;

  const newId = uuid();
  const newItem = { [ID]: newId } as Item;
  for (const k of Object.keys(original)) {
    if (k === 'created_at' || k === 'updated_at') continue;
    newItem[k] = JSON.parse(JSON.stringify(original[k]));
  }
  // Append "(copy)" to first column value
  const firstCol = firstColumnKey(itemId);
  if (firstCol && newItem[firstCol]) {
    newItem[firstCol] = String(newItem[firstCol]) + ' (copy)';
  }

  await dataStore.save(newId, newItem);
  focusedId.value = newId;
  editing.value = firstCol ? { itemId: newId, colKey: firstCol, deep: false } : null;
  rebuildIndex();
  toast('Item duplicated');
}

/** Create a new draft item below the focused row. Not persisted until first field commit.
 *  Focuses the same column the cursor was in. */
export function createItemBelowFocused() {
  const fid = focusedId.value;
  if (!fid) return;
  const focusedItem = items.value.get(fid);
  if (!focusedItem) return;

  const newId = uuid();
  const newItem = { [ID]: newId } as Item;
  copyGroupFields(focusedItem, newItem);

  const newItems = new Map(items.value);
  newItems.set(newId, newItem);

  const newDrafts = new Set(draftItems.value);
  newDrafts.add(newId);

  // Keep same column as current focus, fall back to first column
  const editCol = focusedCol.value || firstColumnKey(fid);

  batch(() => {
    items.value = newItems;
    draftItems.value = newDrafts;
    focusedId.value = newId;
    editing.value = editCol ? { itemId: newId, colKey: editCol, deep: false } : null;
  });
  expandGroupsForItem(newItem);
  rebuildIndex();
}

export function discardDraft(itemId: string) {
  if (!draftItems.value.has(itemId)) return;
  const newItems = new Map(items.value);
  newItems.delete(itemId);
  const newDrafts = new Set(draftItems.value);
  newDrafts.delete(itemId);
  batch(() => {
    items.value = newItems;
    draftItems.value = newDrafts;
    if (focusedId.value === itemId) {
      focusedId.value = null;
      focusedCol.value = null;
    }
    editing.value = null;
  });
  rebuildIndex();
}

async function commitDraft(itemId: string, item: Item) {
  if (!draftItems.value.has(itemId)) return;
  await dataStore.save(itemId, item);
  const newDrafts = new Set(draftItems.value);
  newDrafts.delete(itemId);
  draftItems.value = newDrafts;
}

export async function deleteItems(targetIds: string[]) {
  // Snapshot for undo
  const snapshots: DeletedItem[] = [];
  for (const id of targetIds) {
    const item = items.value.get(id);
    if (item) snapshots.push({ itemId: id, fields: snapshotFields(item) });
  }
  if (snapshots.length > 0) {
    const label = targetIds.length === 1 ? 'Delete item' : `Delete ${targetIds.length} items`;
    pushUndo({ type: 'delete', label, items: snapshots });
  }

  // Move focus to next visible item (for single delete)
  const ids = getVisibleItemIds();
  const idx = targetIds.length === 1 ? ids.indexOf(targetIds[0]) : -1;

  for (const id of targetIds) {
    await dataStore.remove(id);
  }
  batch(() => {
    focusedId.value = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : (idx > 0 ? ids[idx - 1] : null);
    editing.value = null;
    selectedRows.value = new Set();
  });
  rebuildIndex();
  toast(targetIds.length === 1 ? 'Item deleted' : `${targetIds.length} items deleted`);
}

export function toggleGlobalColumn(key: string) {
  const cols = [...globalColumns.value];
  const idx = cols.indexOf(key);
  if (idx >= 0) {
    cols.splice(idx, 1);
    toast(`"${key}" unpinned`);
  } else {
    cols.push(key);
    toast(`"${key}" pinned globally`);
  }
  batch(() => {
    globalColumns.value = cols;
    selectedColumn.value = null;
  });
  rebuildIndex();
  persistPrefs();
}

export async function renameColumn(grp: GroupIndex, oldKey: string, newKey: string) {
  const changes: FieldChange[] = [];
  let count = 0;
  for (const item of grp.items) {
    if (item[oldKey] !== undefined) {
      const value = item[oldKey];
      changes.push({ itemId: item[ID], key: oldKey, oldValue: value, newValue: null });
      changes.push({ itemId: item[ID], key: newKey, oldValue: null, newValue: value });
      delete item[oldKey];
      item[newKey] = value;
      await dataStore.save(item[ID], item);
      count++;
    }
  }
  if (changes.length > 0) {
    pushUndo({ type: 'fields', label: `Rename ${oldKey} → ${newKey}`, changes });
  }
  // Update declaredColumns: replace old key with new
  const dc = [...declaredColumns.value];
  const di = dc.indexOf(oldKey);
  if (di >= 0) {
    dc[di] = newKey;
    declaredColumns.value = dc;
  }
  selectedColumn.value = null;
  rebuildIndex();
  persistPrefs();
  toast(`Renamed "${oldKey}" to "${newKey}" on ${count} item${count !== 1 ? 's' : ''}`);
}

export async function deleteColumn(grp: GroupIndex, key: string, label: string) {
  const changes: FieldChange[] = [];
  let count = 0;
  for (const item of grp.items) {
    if (item[key] !== undefined) {
      changes.push({ itemId: item[ID], key, oldValue: item[key], newValue: null });
      delete item[key];
      await dataStore.save(item[ID], item);
      count++;
    }
  }
  if (changes.length > 0) {
    pushUndo({ type: 'fields', label: `Delete column "${label}"`, changes });
  }
  batch(() => {
    const gc = [...globalColumns.value];
    const gi = gc.indexOf(key);
    if (gi >= 0) gc.splice(gi, 1);
    globalColumns.value = gc;

    const co = [...columnOrder.value];
    const ci = co.indexOf(key);
    if (ci >= 0) co.splice(ci, 1);
    columnOrder.value = co;

    const dc = [...declaredColumns.value];
    const di = dc.indexOf(key);
    if (di >= 0) dc.splice(di, 1);
    declaredColumns.value = dc;

    selectedColumn.value = null;
  });
  rebuildIndex();
  persistPrefs();
  toast(`Deleted "${label}" from ${count} item${count !== 1 ? 's' : ''}`);
}

// --- Undo / Redo execution ---

export async function applyUndo() {
  const entry = popUndo();
  if (!entry) return;
  await applyEntry(entry, 'undo');
  rebuildIndex();
  toast('Undo: ' + entry.label);
}

export async function applyRedo() {
  const entry = popRedo();
  if (!entry) return;
  await applyEntry(entry, 'redo');
  rebuildIndex();
  toast('Redo: ' + entry.label);
}

async function applyEntry(entry: UndoEntry, direction: 'undo' | 'redo') {
  if (entry.type === 'fields') {
    // Apply field changes in reverse for undo, forward for redo
    const changes = direction === 'undo' ? [...entry.changes].reverse() : entry.changes;
    for (const ch of changes) {
      const item = items.value.get(ch.itemId);
      if (!item) continue;
      const restoreValue = direction === 'undo' ? ch.oldValue : ch.newValue;
      if (restoreValue == null) {
        delete item[ch.key];
      } else {
        item[ch.key] = restoreValue;
      }
      await dataStore.save(ch.itemId, item);
    }
  } else if (entry.type === 'delete') {
    if (direction === 'undo') {
      // Restore deleted items
      for (const snap of entry.items) {
        const item = { [ID]: snap.itemId } as Item;
        for (const k of Object.keys(snap.fields)) {
          item[k] = snap.fields[k];
        }
        await dataStore.save(snap.itemId, item);
        const newItems = new Map(items.value);
        newItems.set(snap.itemId, item);
        items.value = newItems;
      }
    } else {
      // Re-delete
      for (const snap of entry.items) {
        await dataStore.remove(snap.itemId);
      }
    }
    items.value = dataStore.getAll();
  } else if (entry.type === 'create') {
    if (direction === 'undo') {
      // Remove created items
      for (const cr of entry.items) {
        await dataStore.remove(cr.itemId);
      }
    } else {
      // Can't re-create from just an id — create entries should have full data
      // For now, no-op (create undo is rare)
    }
    items.value = dataStore.getAll();
  }
}

// --- Column ordering ---

export function applyColumnOrder(columns: Column[]): Column[] {
  const order = columnOrder.value;
  if (order.length === 0) return columns;
  const posMap = new Map<string, number>();
  for (let i = 0; i < order.length; i++) posMap.set(order[i], i);
  const sorted = [...columns];
  sorted.sort((a, b) => {
    const ai = posMap.has(a.key) ? posMap.get(a.key)! : order.length + columns.indexOf(a);
    const bi = posMap.has(b.key) ? posMap.get(b.key)! : order.length + columns.indexOf(b);
    return ai - bi;
  });
  return sorted;
}

export function moveColumn(columns: Column[], colKey: string, direction: -1 | 1) {
  const currentKeys = columns.map(c => c.key);
  let order = [...columnOrder.value];
  if (order.length === 0) {
    order = [...currentKeys];
  } else {
    for (const k of currentKeys) {
      if (!order.includes(k)) order.push(k);
    }
  }
  const idx = order.indexOf(colKey);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= order.length) return;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  batch(() => {
    columnOrder.value = order;
    selectedColumn.value = null;
  });
  persistPrefs();
}

export function reorderColumnDrop(columns: Column[], fromKey: string, toKey: string) {
  const currentKeys = columns.map(c => c.key);
  let order = [...columnOrder.value];
  if (order.length === 0) {
    order = [...currentKeys];
  } else {
    for (const k of currentKeys) {
      if (!order.includes(k)) order.push(k);
    }
  }
  const fromIdx = order.indexOf(fromKey);
  const toIdx = order.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0) return;
  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, fromKey);
  batch(() => {
    columnOrder.value = order;
    selectedColumn.value = null;
  });
  persistPrefs();
}

// --- Navigation helpers ---

export function getVisibleItemIds(): string[] {
  const ids: string[] = [];
  collectLeafItems(index.value, ids);
  return ids;
}

function collectLeafItems(groups: GroupIndex[], out: string[]) {
  for (const grp of groups) {
    if (grp.group !== '__all__' && collapsed.value.has(grp.path)) continue;
    for (const item of grp.items) {
      out.push(item[ID]);
    }
    if (grp.children.length > 0) {
      collectLeafItems(grp.children, out);
    }
  }
}

export function findGroupForItem(itemId: string, groups?: GroupIndex[]): GroupIndex | null {
  const searchGroups = groups || index.value;
  for (const grp of searchGroups) {
    if (grp.items.some(i => i[ID] === itemId)) return grp;
    if (grp.children.length > 0) {
      const found = findGroupForItem(itemId, grp.children);
      if (found) return found;
    }
  }
  return null;
}

/** Anchor cell for rectangular selection (where shift-select started). */
export const selectionAnchor = signal<CellRef | null>(null);

/** Extend selection to a rectangular region from anchor to (targetId, targetColKey).
 *  If no anchor is set, uses the current focused cell. */
export function extendSelection(targetId: string, targetColKey: string) {
  const fid = focusedId.value;
  if (!fid) return;

  // Set anchor on first extend
  if (!selectionAnchor.value) {
    const anchorCol = focusedCol.value || targetColKey;
    selectionAnchor.value = { itemId: fid, colKey: anchorCol };
  }

  const anchor = selectionAnchor.value;
  const ids = getVisibleItemIds();
  const fromRowIdx = ids.indexOf(anchor.itemId);
  const toRowIdx = ids.indexOf(targetId);
  if (fromRowIdx < 0 || toRowIdx < 0) return;

  // Get columns for the anchor's group (all selected cells share one column set)
  const cols = getColumnsForItem(anchor.itemId);
  if (cols.length === 0) return;

  const fromColIdx = cols.indexOf(anchor.colKey);
  const toColIdx = cols.indexOf(targetColKey);
  if (fromColIdx < 0 || toColIdx < 0) return;

  const loRow = Math.min(fromRowIdx, toRowIdx);
  const hiRow = Math.max(fromRowIdx, toRowIdx);
  const loCol = Math.min(fromColIdx, toColIdx);
  const hiCol = Math.max(fromColIdx, toColIdx);

  const cells: CellRef[] = [];
  for (let r = loRow; r <= hiRow; r++) {
    for (let c = loCol; c <= hiCol; c++) {
      cells.push({ itemId: ids[r], colKey: cols[c] });
    }
  }
  selectedCells.value = cells;
}

export function selectRowRange(targetId: string) {
  const fid = focusedId.value;
  if (!fid) return;
  const ids = getVisibleItemIds();
  const fromIdx = ids.indexOf(fid);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);

  const newSelected = new Set(selectedRows.value);
  for (let i = lo; i <= hi; i++) {
    newSelected.add(ids[i]);
  }
  selectedRows.value = newSelected;
}

// --- Group-by management ---

export function onGroupLevelsChanged() {
  batch(() => {
    groupingActive.value = groupLevels.value.length > 0;
    dataStore.saveGroupingActive(groupingActive.value);
    collapsed.value = new Set();
    sort.value = null;
  });
  rebuildIndex();
  if (index.value.length > 1) {
    const newCollapsed = new Set<string>();
    for (let i = 1; i < index.value.length; i++) {
      newCollapsed.add(index.value[i].path);
    }
    collapsed.value = newCollapsed;
  }
  persistPrefs();
}

// --- Sync status ---

export function setSyncStatus(status: SyncStatus) {
  syncing.value = status === 'syncing';
  pendingWrites.value = dataStore?.pendingCount ?? 0;
}

// --- Auto-detect group-by ---

export function detectGroupBy(itemsMap: Map<string, Item>): string | null {
  if (itemsMap.size === 0) return null;
  const arr = [...itemsMap.values()];
  const candidates: { key: string; distinctCount: number; fillRate: number }[] = [];
  const skip = new Set(['created_at', 'updated_at', '_color']);

  const allKeys = new Set<string>();
  for (const item of arr) {
    for (const k of Object.keys(item)) allKeys.add(k);
  }

  for (const key of allKeys) {
    if (skip.has(key)) continue;
    const values = arr.map(i => i[key]).filter(v => v != null && v !== '');
    if (values.length === 0) continue;
    const allText = values.every(v => typeof v === 'string');
    if (!allText) continue;
    const distinct = new Set(values.map(v => String(v)));
    const fillRate = values.length / arr.length;
    if (distinct.size >= 2 && distinct.size <= arr.length * 0.5 && fillRate > 0.5) {
      candidates.push({ key, distinctCount: distinct.size, fillRate });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distinctCount - b.distinctCount || b.fillRate - a.fillRate);
  return candidates[0].key;
}

// --- Export / Import ---

export async function exportAll() {
  try {
    const data = await dataStore.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported ' + data.entries.length + ' entries');
  } catch (e) {
    toast(`Export error: ${e}`, true);
  }
}

export function importFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const count = await dataStore.importAll(data);
      items.value = dataStore.getAll();
      const prefs = await dataStore.loadPrefs();
      initState(items.value, prefs);
      toast(`Imported ${count} entries`);
    } catch (e) {
      toast(`Import error: ${e}`, true);
    }
  });
  input.click();
}

// --- Bulk add helpers ---

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function parsePastedTable(text: string): ParsedTable | null {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

  const delim = lines[0].includes('\t') ? '\t' : ',';

  const splitRow = (line: string): string[] => {
    if (delim === '\t') return line.split('\t').map(c => c.trim());
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitRow(lines[0]);
  if (headers.length === 0 || headers.every(h => !h)) return null;

  const rows = lines.slice(1).map(l => {
    const cells = splitRow(l);
    while (cells.length < headers.length) cells.push('');
    return cells.slice(0, headers.length);
  });

  return { headers, rows };
}

export function autoType(val: string): string | number {
  if (!val) return val;
  const trimmed = val.trim();
  const asNum = parseFloat(trimmed.replace(',', '.'));
  if (!isNaN(asNum) && /^-?\d+([.,]\d+)?$/.test(trimmed)) return asNum;
  return trimmed;
}

/** Import parsed table rows as items. Headers are used as field keys directly. */
export async function importParsedItems(parsed: ParsedTable, finalKeys: (string | null)[]): Promise<number> {
  let count = 0;
  for (const row of parsed.rows) {
    const newId = uuid();
    const item = { [ID]: newId } as Item;
    let hasAnyValue = false;

    for (let i = 0; i < finalKeys.length; i++) {
      const key = finalKeys[i];
      if (!key) continue;
      const val = row[i]?.trim();
      if (val) {
        item[key] = autoType(val);
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) continue;
    await dataStore.save(newId, item);
    count++;
  }

  items.value = dataStore.getAll();
  rebuildIndex();
  return count;
}

// --- Pinned column width sync ---

export function syncPinnedColumnWidths() {
  if (globalColumns.value.length === 0) {
    if (pinnedColumnWidths.value.size > 0) pinnedColumnWidths.value = new Map();
    return;
  }
  const tables = document.querySelectorAll('.data-table');
  if (tables.length <= 1) {
    if (pinnedColumnWidths.value.size > 0) pinnedColumnWidths.value = new Map();
    return;
  }

  const pinnedKeys = new Set(globalColumns.value);

  const maxWidths = new Map<string, number>();
  tables.forEach(table => {
    if ((table as HTMLElement).closest('.category-section.collapsed')) return;
    table.querySelectorAll('th[data-col-key]').forEach(th => {
      const key = (th as HTMLElement).dataset.colKey!;
      if (!pinnedKeys.has(key)) return;
      const w = (th as HTMLElement).getBoundingClientRect().width;
      const cur = maxWidths.get(key) ?? 0;
      if (w > cur) maxWidths.set(key, Math.ceil(w));
    });
  });

  const prev = pinnedColumnWidths.value;
  let changed = maxWidths.size !== prev.size;
  if (!changed) {
    for (const [k, v] of maxWidths) {
      if (prev.get(k) !== v) { changed = true; break; }
    }
  }
  if (changed) pinnedColumnWidths.value = maxWidths;
}

// --- Init ---

export function initState(itemsMap: Map<string, Item>, prefs?: ViewPrefs | null) {
  initUndo();

  let gl: string[];
  if (prefs && Array.isArray(prefs.groupLevels) && prefs.groupLevels.length > 0) {
    gl = prefs.groupLevels;
  } else {
    const detected = detectGroupBy(itemsMap);
    gl = detected ? [detected] : [];
  }

  const f = prefs?.filters ?? {};
  const gc = prefs?.globalColumns ?? [];
  const s = prefs?.sort ?? null;
  const co = prefs?.columnOrder ?? [];
  const dc = prefs?.declaredColumns ?? [];

  const sessionGrouping = dataStore.loadGroupingActive();
  const ga = sessionGrouping !== null ? sessionGrouping : gl.length > 0;

  const effectiveGL = ga ? gl : [];

  batch(() => {
    items.value = itemsMap;
    groupLevels.value = gl;
    groupingActive.value = ga;
    globalColumns.value = gc;
    columnOrder.value = co;
    declaredColumns.value = dc;
    sort.value = s;
    filters.value = f;
    collapsed.value = new Set();
    focusedId.value = null;
    focusedCol.value = null;
    editing.value = null;
    selectedCells.value = [];
    selectedRows.value = new Set();
    selectedColumn.value = null;
    search.value = '';
    syncing.value = false;
    pendingWrites.value = 0;
  });

  const newIndex = buildIndex([...itemsMap.values()], effectiveGL, undefined, f, gc, dc);
  if (s) {
    applySortToTree(newIndex, s);
  }
  index.value = newIndex;

  const savedCollapsed = dataStore.loadCollapsed();
  if (savedCollapsed !== null) {
    collapsed.value = savedCollapsed;
  } else if (newIndex.length > 1) {
    const c = new Set<string>();
    for (let i = 1; i < newIndex.length; i++) {
      c.add(newIndex[i].path);
    }
    collapsed.value = c;
    dataStore.saveCollapsed(c);
  }
}
