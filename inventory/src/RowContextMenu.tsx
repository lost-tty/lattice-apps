// ============================================================================
// Lattice Inventory — RowContextMenu (Preact component)
// ============================================================================

import { useCallback, useState, useRef, useEffect } from 'preact/hooks';
import {
  items, selectedRows, selectedCells, contextMenu, confirmDialog, groupLevels,
  ROW_COLORS, getDataStore, duplicateItem, deleteItems, notifyItemsChanged,
  rebuildIndex, toast, itemLabel,
} from './state';
import { useViewportPosition } from './ModalShell';

/** Called from TableRow's onContextMenu to populate the signal. */
export function showRowContextMenu(e: MouseEvent, itemId: string) {
  e.preventDefault();

  const targetIds: string[] = [];

  // Multi-row selection (Cmd+Click)
  if (selectedRows.value.size > 0 && selectedRows.value.has(itemId)) {
    for (const id of selectedRows.value) {
      targetIds.push(id);
    }
  }
  // Cell selection — collect unique row IDs
  else if (selectedCells.value.length > 0) {
    const rowSet = new Set<string>();
    for (const c of selectedCells.value) {
      if (!rowSet.has(c.itemId)) {
        rowSet.add(c.itemId);
        targetIds.push(c.itemId);
      }
    }
    // Include the right-clicked item if not already in the set
    if (!rowSet.has(itemId)) {
      targetIds.push(itemId);
    }
  }
  // Single item
  else {
    targetIds.push(itemId);
  }

  contextMenu.value = { x: e.clientX, y: e.clientY, targetIds };
}

/** The Preact component — rendered in App.tsx, driven by contextMenu signal. */
export function RowContextMenu() {
  const menu = contextMenu.value;
  const { ref: popupRef, style } = useViewportPosition(menu?.x ?? 0, menu?.y ?? 0);

  if (!menu) return null;

  const { targetIds } = menu;
  const isMulti = targetIds.length > 1;
  const firstItem = items.value.get(targetIds[0]);
  const currentColor = !isMulti && firstItem ? (firstItem._color as string | undefined) : undefined;
  const anyColored = targetIds.some(id => {
    const it = items.value.get(id);
    return it && it._color;
  });
  const levels = groupLevels.value;

  const [openSub, setOpenSub] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    contextMenu.value = null;
    setOpenSub(null);
    setPos(null);
  }, []);

  const handleColor = useCallback(async (colorName: string | null) => {
    dismiss();
    const ds = getDataStore();
    for (const id of targetIds) {
      const it = items.value.get(id);
      if (!it) continue;
      if (!colorName || it._color === colorName) delete it._color;
      else it._color = colorName;
      await ds.save(id, it);
    }
    notifyItemsChanged();
  }, [targetIds, dismiss]);

  const handleMoveTo = useCallback(async (levelKey: string, newValue: string) => {
    dismiss();
    const ds = getDataStore();
    const trimmed = newValue.trim();
    for (const id of targetIds) {
      const it = items.value.get(id);
      if (!it) continue;
      if (trimmed) it[levelKey] = trimmed;
      else delete it[levelKey];
      await ds.save(id, it);
    }
    notifyItemsChanged();
    rebuildIndex();
    toast(isMulti ? `Moved ${targetIds.length} items to ${levelKey}: ${trimmed || '(none)'}` : `${levelKey}: ${trimmed || '(none)'}`);
  }, [targetIds, isMulti, dismiss]);

  const handleDuplicate = useCallback(() => {
    dismiss();
    duplicateItem(targetIds[0]);
  }, [targetIds, dismiss]);

  const handleDelete = useCallback(() => {
    dismiss();
    const label = isMulti ? `${targetIds.length} items` : `"${itemLabel(targetIds[0])}"`;
    confirmDialog.value = {
      title: isMulti ? `Delete ${targetIds.length} items?` : 'Delete item?',
      message: `Permanently delete ${label}? This cannot be undone.`,
      confirmLabel: isMulti ? `Delete ${targetIds.length} items` : 'Delete',
      onConfirm: () => deleteItems(targetIds),
    };
  }, [targetIds, isMulti, dismiss]);

  return (
    <div class="row-color-menu">
      <div class="row-color-backdrop" onClick={dismiss} />
      <div ref={popupRef} class="row-color-popup" style={style}>
        {/* Highlight colors */}
        <div class="row-color-label">
          {isMulti ? `${targetIds.length} items` : 'Highlight'}
        </div>
        <div class="row-color-swatches">
          {ROW_COLORS.map(c => (
            <div
              key={c.name}
              class={`row-color-swatch${currentColor === c.name ? ' active' : ''}`}
              style={{ background: c.border }}
              title={c.name}
              onClick={() => handleColor(c.name)}
            />
          ))}
          {anyColored && (
            <div
              class="row-color-swatch row-color-clear"
              title="Remove highlight"
              onClick={() => handleColor(null)}
            >
              {'\u00d7'}
            </div>
          )}
        </div>

        {/* Move to category/subcategory */}
        {levels.length > 0 && <div class="row-ctx-divider" />}
        {levels.map(levelKey => {
          const currentVal = !isMulti && firstItem ? String(firstItem[levelKey] ?? '') : '';
          return (
            <MoveToSubmenu
              key={levelKey}
              levelKey={levelKey}
              currentValue={currentVal}
              isMulti={isMulti}
              isOpen={openSub === levelKey}
              onToggle={() => setOpenSub(openSub === levelKey ? null : levelKey)}
              onSelect={(val) => handleMoveTo(levelKey, val)}
            />
          );
        })}

        <div class="row-ctx-divider" />

        {!isMulti && (
          <div class="row-ctx-action" onClick={handleDuplicate}>Duplicate</div>
        )}

        <div class="row-ctx-action row-ctx-danger" onClick={handleDelete}>
          {isMulti ? `Delete ${targetIds.length} items` : 'Delete'}
        </div>
      </div>
    </div>
  );
}

function MoveToSubmenu({ levelKey, currentValue, isMulti, isOpen, onToggle, onSelect }: {
  levelKey: string;
  currentValue: string;
  isMulti: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = [...items.value.values()];
  const distinctValues = new Set<string>();
  for (const item of allItems) {
    const v = item[levelKey];
    if (v != null && v !== '') distinctValues.add(String(v));
  }
  const options = [...distinctValues].sort();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div class="row-ctx-submenu">
      <div class="row-ctx-action" onClick={onToggle}>
        <span>{levelKey}</span>
        <span class="row-ctx-submenu-value">
          {isMulti ? 'mixed' : (currentValue || '(none)')}
        </span>
        <span class="row-ctx-submenu-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
      </div>
      {isOpen && (
        <div class="row-ctx-submenu-list">
          {options.map(val => (
            <div
              key={val}
              class={`row-ctx-submenu-item${val === currentValue ? ' active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onSelect(val); }}
            >
              {val}
            </div>
          ))}
          {currentValue && (
            <div
              class="row-ctx-submenu-item row-ctx-submenu-clear"
              onClick={(e) => { e.stopPropagation(); onSelect(''); }}
            >
              {'\u00d7'} Remove
            </div>
          )}
          <div class="row-ctx-submenu-input-wrap">
            <input
              ref={inputRef}
              class="row-ctx-submenu-input"
              type="text"
              placeholder={`New ${levelKey.toLowerCase()}...`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) onSelect(val);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
