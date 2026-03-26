// ============================================================================
// Lattice Inventory — Index Engine
//
// Turns a flat array of schemaless JSON items into structured table data.
// Derives columns per group, infers types, handles search/sort/filter.
// No hardcoded field assumptions — structure emerges from data.
// ============================================================================

import type { Item, Column, ColumnType, GroupIndex } from './types';
import { ID } from './types';

// --- Constants ---

/** Keys always hidden from table columns (internal metadata). */
const HIDDEN_KEYS = new Set(['id', 'created_at', 'updated_at', '_color']);

/** Stable group colors — deterministic from group name. */
const GROUP_COLORS = [
  '#6e8efb', // blue
  '#e8a838', // amber
  '#5ec490', // green
  '#e06070', // rose
  '#a78bfa', // violet
  '#f472b6', // pink
  '#38bdf8', // sky
  '#fb923c', // orange
  '#34d399', // emerald
  '#c084fc', // purple
];

// --- Type inference ---

const NUMBER_RE = /^-?\d+([.,]\d+)?$/;

/**
 * Infer the column type from all non-null values.
 * Intentionally conservative — only distinguishes number vs text.
 */
export function inferType(values: unknown[]): { type: ColumnType } {
  const nonNull = values.filter(v => v != null && v !== '');
  if (nonNull.length === 0) return { type: 'text' };

  const allNumbers = nonNull.every(v =>
    typeof v === 'number' || (typeof v === 'string' && NUMBER_RE.test(v.trim())),
  );
  if (allNumbers) return { type: 'number' };

  const anyLong = nonNull.some(v => typeof v === 'string' && v.length > 100);
  if (anyLong) return { type: 'longtext' };

  return { type: 'text' };
}

// --- Column derivation ---

/**
 * Derive columns for a set of items.
 * @param groupByKeys - key(s) used for grouping (hidden from columns since they're in section headers).
 * @param globalColumns - field keys that are always included even if no item in this group has them.
 * @param allItems - all items across all groups (needed to infer type for global columns absent from this group).
 * @param declaredColumns - user-created columns that should appear even at 0% fill rate.
 */
export function deriveColumns(
  items: Item[],
  groupByKeys: string | string[] | null,
  globalColumns?: string[],
  allItems?: Item[],
  declaredColumns?: string[],
): Column[] {
  const hideKeys = new Set<string>();
  if (Array.isArray(groupByKeys)) {
    for (const k of groupByKeys) hideKeys.add(k);
  } else if (groupByKeys) {
    hideKeys.add(groupByKeys);
  }

  const keyCounts = new Map<string, number>();
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (HIDDEN_KEYS.has(key)) continue;
      if (hideKeys.has(key)) continue;
      const val = item[key];
      if (val != null && val !== '') {
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      }
    }
  }

  // Ensure global columns are present even with 0 fill rate in this group
  if (globalColumns) {
    for (const gk of globalColumns) {
      if (HIDDEN_KEYS.has(gk) || hideKeys.has(gk)) continue;
      if (!keyCounts.has(gk)) {
        keyCounts.set(gk, 0);
      }
    }
  }

  // Ensure declared columns are present even with 0 fill rate
  if (declaredColumns) {
    for (const dk of declaredColumns) {
      if (HIDDEN_KEYS.has(dk) || hideKeys.has(dk)) continue;
      if (!keyCounts.has(dk)) {
        keyCounts.set(dk, 0);
      }
    }
  }

  const columns: Column[] = [];
  for (const [key, count] of keyCounts) {
    let values = items.map(i => i[key]);
    const hasLocal = values.some(v => v != null && v !== '');
    if (!hasLocal && allItems) {
      values = allItems.map(i => i[key]);
    }
    const { type } = inferType(values);
    columns.push({
      key,
      type,
      fillRate: items.length > 0 ? count / items.length : 0,
    });
  }

  const globalSet = new Set(globalColumns || []);

  // Sort: global columns first, then by fill rate descending
  columns.sort((a, b) => {
    const aGlobal = globalSet.has(a.key) ? 1 : 0;
    const bGlobal = globalSet.has(b.key) ? 1 : 0;
    if (aGlobal !== bGlobal) return bGlobal - aGlobal;
    return b.fillRate - a.fillRate;
  });

  return columns;
}

// --- Group color ---

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function groupColor(group: string): string {
  return GROUP_COLORS[hashStr(group) % GROUP_COLORS.length];
}

// --- Apply filters ---

