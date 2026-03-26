// ============================================================================
// Lattice Inventory — App Component (root)
// ============================================================================

import { useEffect } from 'preact/hooks';
import {
  index, search, filters, groupLevels, confirmDialog,
  syncPinnedColumnWidths,
} from './state';
import { Topbar } from './Topbar';
import { FilterChips } from './FilterChips';
import { GroupSection } from './GroupSection';
import { RowContextMenu } from './RowContextMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { useKeyboard } from './useKeyboard';

export function App() {
  useKeyboard();

  const groups = index.value;
  const hasFilters = Object.values(filters.value).some(v => v && v.length > 0);
  const showFilterChips = hasFilters || groupLevels.value.length > 0;
  const hasSearch = !!search.value;
  const isEmpty = groups.length === 0;

  // After render: sync pinned column widths
  useEffect(() => {
    syncPinnedColumnWidths();
  });

  return (
    <div class="main-panel">
      <Topbar />
      {showFilterChips && <FilterChips />}
      <div class="content-area">
        {isEmpty ? (
          <div class="empty-state">
            {hasSearch || hasFilters ? (
              <>
                <div class="empty-state-title">No results</div>
                <div class="empty-state-sub">
                  Nothing matches the current {hasSearch ? 'search' : 'filters'}
                </div>
              </>
            ) : (
              <>
                <div class="empty-state-title">No items yet</div>
                <div class="empty-state-sub">
                  Press <kbd>n</kbd> to add your first item
                </div>
              </>
            )}
          </div>
        ) : (
          groups.map(grp => <GroupSection key={grp.path} grp={grp} />)
        )}
      </div>

      {/* Global overlays */}
      <RowContextMenu />
      <ConfirmDialog />
    </div>
  );
}
