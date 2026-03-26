// ============================================================================
// Lattice Inventory — DataTable Component
// ============================================================================

import { useCallback, useState } from 'preact/hooks';
import type { GroupIndex, Column } from './types';
import { ID } from './types';
import {
  selectedColumn, globalColumns, sort, applyColumnOrder, reorderColumnDrop,
  pinnedColumnWidths,
} from './state';
import { TableRow } from './TableRow';
import { ColActionsOverlay } from './ColActionsOverlay';
import { AddColumnModal } from './Modals';

export function DataTable({ grp }: { grp: GroupIndex }) {
  const isFlat = grp.group === '__all__';
  const [colActionsRect, setColActionsRect] = useState<{ rect: DOMRect; col: Column; isPinned: boolean; columns: Column[] } | null>(null);
  const [showAddCol, setShowAddCol] = useState(false);

  const globalSet = new Set(globalColumns.value);
  const orderedColumns = applyColumnOrder(grp.columns);

  // In flat view: only globals are proper columns, rest goes to Details
  let properColumns: Column[];
  let hasDetailsCol = false;
  let restKeys: string[] = [];
  if (isFlat && orderedColumns.length > 0) {
    properColumns = orderedColumns.filter(c => globalSet.has(c.key));
    const properKeySet = new Set(properColumns.map(c => c.key));
    restKeys = orderedColumns.filter(c => !properKeySet.has(c.key)).map(c => c.key);
    hasDetailsCol = restKeys.length > 0;
  } else {
    properColumns = orderedColumns;
  }

  const isColSelected = (key: string) => {
    const sel = selectedColumn.value;
    return sel?.groupPath === grp.path && sel?.key === key;
  };

  const handleColClick = useCallback((e: MouseEvent, col: Column, isPinned: boolean) => {
    e.stopPropagation();
    if (isColSelected(col.key)) {
      selectedColumn.value = null;
      setColActionsRect(null);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      selectedColumn.value = { groupPath: grp.path, key: col.key };
      setColActionsRect({ rect, col, isPinned, columns: properColumns });
    }
  }, [grp.path, properColumns]);

  const handleDragStart = useCallback((e: DragEvent, colKey: string) => {
    e.dataTransfer!.setData('text/plain', colKey);
    e.dataTransfer!.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).classList.add('dragging');
  }, []);

  const handleDragEnd = useCallback((e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  }, []);

  const handleDrop = useCallback((e: DragEvent, toKey: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
    const fromKey = e.dataTransfer!.getData('text/plain');
    if (fromKey && fromKey !== toKey) {
      reorderColumnDrop(properColumns, fromKey, toKey);
    }
  }, [properColumns]);

  const handleDismissColActions = useCallback(() => {
    selectedColumn.value = null;
    setColActionsRect(null);
  }, []);

  return (
    <>
      <table class="data-table">
        <thead>
          <tr>
            {properColumns.map((col) => {
              const selected = isColSelected(col.key);
              const isPinned = globalSet.has(col.key);
              const isSorted = sort.value?.group === grp.path && sort.value?.column === col.key;
              const minW = isPinned ? pinnedColumnWidths.value.get(col.key) : undefined;

              return (
                <th
                  key={col.key}
                  class={[
                    col.type === 'number' ? 'align-right' : '',
                    selected ? 'col-selected' : '',
                    isPinned ? 'col-pinned' : '',
                    isSorted ? 'sorted' : '',
                  ].filter(Boolean).join(' ') || undefined}
                  style={minW ? { minWidth: `${minW}px` } : undefined}
                  draggable
                  data-col-key={col.key}
                  onDragStart={(e) => handleDragStart(e as DragEvent, col.key)}
                  onDragEnd={handleDragEnd as any}
                  onDragOver={handleDragOver as any}
                  onDragLeave={handleDragLeave as any}
                  onDrop={(e) => handleDrop(e as DragEvent, col.key)}
                  onClick={(e) => handleColClick(e as unknown as MouseEvent, col, isPinned)}
                >
                  <span class="th-label">{col.key}</span>
                  {isPinned && !selected && (
                    <span class="col-pin-icon" title="Pinned globally">{'\u25C6'}</span>
                  )}
                  {isSorted && (
                    <span class="sort-arrow">
                      {sort.value!.dir === 'asc' ? '\u25B2' : '\u25BC'}
                    </span>
                  )}
                </th>
              );
            })}

            {hasDetailsCol && (
              <th class="col-details">
                <span class="th-label">Details</span>
              </th>
            )}

            <th class="col-add">
              <button
                class="col-add-btn"
                title="Add column"
                onClick={(e) => { e.stopPropagation(); setShowAddCol(true); }}
              >
                +
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {grp.items.map((item) => (
            <TableRow
              key={item[ID]}
              item={item}
              grp={grp}
              properColumns={properColumns}
              hasDetailsCol={hasDetailsCol}
              restKeys={restKeys}
              isFlat={isFlat}
            />
          ))}
        </tbody>
      </table>

      {colActionsRect && (
        <ColActionsOverlay
          rect={colActionsRect.rect}
          grp={grp}
          col={colActionsRect.col}
          isPinned={colActionsRect.isPinned}
          columns={colActionsRect.columns}
          onDismiss={handleDismissColActions}
        />
      )}

      {showAddCol && (
        <AddColumnModal grp={grp} onClose={() => setShowAddCol(false)} />
      )}
    </>
  );
}
