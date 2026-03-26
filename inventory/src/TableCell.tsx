// ============================================================================
// Lattice Inventory — TableCell Component
//
// Cell states (Excel model):
//   null (ready)  — focused, no input. Arrows navigate. Typing → enter.
//   deep=false    — Enter mode. Input shown. Arrows save+navigate. Typing/Backspace in text.
//   deep=true     — Edit mode.  Input shown. Arrows move cursor in text.
// ============================================================================

import { useCallback, useRef, useEffect } from 'preact/hooks';
import { batch } from '@preact/signals';
import type { Item, Column, GroupIndex } from './types';
import {
  focusedId, focusedCol, editing, selectedCells, selectedColumn, items,
  extendSelection, saveField, rebuildIndex, getVisibleItemIds, getColumnsForItem,
  toast, pendingEditChar, pinnedColumnWidths, globalColumns,
  draftItems, discardDraft, selectionAnchor, arrowMove,
} from './state';

export function TableCell({ itemId, item, col, grp, colIdx, properColumns }: {
  itemId: string;
  item: Item;
  col: Column;
  grp: GroupIndex;
  colIdx: number;
  properColumns: Column[];
}) {
  const isFocused = itemId === focusedId.value;
  const isCellCursor = isFocused && focusedCol.value === col.key;
  const ed = editing.value;
  const isThis = ed && ed.itemId === itemId && ed.colKey === col.key;
  const isEnter = isThis && !ed!.deep;
  const isEdit  = isThis && ed!.deep;
  const isActive = !!isThis;
  const isMultiSelected = selectedCells.value.some(c => c.itemId === itemId && c.colKey === col.key);
  const isColSelected = selectedColumn.value?.groupPath === grp.path && selectedColumn.value?.key === col.key;
  const value = item[col.key];
  const inputRef = useRef<HTMLInputElement>(null);
  const tdRef = useRef<HTMLTableCellElement>(null);

  // --- Focus input on activation ---
  useEffect(() => {
    if (!isActive || !inputRef.current) return;
    const input = inputRef.current;
    input.focus();
    const ch = pendingEditChar.value;
    if (ch) {
      input.value = ch;
      input.selectionStart = input.selectionEnd = ch.length;
      pendingEditChar.value = null;
    } else {
      const len = input.value.length;
      input.selectionStart = input.selectionEnd = len;
    }
  }, [isActive]);

  // --- Scroll into view ---
  useEffect(() => {
    if (isCellCursor && tdRef.current) {
      tdRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [isCellCursor]);

  // --- Save + move focus (arrows: exit editing; tab: stay in Enter mode) ---
  const saveAndGo = useCallback((nextItemId: string, nextColKey: string, keepEditing: boolean) => {
    const input = inputRef.current;
    if (!input) return;
    const isNum = typeof value === 'number';
    saveField(itemId, col.key, input.value, isNum).then(() => {
      batch(() => {
        focusedId.value = nextItemId;
        focusedCol.value = nextColKey;
        editing.value = keepEditing ? { itemId: nextItemId, colKey: nextColKey, deep: false } : null;
        selectedCells.value = [];
        selectionAnchor.value = null;
      });
      rebuildIndex();
    });
  }, [itemId, col.key, value]);

  // --- Save + exit to ready ---
  const commitAndExit = useCallback(async () => {
    const input = inputRef.current;
    if (!input) return;
    const rawValue = input.value;
    if (draftItems.value.has(itemId) && !rawValue.trim()) {
      discardDraft(itemId);
      return;
    }
    const isNum = typeof value === 'number';
    const cells = selectedCells.value;
    if (cells.length > 1) {
      for (const cell of cells) {
        await saveField(cell.itemId, cell.colKey, rawValue, isNum);
      }
      selectedCells.value = [];
      toast(`Updated ${cells.length} cells`);
    } else {
      await saveField(itemId, col.key, rawValue, isNum);
    }
    editing.value = null;
    rebuildIndex();
  }, [itemId, col.key, value]);

  // --- Key handling ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAndExit();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (isEdit) {
        // Edit → Enter
        editing.value = { itemId, colKey: col.key, deep: false };
        return;
      }
      // Enter → Ready
      if (draftItems.value.has(itemId)) {
        discardDraft(itemId);
      } else {
        editing.value = null;
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const next = colIdx + dir;
      if (next >= 0 && next < properColumns.length) {
        saveAndGo(itemId, properColumns[next].key, true);
      } else if (!e.shiftKey) {
        const ids = getVisibleItemIds();
        const ri = ids.indexOf(itemId);
        if (ri >= 0 && ri < ids.length - 1) {
          saveAndGo(ids[ri + 1], properColumns[0].key, true);
        } else { commitAndExit(); }
      } else {
        const ids = getVisibleItemIds();
        const ri = ids.indexOf(itemId);
        if (ri > 0) {
          saveAndGo(ids[ri - 1], properColumns[properColumns.length - 1].key, true);
        } else { commitAndExit(); }
      }
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      editing.value = { itemId, colKey: col.key, deep: !ed!.deep };
      return;
    }

    // Enter mode: arrows save+navigate
    if (isEnter && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const ids = getVisibleItemIds();
      const cols = getColumnsForItem(itemId);
      const ri = ids.indexOf(itemId);
      const ci = cols.indexOf(col.key);
      const next = arrowMove(e.key, ri, ci, ids.length, cols.length);
      if (next.row !== ri || next.col !== ci) saveAndGo(ids[next.row], cols[next.col], false);
      return;
    }
    // Edit mode: arrows handled natively by input
  }, [itemId, col.key, colIdx, properColumns, value, isEnter, isEdit, ed, commitAndExit, saveAndGo]);

  // --- Click on Enter-mode input → Edit mode ---
  const handleInputClick = useCallback((e: MouseEvent) => {
    if (isEnter) {
      e.stopPropagation();
      editing.value = { itemId, colKey: col.key, deep: true };
    }
  }, [isEnter, itemId, col.key]);

  // --- Blur: save if still active ---
  const handleBlur = useCallback((_e: FocusEvent) => {
    setTimeout(() => {
      const cur = editing.value;
      if (cur && cur.itemId === itemId && cur.colKey === col.key) {
        commitAndExit();
      }
    }, 0);
  }, [itemId, col.key, commitAndExit]);

  // --- Ready-mode handlers ---
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.shiftKey && focusedId.value) {
      e.preventDefault();
      e.stopPropagation();
      extendSelection(itemId, col.key);
    }
  }, [itemId, col.key]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (e.shiftKey) e.stopPropagation();
  }, []);

  const handleDblClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    batch(() => {
      focusedId.value = itemId;
      focusedCol.value = col.key;
      editing.value = { itemId, colKey: col.key, deep: true };
      selectedColumn.value = null;
    });
  }, [itemId, col.key]);

  // --- Style ---
  const isPinned = globalColumns.value.includes(col.key);
  const minW = isPinned ? pinnedColumnWidths.value.get(col.key) : undefined;
  const cellStyle = minW ? { minWidth: `${minW}px` } : undefined;

  const classes = [
    col.type === 'number' ? 'align-right cell-number' : '',
    isColSelected ? 'col-selected' : '',
    isCellCursor ? 'cell-cursor' : '',
    isMultiSelected ? 'cell-multi-selected' : '',
    isActive ? 'cell-editing' : '',
  ].filter(Boolean).join(' ');

  if (isActive) {
    const isNum = typeof value === 'number';
    return (
      <td ref={tdRef} class={classes || undefined} data-id={itemId} data-col={col.key} style={cellStyle}>
        <input
          ref={inputRef}
          class={`cell-input${isNum ? ' mono' : ''}`}
          type={isNum ? 'number' : 'text'}
          step={isNum ? 'any' : undefined}
          value={value != null ? String(value) : ''}
          placeholder={selectedCells.value.length > 1 ? `${selectedCells.value.length} cells` : undefined}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={handleInputClick}
        />
      </td>
    );
  }

  return (
    <td ref={tdRef} class={classes || undefined} data-id={itemId} data-col={col.key} style={cellStyle}
        onMouseDown={handleMouseDown} onClick={handleClick} onDblClick={handleDblClick}>
      {value != null && value !== '' ? String(value) : ''}
    </td>
  );
}
