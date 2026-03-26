// ============================================================================
// Lattice Inventory — Keyboard Handler Hook
// ============================================================================

import { useEffect } from 'preact/hooks';
import { batch } from '@preact/signals';
import {
  focusedId, focusedCol, editing, selectedCells, selectedRows,
  selectedColumn, search, items, contextMenu, confirmDialog,
  rebuildIndex, extendSelection, getVisibleItemIds, getColumnsForItem, saveField,
  createItemBelowFocused, deleteItems, toast, showNewItemModal, pendingEditChar, arrowMove, copyGroupFields,
  itemLabel, firstColumnKey, selectionAnchor, findGroupForItem,
  uuid, getDataStore, groupLevels,
  applyUndo, applyRedo, beginUndoBatch, commitUndoBatch,
} from './state';
import { ID } from './types';
import type { Item } from './types';

export function useKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Cmd+Z / Cmd+Shift+Z — undo/redo
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !isInput) {
        e.preventDefault();
        if (e.shiftKey) {
          applyRedo();
        } else {
          applyUndo();
        }
        return;
      }

      // / to focus search
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null;
        if (searchInput) searchInput.focus();
        return;
      }

      // n to create new item
      if (e.key === 'n' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        showNewItemModal.value = true;
        return;
      }

      if (e.key === 'Escape') {
        if (contextMenu.value) {
          contextMenu.value = null;
          return;
        }
        if (confirmDialog.value) {
          confirmDialog.value = null;
          return;
        }
        if (isInput && !target.classList.contains('search-input')) {
          target.blur();
          return;
        }
        if (selectedColumn.value) {
          selectedColumn.value = null;
          return;
        }
        if (selectedRows.value.size > 0) {
          selectedRows.value = new Set();
          return;
        }
        if (focusedId.value && !isInput) {
          batch(() => {
            focusedId.value = null;
            focusedCol.value = null;
            editing.value = null;
            selectedCells.value = [];
            selectionAnchor.value = null;
          });
          return;
        }
        if (isInput && target.classList.contains('search-input')) {
          (target as HTMLInputElement).value = '';
          search.value = '';
          target.blur();
          rebuildIndex();
          return;
        }
      }

      // Arrow keys — navigate or extend selection
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isInput && focusedId.value) {
        e.preventDefault();
        const ids = getVisibleItemIds();
        if (ids.length === 0) return;
        const cols = getColumnsForItem(focusedId.value);
        if (cols.length === 0) return;

        const curRowIdx = ids.indexOf(focusedId.value);
        const curColIdx = focusedCol.value ? cols.indexOf(focusedCol.value) : 0;
        const next = arrowMove(e.key, curRowIdx, curColIdx, ids.length, cols.length);

        if (e.shiftKey) {
          // Set anchor before moving cursor (anchor = where selection started)
          if (!selectionAnchor.value) {
            selectionAnchor.value = {
              itemId: ids[curRowIdx],
              colKey: cols[curColIdx < 0 ? 0 : curColIdx],
            };
          }
          batch(() => {
            focusedId.value = ids[next.row];
            focusedCol.value = cols[next.col];
          });
          extendSelection(ids[next.row], cols[next.col]);
        } else {
          // Clear selection, move cursor
          selectionAnchor.value = null;
          batch(() => {
            focusedId.value = ids[next.row];
            focusedCol.value = cols[next.col];
            editing.value = null;
            selectedCells.value = [];
            selectedColumn.value = null;
          });
        }
        return;
      }

      // Arrow up/down without focus (start navigating)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isInput && !focusedId.value) {
        e.preventDefault();
        const ids = getVisibleItemIds();
        if (ids.length === 0) return;
        const nextIdx = e.key === 'ArrowDown' ? 0 : ids.length - 1;
        batch(() => {
          focusedId.value = ids[nextIdx];
          editing.value = null;
          selectedCells.value = [];
          selectedColumn.value = null;
        });
        return;
      }

      // Shift+Enter: create item below
      if (e.key === 'Enter' && e.shiftKey && !isInput && focusedId.value) {
        e.preventDefault();
        createItemBelowFocused();
        return;
      }

      // Enter: move down
      if (e.key === 'Enter' && !isInput && focusedId.value && !editing.value) {
        e.preventDefault();
        const ids = getVisibleItemIds();
        const curIdx = ids.indexOf(focusedId.value);
        if (curIdx >= 0 && curIdx < ids.length - 1) {
          focusedId.value = ids[curIdx + 1];
        }
        return;
      }

      // Tab
      if (e.key === 'Tab' && !isInput && focusedId.value) {
        e.preventDefault();
        const cols = getColumnsForItem(focusedId.value);
        if (cols.length === 0) return;
        const curColIdx = focusedCol.value ? cols.indexOf(focusedCol.value) : -1;
        const dir = e.shiftKey ? -1 : 1;
        let nextColIdx = curColIdx + dir;

        if (nextColIdx >= cols.length) {
          const ids = getVisibleItemIds();
          const curRowIdx = ids.indexOf(focusedId.value);
          if (curRowIdx < ids.length - 1) {
            const nextCols = getColumnsForItem(ids[curRowIdx + 1]);
            batch(() => {
              focusedId.value = ids[curRowIdx + 1];
              focusedCol.value = nextCols[0] || cols[0];
            });
          }
        } else if (nextColIdx < 0) {
          const ids = getVisibleItemIds();
          const curRowIdx = ids.indexOf(focusedId.value);
          if (curRowIdx > 0) {
            const prevCols = getColumnsForItem(ids[curRowIdx - 1]);
            batch(() => {
              focusedId.value = ids[curRowIdx - 1];
              focusedCol.value = prevCols[prevCols.length - 1] || cols[cols.length - 1];
            });
          }
        } else {
          focusedCol.value = cols[nextColIdx];
        }
        return;
      }

      // F2: start editing in text-mode (cursor in text)
      if (e.key === 'F2' && !isInput && focusedId.value) {
        e.preventDefault();
        const editCol = focusedCol.value || (selectedCells.value.length > 0 ? selectedCells.value[0].colKey : firstColumnKey(focusedId.value));
        if (editCol) {
          batch(() => {
            editing.value = { itemId: focusedId.value!, colKey: editCol, deep: true };
          });
        }
        return;
      }

      // Cmd/Ctrl+C — copy as TSV (tab-separated rows, Excel/Numbers compatible)
      if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !isInput && focusedId.value && !editing.value) {
        e.preventDefault();
        let text = '';
        const cells = selectedCells.value;
        if (cells.length > 0) {
          // Extract unique rows and columns in order
          const rowIds: string[] = [];
          const colKeys: string[] = [];
          const rowSet = new Set<string>();
          const colSet = new Set<string>();
          for (const c of cells) {
            if (!rowSet.has(c.itemId)) { rowIds.push(c.itemId); rowSet.add(c.itemId); }
            if (!colSet.has(c.colKey)) { colKeys.push(c.colKey); colSet.add(c.colKey); }
          }
          // Build TSV: rows separated by \n, columns by \t
          const rows: string[] = [];
          for (const rowId of rowIds) {
            const vals: string[] = [];
            for (const colKey of colKeys) {
              const item = items.value.get(rowId);
              vals.push(item ? String(item[colKey] ?? '') : '');
            }
            rows.push(vals.join('\t'));
          }
          text = rows.join('\n');
        } else if (focusedCol.value) {
          const item = items.value.get(focusedId.value);
          if (item) text = String(item[focusedCol.value] ?? '');
        }
        if (text) navigator.clipboard.writeText(text);
        return;
      }

      // Cmd/Ctrl+V — paste TSV grid starting at cursor position
      if (e.key === 'v' && (e.metaKey || e.ctrlKey) && !isInput && focusedId.value && !editing.value) {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (!text) return;

          // Parse as TSV grid (rows = \n, columns = \t)
          const rows = text.split(/\r?\n/).filter(l => l !== '');
          const grid = rows.map(r => r.split('\t'));

          // Constrain paste to the focused item's group
          const grp = findGroupForItem(focusedId.value!);
          if (!grp) return;
          const groupIds = grp.items.map(i => i[ID]);

          const startRowIdx = groupIds.indexOf(focusedId.value!);
          if (startRowIdx < 0) return;

          const cols = getColumnsForItem(focusedId.value!);
          const startColIdx = focusedCol.value ? cols.indexOf(focusedCol.value) : 0;
          if (startColIdx < 0) return;

          const ds = getDataStore();
          const focusedItem = items.value.get(focusedId.value!);

          // Build the full list of row IDs, creating new items for overflow rows
          const allRowIds = [...groupIds];
          const newItems = new Map(items.value);
          for (let r = 0; r < grid.length; r++) {
            const targetIdx = startRowIdx + r;
            if (targetIdx >= allRowIds.length) {
              // Create a new item with group fields pre-filled
              const newId = uuid();
              const newItem = { [ID]: newId } as Item;
              if (focusedItem) copyGroupFields(focusedItem, newItem);
              allRowIds.push(newId);
              newItems.set(newId, newItem);
            }
          }
          items.value = newItems;

          beginUndoBatch('Paste');
          const promises: Promise<void>[] = [];
          const pastedCells: { itemId: string; colKey: string }[] = [];
          let endRowIdx = startRowIdx;
          let endColIdx = startColIdx;
          for (let r = 0; r < grid.length; r++) {
            const rowId = allRowIds[startRowIdx + r];
            const rowCells = grid[r];
            for (let c = 0; c < rowCells.length && startColIdx + c < cols.length; c++) {
              const val = rowCells[c].trim();
              const colKey = cols[startColIdx + c];
              promises.push(saveField(rowId, colKey, val));
              pastedCells.push({ itemId: rowId, colKey });
              endRowIdx = Math.max(endRowIdx, startRowIdx + r);
              endColIdx = Math.max(endColIdx, startColIdx + c);
            }
          }
          Promise.all(promises).then(() => {
            commitUndoBatch();
            batch(() => {
              selectedCells.value = pastedCells;
              selectionAnchor.value = { itemId: allRowIds[startRowIdx], colKey: cols[startColIdx] };
              focusedId.value = allRowIds[endRowIdx];
              focusedCol.value = cols[endColIdx];
            });
            rebuildIndex();
          });
        });
        return;
      }

      // Delete/Backspace — clear cell content or multi-selection
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && focusedId.value && !editing.value) {
        e.preventDefault();
        const cells = selectedCells.value;
        if (cells.length > 0) {
          // Clear all selected cells
          beginUndoBatch(`Clear ${cells.length} cells`);
          const promises = cells.map(c => saveField(c.itemId, c.colKey, ''));
          Promise.all(promises).then(() => { commitUndoBatch(); rebuildIndex(); });
          return;
        }
        if (focusedCol.value) {
          // Clear the focused cell
          saveField(focusedId.value, focusedCol.value, '').then(() => rebuildIndex());
          return;
        }
        // No column focused — delete the row
        const id = focusedId.value;
        const label = itemLabel(id);
        confirmDialog.value = {
          title: 'Delete item?',
          message: `Are you sure you want to delete "${label}"? This cannot be undone.`,
          confirmLabel: 'Delete',
          onConfirm: () => deleteItems([id]),
        };
        return;
      }

      // Type printable char: start cell-mode editing (replaces content)
      if (!isInput && focusedId.value && !editing.value && !e.metaKey && !e.ctrlKey && !e.altKey
          && e.key.length === 1) {
        const editCol = focusedCol.value || firstColumnKey(focusedId.value);
        if (!editCol) return;
        pendingEditChar.value = e.key;
        batch(() => {
          editing.value = { itemId: focusedId.value!, colKey: editCol, deep: false };
        });
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
