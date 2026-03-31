// Table CRUD operations.

import type { Block } from './types';
import { blockData, saveBlock, deleteBlock, getSiblings, orderBetween, maybeRebalance } from './db';

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
