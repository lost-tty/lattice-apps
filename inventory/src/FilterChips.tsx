// ============================================================================
// Lattice Inventory — FilterChips Component
// ============================================================================

import { useCallback } from 'preact/hooks';
import { filters, groupLevels, items, rebuildIndex, persistPrefs } from './state';

export function FilterChips() {
  const handleRemoveFilter = useCallback((key: string, val: string) => {
    const f = { ...filters.value };
    const arr = f[key];
    if (arr) {
      const idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
      if (arr.length === 0) delete f[key];
    }
    filters.value = f;
    rebuildIndex();
    persistPrefs();
  }, []);

  const handleAddFilter = useCallback((key: string, val: string) => {
    const f = { ...filters.value };
    if (!f[key]) f[key] = [];
    f[key].push(val);
    filters.value = f;
    rebuildIndex();
    persistPrefs();
  }, []);

  return (
    <div class="filter-chips">
      {/* Active filters as removable chips — skip _color (shown as swatches in topbar) */}
      {Object.entries(filters.value)
        .filter(([key]) => key !== '_color')
        .map(([key, values]) =>
          values?.map(val => (
            <span key={`${key}:${val}`} class="filter-chip active">
              {key}: {val}
              <button
                class="filter-chip-remove"
                onClick={(e) => { e.stopPropagation(); handleRemoveFilter(key, val); }}
              >
                {'\u00d7'}
              </button>
            </span>
          ))
        )}

      {/* Filter suggestions from group levels */}
      {groupLevels.value.map(levelKey => {
        const allItems = [...items.value.values()];
        const distinctValues = new Set<string>();
        for (const item of allItems) {
          const v = item[levelKey];
          if (v != null && v !== '') distinctValues.add(String(v));
        }
        const activeVals = new Set(filters.value[levelKey] || []);
        const suggestions = [...distinctValues].filter(v => !activeVals.has(v)).sort();

        return suggestions.map(val => (
          <span
            key={`${levelKey}:${val}`}
            class="filter-chip"
            title={`Filter by ${levelKey}: ${val}`}
            onClick={() => handleAddFilter(levelKey, val)}
          >
            {val}
          </span>
        ));
      })}
    </div>
  );
}