function applyFilters(items: Item[], filters: Record<string, string[]>): Item[] {
  let filtered = items;
  for (const [key, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue;
    const valSet = new Set(values);
    filtered = filtered.filter(item => {
      const v = item[key];
      const sv = v != null && v !== '' ? String(v) : '(none)';
      return valSet.has(sv);
    });
  }
  return filtered;
}

// --- Build full index ---

/**
 * Build a complete index from all items.
 * @param groupLevels - ordered field keys for hierarchical grouping; empty = flat
 * @param filters - active filters: field → selected values
 * @param globalColumns - field keys pinned as always-visible across all groups
 */
export function buildIndex(
  items: Item[],
  groupLevels: string[],
  search?: string,
  filters?: Record<string, string[]>,
  globalColumns?: string[],
  declaredColumns?: string[],
): GroupIndex[] {
  let filtered = items;

  // Global search: match any field value
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = items.filter(item =>
      Object.values(item).some(v => {
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  }

  // Apply field-value filters
  if (filters) {
    filtered = applyFilters(filtered, filters);
  }

  if (filtered.length === 0) return [];

  const allItems = filtered;

  if (groupLevels.length === 0) {
    const columns = deriveColumns(filtered, null, globalColumns, allItems, declaredColumns);
    return [{
      group: '__all__',
      path: '__all__',
      level: 0,
      label: 'All items',
      color: GROUP_COLORS[0],
      columns,
      items: filtered,
      children: [],
    }];
  }

  return buildGroupLevel(filtered, groupLevels, 0, '', globalColumns, allItems, declaredColumns);
}

/**
 * Recursively build group levels.
 */
function buildGroupLevel(
  items: Item[],
  groupLevels: string[],
  level: number,
  parentPath: string,
  globalColumns?: string[],
  allItems?: Item[],
  declaredColumns?: string[],
): GroupIndex[] {
  const groupBy = groupLevels[level];
  const isLeaf = level === groupLevels.length - 1;
  const hiddenKeys = groupLevels.slice(0, level + 1);

  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const val = item[groupBy];
    const groupVal = val != null && val !== '' ? String(val) : '(none)';
    let arr = groups.get(groupVal);
    if (!arr) {
      arr = [];
      groups.set(groupVal, arr);
    }
    arr.push(item);
  }

  const result: GroupIndex[] = [];
  for (const [group, groupItems] of groups) {
    const path = parentPath ? `${parentPath}/${group}` : group;

    if (isLeaf) {
      const columns = deriveColumns(groupItems, hiddenKeys, globalColumns, allItems, declaredColumns);
      result.push({
        group,
        path,
        level,
        label: group === '(none)' ? '(none)' : group,
        color: groupColor(group),
        columns,
        items: groupItems,
        children: [],
      });
    } else {
      const children = buildGroupLevel(groupItems, groupLevels, level + 1, path, globalColumns, allItems, declaredColumns);

      let directItems: Item[] = [];
      const realChildren: GroupIndex[] = [];
      for (const child of children) {
        if (child.group === '(none)') {
          directItems = directItems.concat(collectAllItems(child));
        } else {
          realChildren.push(child);
        }
      }

      const columns = deriveColumns(
        directItems.length > 0 ? directItems : groupItems,
        hiddenKeys, globalColumns, allItems, declaredColumns,
      );
      result.push({
        group,
        path,
        level,
        label: group === '(none)' ? '(none)' : group,
        color: groupColor(group),
        columns,
        items: directItems,
        children: realChildren,
      });
    }
  }

  result.sort((a, b) => {
    if (a.group === '(none)') return 1;
    if (b.group === '(none)') return -1;
    return a.group.localeCompare(b.group);
  });

  return result;
}

/** Recursively collect all items from a group tree node. */
function collectAllItems(grp: GroupIndex): Item[] {
  if (grp.children.length === 0) return grp.items;
  const result: Item[] = [...grp.items];
  for (const child of grp.children) {
    result.push(...collectAllItems(child));
  }
  return result;
}

// --- Sort items ---

export function sortItems(items: Item[], column: string, dir: 'asc' | 'desc'): Item[] {
  const sorted = [...items];
  const mul = dir === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    const av = a[column];
    const bv = b[column];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * mul;
  });
  return sorted;
}

// --- Discover all unique field keys across all items ---

export function allFieldKeys(items: Item[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (!HIDDEN_KEYS.has(k)) keys.add(k);
    }
  }
  return [...keys].sort();
}
