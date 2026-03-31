import { useRef, useEffect, useState } from 'preact/hooks';
import { Content } from './renderContent';
import type { FlatBlock } from './db';
import type { Block } from './types';
import {
  activeBlockId, blockData,
  saveBlock, deleteBlock,
} from './db';
import { beginUndo, commitUndo } from './undo';
import { getTableGrid, insertTableRow, insertTableCol, reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol } from './table';
import { shared, getVisualDepth, startBlockDrag } from './editorState';

// Module-level drag state for table row/col reordering
let dragRowState: { tableId: string; rowOrder: number } | null = null;
let dragColState: { tableId: string; colOrder: number } | null = null;

// --- Context menu ---

type MenuState = { x: number; y: number; items: Array<{ label: string; action: () => void }> } | null;

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} class="context-menu" style={`left:${menu.x}px;top:${menu.y}px`}>
      {menu.items.map(item => (
        <button
          key={item.label}
          class="context-menu-item"
          onClick={() => { item.action(); onClose(); }}
        >{item.label}</button>
      ))}
    </div>
  );
}

// --- Table ---

export function TableBlock({ node }: { node: FlatBlock }) {
  const grid = getTableGrid(node.id);
  if (grid.length === 0) return null;

  const colOrders = grid[0].cells.map(c => c.col ?? 0);
  const [menu, setMenu] = useState<MenuState>(null);

  function onRowContext(e: MouseEvent, rowOrder: number) {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Insert row above', action: () => {
          const g = getTableGrid(node.id);
          const idx = g.findIndex(r => r.order === rowOrder);
          const prev = g[idx - 1];
          insertTableRow(node.id, prev ? prev.order : undefined);
          // If no prev, we need to insert before the first row
          if (!prev) {
            const newGrid = getTableGrid(node.id);
            reorderTableRow(node.id, newGrid[newGrid.length - 1].order, rowOrder, 'before');
          }
        }},
        { label: 'Insert row below', action: () => insertTableRow(node.id, rowOrder) },
        { label: 'Delete row', action: () => deleteTableRow(node.id, rowOrder) },
      ],
    });
  }

  function onColContext(e: MouseEvent, colOrder: number) {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Insert column left', action: () => {
          const g = getTableGrid(node.id);
          const cols = g[0].cells.map(c => c.col ?? 0);
          const idx = cols.indexOf(colOrder);
          const prev = cols[idx - 1];
          insertTableCol(node.id, prev !== undefined ? prev : undefined);
          if (prev === undefined) {
            const newGrid = getTableGrid(node.id);
            const newCols = newGrid[0].cells.map(c => c.col ?? 0);
            const lastCol = newCols[newCols.length - 1];
            reorderTableCol(node.id, lastCol, colOrder, 'before');
          }
        }},
        { label: 'Insert column right', action: () => insertTableCol(node.id, colOrder) },
        { label: 'Delete column', action: () => deleteTableCol(node.id, colOrder) },
      ],
    });
  }

  function onRowDragStart(rowOrder: number) {
    dragRowState = { tableId: node.id, rowOrder };
    dragColState = null;
  }

  function onRowDragOver(e: DragEvent, targetOrder: number) {
    if (!dragRowState || dragRowState.tableId !== node.id) return;
    if (dragRowState.rowOrder === targetOrder) return;
    e.preventDefault();
    const tr = (e.currentTarget as HTMLElement);
    const rect = tr.getBoundingClientRect();
    const half = (e.clientY - rect.top) / rect.height;
    tr.classList.remove('drop-row-before', 'drop-row-after');
    tr.classList.add(half < 0.5 ? 'drop-row-before' : 'drop-row-after');
  }

  function onRowDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('drop-row-before', 'drop-row-after');
  }

  function onRowDrop(e: DragEvent, targetOrder: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drop-row-before', 'drop-row-after');
    if (!dragRowState || dragRowState.tableId !== node.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientY - rect.top) / rect.height;
    reorderTableRow(node.id, dragRowState.rowOrder, targetOrder, half < 0.5 ? 'before' : 'after');
    dragRowState = null;
  }

  function onColDragStart(colOrder: number) {
    dragColState = { tableId: node.id, colOrder };
    dragRowState = null;
  }

  function onColDragOver(e: DragEvent, targetCol: number) {
    if (!dragColState || dragColState.tableId !== node.id) return;
    if (dragColState.colOrder === targetCol) return;
    e.preventDefault();
    const td = (e.currentTarget as HTMLElement);
    const rect = td.getBoundingClientRect();
    const half = (e.clientX - rect.left) / rect.width;
    td.classList.remove('drop-col-before', 'drop-col-after');
    td.classList.add(half < 0.5 ? 'drop-col-before' : 'drop-col-after');
  }

  function onColDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('drop-col-before', 'drop-col-after');
  }

  function onColDrop(e: DragEvent, targetCol: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drop-col-before', 'drop-col-after');
    if (!dragColState || dragColState.tableId !== node.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientX - rect.left) / rect.width;
    reorderTableCol(node.id, dragColState.colOrder, targetCol, half < 0.5 ? 'before' : 'after');
    dragColState = null;
  }

  function onDragEnd() {
    dragRowState = null;
    dragColState = null;
    shared.dragBlockId = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  const colCount = colOrders.length;

  return (
    <div class="block table-block" style={`--depth: ${getVisualDepth(node)}`} onDragEnd={onDragEnd}>
      <span
        class="gutter table-gutter"
        draggable
        tabIndex={0}
        onClick={() => { activeBlockId.value = node.id; }}
        onKeyDown={(e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Backspace' || ke.key === 'Delete') {
            ke.preventDefault();
            beginUndo('delete table');
            void deleteBlock(node.id);
            commitUndo();
            activeBlockId.value = null;
          }
        }}
        onDragStart={(e: Event) => startBlockDrag(e as DragEvent, node.id)}
      />
      <div class="table-grid" style={`grid-template-columns: repeat(${colCount}, 1fr)`}>
        {grid.map((row, ri) =>
          row.cells.map((cell, ci) => {
            const colOrder = cell.col ?? 0;
            return (
              <div
                key={cell.id}
                class={`table-cell${ri === 0 ? ' table-header-cell' : ''}`}
                onClick={() => { if (activeBlockId.value !== cell.id) activeBlockId.value = cell.id; }}
                onDragOver={(e: Event) => {
                  onRowDragOver(e as DragEvent, row.order);
                  onColDragOver(e as DragEvent, colOrder);
                }}
                onDragLeave={(e: Event) => {
                  onRowDragLeave(e as DragEvent);
                  onColDragLeave(e as DragEvent);
                }}
                onDrop={(e: Event) => {
                  onRowDrop(e as DragEvent, row.order);
                  onColDrop(e as DragEvent, colOrder);
                }}
              >
                {ci === 0 && (
                  <span
                    class="row-handle"
                    draggable
                    onDragStart={() => onRowDragStart(row.order)}
                    onContextMenu={(e: Event) => onRowContext(e as MouseEvent, row.order)}
                  >⠿</span>
                )}
                {ri === 0 && (
                  <span
                    class="col-handle"
                    draggable
                    onDragStart={() => onColDragStart(colOrder)}
                    onContextMenu={(e: Event) => onColContext(e as MouseEvent, colOrder)}
                  >⋯</span>
                )}
                {activeBlockId.value === cell.id ? (
                  <CellEditor cell={cell} />
                ) : (
                  <span><Content text={cell.content} fallback="&nbsp;" /></span>
                )}
              </div>
            );
          })
        )}
      </div>
      <div class="table-add-col" onClick={() => insertTableCol(node.id)} title="Add column">+</div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

// --- Cell editor ---

function CellEditor({ cell }: { cell: Block }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = cell.content;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    if (el.childNodes.length > 0) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }, [cell.id]);

  function handleBlur() {
    if (!ref.current) return;
    const content = ref.current.textContent || '';
    if (content !== cell.content) saveBlock({ ...cell, content });
    if (activeBlockId.value === cell.id) activeBlockId.value = null;
  }

  function flushContent() {
    const el = ref.current!;
    const content = el.textContent || '';
    if (content !== cell.content) saveBlock({ ...cell, content });
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      flushContent();
      const grid = getTableGrid(cell.parent!);
      const allCells = grid.flatMap(r => r.cells);
      const idx = allCells.findIndex(c => c.id === cell.id);
      const next = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
      if (next) {
        activeBlockId.value = next.id;
      } else if (!e.shiftKey) {
        // Tab past last cell → add a new row, focus its first cell
        const newCellIds = insertTableRow(cell.parent!);
        if (newCellIds.length > 0) activeBlockId.value = newCellIds[0];
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      flushContent();
      const grid = getTableGrid(cell.parent!);
      const rowIdx = grid.findIndex(r => r.cells.some(c => c.id === cell.id));
      const colIdx = grid[rowIdx].cells.findIndex(c => c.id === cell.id);
      const nextRow = grid[rowIdx + 1];
      if (nextRow && nextRow.cells[colIdx]) {
        activeBlockId.value = nextRow.cells[colIdx].id;
      } else {
        // Enter on last row → add a new row, focus same column
        const newCellIds = insertTableRow(cell.parent!, grid[rowIdx].order);
        if (newCellIds[colIdx]) activeBlockId.value = newCellIds[colIdx];
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      activeBlockId.value = null;
      return;
    }
  }

  return (
    <div
      ref={ref}
      class="cell-editor"
      contentEditable
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
