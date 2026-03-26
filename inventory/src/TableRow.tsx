// ============================================================================
// Lattice Inventory — TableRow Component
// ============================================================================

import { useCallback, useRef, useEffect } from 'preact/hooks';
import { batch } from '@preact/signals';
import type { Item, GroupIndex, Column } from './types';
import { ID } from './types';
import {
  focusedId, focusedCol, editing, selectedCells, selectedRows, selectedColumn,
  items, extendSelection, selectRowRange, selectionAnchor, ROW_COLORS,
} from './state';
import { TableCell } from './TableCell';
import { DetailsCell } from './DetailsCell';
import { showRowContextMenu } from './RowContextMenu';

function getRowColorStyle(item: Item): { borderColor?: string; bgColor?: string } | null {
  const colorName = item._color as string | undefined;
  if (!colorName) return null;
  const c = ROW_COLORS.find(rc => rc.name === colorName);
  if (!c) return null;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { borderColor: c.border, bgColor: isDark ? c.bgDark : c.bg };
}

export function TableRow({ item, grp, properColumns, hasDetailsCol, restKeys, isFlat }: {
  item: Item;
  grp: GroupIndex;
  properColumns: Column[];
  hasDetailsCol: boolean;
  restKeys: string[];
  isFlat: boolean;
}) {
  const itemId = item[ID];
  const isFocused = itemId === focusedId.value;
  const isRowSelected = selectedRows.value.has(itemId);
  const ed = editing.value;
  const isEditingThis = ed !== null && ed.itemId === itemId;
  const colorStyle = getRowColorStyle(item);
  const trRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (isFocused && !isEditingThis && trRef.current) {
      trRef.current.focus({ preventScroll: true });
      trRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused, isEditingThis]);

  const handleClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('cell-input')) return;
    if (target.classList.contains('details-editor-input')) return;
    if (target.closest('.details-editor')) return;
    if (e.shiftKey && !e.metaKey && !e.ctrlKey) return;

    const modKey = e.metaKey || e.ctrlKey;

    if (modKey && e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      selectRowRange(itemId);
      return;
    }

    if (modKey) {
      e.stopPropagation();
      e.preventDefault();
      selectedCells.value = [];
      const newSet = new Set(selectedRows.value);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      selectedRows.value = newSet;
      batch(() => {
        focusedId.value = itemId;
        editing.value = null;
      });
      return;
    }

    e.stopPropagation();
    selectedRows.value = new Set();
    const clickedTd = (e.target as HTMLElement).closest('td[data-col]') as HTMLElement | null;
    const colKey = clickedTd?.dataset.col;
    if (colKey && colKey !== '_details') {
      focusedCol.value = colKey;
    }
    batch(() => {
      focusedId.value = itemId;
      editing.value = null;
      selectedCells.value = [];
      selectedColumn.value = null;
      selectionAnchor.value = null;
    });
  }, [itemId]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    showRowContextMenu(e, itemId);
  }, [itemId]);

  const trStyle: Record<string, string> = {};
  if (colorStyle) {
    trStyle['--row-border-color'] = colorStyle.borderColor!;
    trStyle['--row-bg-color'] = colorStyle.bgColor!;
  }

  return (
    <tr
      ref={trRef}
      class={[
        isFocused ? 'focused' : '',
        isRowSelected ? 'row-selected' : '',
        colorStyle ? 'row-colored' : '',
      ].filter(Boolean).join(' ') || undefined}
      tabIndex={0}
      data-id={itemId}
      data-group={grp.path}
      style={colorStyle ? trStyle : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {properColumns.map((col, ci) => (
        <TableCell
          key={col.key}
          itemId={itemId}
          item={item}
          col={col}
          grp={grp}
          colIdx={ci}
          properColumns={properColumns}
        />
      ))}

      {hasDetailsCol && (
        <DetailsCell itemId={itemId} item={item} restKeys={restKeys} />
      )}
    </tr>
  );
}
