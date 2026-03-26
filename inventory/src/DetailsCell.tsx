// ============================================================================
// Lattice Inventory — DetailsCell Component (flat view)
// ============================================================================

import { useCallback } from 'preact/hooks';
import { batch } from '@preact/signals';
import type { Item } from './types';
import {
  focusedId, editing, selectedColumn, saveField, rebuildIndex, toggleGlobalColumn,
} from './state';

export function DetailsCell({ itemId, item, restKeys }: { itemId: string; item: Item; restKeys: string[] }) {
  const ed = editing.value;
  const isEditing = ed && ed.itemId === itemId && ed.colKey === '_details';

  const itemRestPairs: { key: string; value: unknown }[] = [];
  for (const rk of restKeys) {
    const v = item[rk];
    if (v != null && v !== '') {
      itemRestPairs.push({ key: rk, value: v });
    }
  }

  const handleDblClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    batch(() => {
      focusedId.value = itemId;
      editing.value = { itemId, colKey: '_details', deep: true };
      selectedColumn.value = null;
    });
  }, [itemId]);

  const handleCloseEditor = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    editing.value = null;
    rebuildIndex();
  }, []);

  if (isEditing) {
    return (
      <td class="col-details-cell details-editing" data-id={itemId} data-col="_details">
        <div class="details-editor">
          {restKeys.map(rk => {
            const v = item[rk];
            const isNum = typeof v === 'number';
            return (
              <div class="details-editor-row" key={rk}>
                <span class="details-editor-key">{rk}</span>
                <input
                  class={`details-editor-input${isNum ? ' mono' : ''}`}
                  type={isNum ? 'number' : 'text'}
                  step={isNum ? 'any' : undefined}
                  value={v != null ? String(v) : ''}
                  placeholder={'\u2014'}
                  data-key={rk}
                  onBlur={(e) => {
                    saveField(itemId, rk, (e.target as HTMLInputElement).value, isNum);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      editing.value = null;
                      rebuildIndex();
                    }
                  }}
                />
                <button
                  class="details-pin-btn"
                  title={`Pin "${rk}" as column`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const input = (e.target as HTMLElement).parentElement?.querySelector('.details-editor-input') as HTMLInputElement | null;
                    if (input) saveField(itemId, rk, input.value, isNum);
                    toggleGlobalColumn(rk);
                  }}
                >
                  {'\u2197'}
                </button>
              </div>
            );
          })}
          <div class="details-editor-close">
            <button class="btn btn-sm" onClick={handleCloseEditor}>Done</button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td class="col-details-cell" data-id={itemId} data-col="_details" onDblClick={handleDblClick}>
      {itemRestPairs.length > 0 && (
        <span class="details-pairs">
          {itemRestPairs.map(pair => (
            <span class="details-pair" key={pair.key}>
              <span
                class="details-pair-key"
                title={`Click to pin "${pair.key}" as column`}
                onClick={(e) => { e.stopPropagation(); toggleGlobalColumn(pair.key); }}
              >
                {pair.key}
              </span>
              <span class="details-pair-val">{String(pair.value)}</span>
            </span>
          ))}
        </span>
      )}
    </td>
  );
}
