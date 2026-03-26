// ============================================================================
// Lattice Inventory — Topbar Component
// ============================================================================

import { useRef, useCallback, useState } from 'preact/hooks';
import {
  search, groupLevels, groupingActive, index, collapsed, items, filters,
  rebuildIndex, persistPrefs, onGroupLevelsChanged, exportAll, importFromFile,
  syncing, getDataStore, toast, showNewItemModal, showBulkAddModal,
  ROW_COLORS,
} from './state';
import { allFieldKeys } from './engine';
import { NewItemModal } from './Modals';
import { BulkAddModal } from './BulkAddModal';

export function Topbar() {
  const [groupMenu, setGroupMenu] = useState<string[] | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldKeys = allFieldKeys([...items.value.values()]);
  const usedKeys = new Set(groupLevels.value);
  const availableKeys = fieldKeys.filter(k => !usedKeys.has(k));

  // Color filter state
  const activeColorFilters = new Set((filters.value['_color'] || []) as string[]);

  const handleSearch = useCallback((e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      search.value = val;
      rebuildIndex();
    }, 150);
  }, []);

  const handleGroupToggle = useCallback(() => {
    if (groupLevels.value.length === 0) return;
    const ds = getDataStore();
    if (groupingActive.value) {
      ds.saveCollapsed(collapsed.value);
      collapsed.value = new Set();
    }
    groupingActive.value = !groupingActive.value;
    ds.saveGroupingActive(groupingActive.value);
    rebuildIndex();
    if (groupingActive.value) {
      const saved = ds.loadCollapsed();
      if (saved !== null) {
        collapsed.value = saved;
      } else {
        const c = new Set<string>();
        for (let i = 1; i < index.value.length; i++) {
          c.add(index.value[i].path);
        }
        collapsed.value = c;
      }
    }
  }, []);

  const handleRemoveLevel = useCallback((i: number) => {
    const levels = [...groupLevels.value];
    levels.splice(i, 1);
    groupLevels.value = levels;
    onGroupLevelsChanged();
  }, []);

  const handleAddLevel = useCallback((key: string) => {
    groupLevels.value = [...groupLevels.value, key];
    setGroupMenu(null);
    onGroupLevelsChanged();
  }, []);

  const handleExpandCollapseAll = useCallback(() => {
    const ds = getDataStore();
    const allCollapsed = index.value.every(g => g.group === '__all__' || collapsed.value.has(g.path));
    if (allCollapsed) {
      collapsed.value = new Set();
    } else {
      const c = new Set<string>();
      for (const grp of index.value) {
        if (grp.group !== '__all__') c.add(grp.path);
      }
      collapsed.value = c;
    }
    ds.saveCollapsed(collapsed.value);
  }, []);

  const handleColorFilter = useCallback((colorName: string) => {
    const f = { ...filters.value };
    const current = new Set((f['_color'] || []) as string[]);
    if (current.has(colorName)) {
      current.delete(colorName);
    } else {
      current.add(colorName);
    }
    if (current.size === 0) {
      delete f['_color'];
    } else {
      f['_color'] = [...current];
    }
    filters.value = f;
    rebuildIndex();
    persistPrefs();
  }, []);

  // Check which colors are actually in use
  const usedColors = new Set<string>();
  for (const item of items.value.values()) {
    const c = item._color as string | undefined;
    if (c) usedColors.add(c);
  }

  const allCollapsed = index.value.every(g => g.group === '__all__' || collapsed.value.has(g.path));

  return (
    <div class="topbar">
      <span class="topbar-title">Inventory</span>

      {/* Search */}
      <div class="search-wrap">
        <span class="search-icon">{'\u2315'}</span>
        <input
          class="search-input"
          type="text"
          placeholder="Search items..."
          value={search.value}
          onInput={handleSearch}
        />
        <span class="search-kbd">/</span>
      </div>

      {/* Color filter swatches — only show if any items have colors */}
      {usedColors.size > 0 && (
        <div class="color-filter-wrap">
          {ROW_COLORS.filter(c => usedColors.has(c.name)).map(c => (
            <div
              key={c.name}
              class={`color-filter-swatch${activeColorFilters.has(c.name) ? ' active' : ''}`}
              style={{ background: c.border }}
              title={`Filter: ${c.name}`}
              onClick={() => handleColorFilter(c.name)}
            />
          ))}
          {activeColorFilters.size > 0 && (
            <div
              class="color-filter-swatch color-filter-clear"
              title="Clear color filters"
              onClick={() => {
                const f = { ...filters.value };
                delete f['_color'];
                filters.value = f;
                rebuildIndex();
                persistPrefs();
              }}
            >
              {'\u00d7'}
            </div>
          )}
        </div>
      )}

      {/* Group-by levels */}
      <div class={`group-levels-wrap${!groupingActive.value ? ' grouping-off' : ''}`}>
        <button
          class={`group-toggle ${groupingActive.value ? 'active' : ''}`}
          title={groupingActive.value ? 'Click to disable grouping' : 'Click to enable grouping'}
          onClick={groupLevels.value.length > 0 ? handleGroupToggle : undefined}
        >
          Group by
        </button>

        <div class="group-pills">
          {groupLevels.value.map((key, i) => (
            <span key={key}>
              {i > 0 && <span class="group-pill-sep">{'\u203A'}</span>}
              <span class="group-pill" title={`Level ${i + 1}: ${key}`}>
                {key}
                <button
                  class="group-pill-remove"
                  title="Remove level"
                  onClick={(e) => { e.stopPropagation(); handleRemoveLevel(i); }}
                >
                  {'\u00d7'}
                </button>
              </span>
            </span>
          ))}

          {availableKeys.length > 0 && (
            <div class="group-add-wrap">
              <button
                class="btn btn-sm group-add-btn"
                title="Add grouping level"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupMenu(groupMenu ? null : availableKeys);
                }}
              >
                {groupLevels.value.length === 0 ? '+ Add level' : '+'}
              </button>
              {groupMenu && (
                <div class="group-level-menu">
                  {groupMenu.map(key => (
                    <div
                      key={key}
                      class="group-level-menu-item"
                      onClick={() => handleAddLevel(key)}
                    >
                      {key}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {groupingActive.value && index.value.length > 1 && (
          <button
            class="btn btn-sm group-toggle-all"
            title={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
            onClick={handleExpandCollapseAll}
          >
            {allCollapsed ? '\u25BC' : '\u25B2'}
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div class="toolbar-group">
        <button class="btn btn-primary" onClick={() => { showNewItemModal.value = true; }}>+ New</button>
        <button class="btn" onClick={() => { showBulkAddModal.value = true; }}>Bulk Add</button>
        <button class="btn" onClick={exportAll}>Export</button>
        <button class="btn" onClick={importFromFile}>Import</button>
      </div>

      {/* Sync indicator */}
      <div class="sync-indicator">
        <span class={`sync-dot${syncing.value ? ' syncing' : ''}`} />
        <span class="sync-label">{syncing.value ? 'Syncing...' : ''}</span>
      </div>

      {/* Modals */}
      {showNewItemModal.value && <NewItemModal onClose={() => { showNewItemModal.value = false; }} />}
      {showBulkAddModal.value && <BulkAddModal onClose={() => { showBulkAddModal.value = false; }} />}
    </div>
  );
}
