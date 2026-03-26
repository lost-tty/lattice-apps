// ============================================================================
// Lattice Inventory — ColActionsOverlay Component
// ============================================================================

import { useCallback, useState, useRef, useEffect } from 'preact/hooks';
import type { GroupIndex, Column } from './types';
import {
  selectedColumn, sort, moveColumn, toggleGlobalColumn,
  renameColumn, rebuildIndex, persistPrefs, deleteColumn, toast,
  confirmDialog,
} from './state';
import { useViewportPosition } from './ModalShell';

export function ColActionsOverlay({ rect, grp, col, isPinned, columns, onDismiss }: {
  rect: DOMRect;
  grp: GroupIndex;
  col: Column;
  isPinned: boolean;
  columns: Column[];
  onDismiss: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(col.key);
  const renameRef = useRef<HTMLInputElement>(null);
  const { ref: popupRef, style } = useViewportPosition(rect.left, rect.bottom + 4);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const colIdx = columns.findIndex(c => c.key === col.key);
  const currentSort = sort.value?.group === grp.path && sort.value?.column === col.key;
  const filledCount = grp.items.filter(i => i[col.key] != null && i[col.key] !== '').length;

  const handleMoveLeft = useCallback((e: MouseEvent) => {
    e.stopPropagation(); onDismiss(); moveColumn(columns, col.key, -1);
  }, [columns, col.key, onDismiss]);

  const handleMoveRight = useCallback((e: MouseEvent) => {
    e.stopPropagation(); onDismiss(); moveColumn(columns, col.key, 1);
  }, [columns, col.key, onDismiss]);

  const handlePin = useCallback((e: MouseEvent) => {
    e.stopPropagation(); onDismiss(); toggleGlobalColumn(col.key);
  }, [col.key, onDismiss]);

  const handleSort = useCallback((e: MouseEvent) => {
    e.stopPropagation(); onDismiss();
    if (currentSort) {
      sort.value = { ...sort.value!, dir: sort.value!.dir === 'asc' ? 'desc' : 'asc' };
    } else {
      sort.value = { group: grp.path, column: col.key, dir: 'asc' };
    }
    rebuildIndex(); persistPrefs();
  }, [grp.path, col.key, currentSort, onDismiss]);

  const commitRename = useCallback(async () => {
    const newKey = renameValue.trim();
    if (!newKey || newKey === col.key) { onDismiss(); return; }
    onDismiss();
    await renameColumn(grp, col.key, newKey);
  }, [renameValue, col.key, grp, onDismiss]);

  const handleDelete = useCallback((e: MouseEvent) => {
    e.stopPropagation(); onDismiss();
    const groupLabel = grp.group === '__all__' ? 'all items' : grp.label;
    confirmDialog.value = {
      title: 'Delete column?',
      message: `Remove "${col.key}" from ${filledCount} item${filledCount !== 1 ? 's' : ''} in ${groupLabel}? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteColumn(grp, col.key, col.key),
    };
  }, [grp, col.key, filledCount, onDismiss]);

  return (
    <div class="col-actions-overlay">
      <div class="col-actions-backdrop" onClick={onDismiss} />
      <div ref={popupRef} class="col-actions-popup" style={style}>
        {renaming ? (
          <>
            <input
              ref={renameRef}
              class="col-rename-input"
              type="text"
              value={renameValue}
              placeholder="field name"
              onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
              }}
            />
            <div class="col-rename-hint">
              Rename on {filledCount} item{filledCount !== 1 ? 's' : ''} in {grp.label}
            </div>
          </>
        ) : (
          <>
            <button class={`col-action-btn${colIdx <= 0 ? ' disabled' : ''}`} title="Move left" disabled={colIdx <= 0} onClick={handleMoveLeft}>{'\u2190'}</button>
            <button class={`col-action-btn${colIdx >= columns.length - 1 ? ' disabled' : ''}`} title="Move right" disabled={colIdx >= columns.length - 1} onClick={handleMoveRight}>{'\u2192'}</button>
            <span class="col-actions-sep" />
            <span class="col-info">{filledCount}/{grp.items.length}</span>
            <button class={`col-action-btn${isPinned ? ' active' : ''}`} title={isPinned ? 'Remove from all groups' : 'Show in all groups'} onClick={handlePin}>{isPinned ? 'Unpin' : 'Pin'}</button>
            <button class="col-action-btn" onClick={() => setRenaming(true)}>Rename</button>
            <button class="col-action-btn" onClick={handleSort}>{currentSort ? (sort.value!.dir === 'asc' ? 'Sort \u25BC' : 'Sort \u25B2') : 'Sort'}</button>
            <span class="col-actions-sep" />
            <button class="col-action-btn col-action-danger" title={`Remove "${col.key}" from all items`} onClick={handleDelete}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}
