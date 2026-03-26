// ============================================================================
// Lattice Inventory — GroupSection Component
// ============================================================================

import { useCallback } from 'preact/hooks';
import type { GroupIndex } from './types';
import { collapsed, getDataStore } from './state';
import { DataTable } from './DataTable';

/** Count total items recursively in a group tree. */
function countGroupItems(grp: GroupIndex): number {
  let count = grp.items.length;
  for (const child of grp.children) {
    count += countGroupItems(child);
  }
  return count;
}

export function GroupSection({ grp }: { grp: GroupIndex }) {
  const isFlat = grp.group === '__all__';
  const isCollapsed = !isFlat && collapsed.value.has(grp.path);

  const handleToggle = useCallback(() => {
    const ds = getDataStore();
    const newCollapsed = new Set(collapsed.value);
    if (newCollapsed.has(grp.path)) {
      newCollapsed.delete(grp.path);
    } else {
      newCollapsed.add(grp.path);
    }
    collapsed.value = newCollapsed;
    ds.saveCollapsed(newCollapsed);
  }, [grp.path]);

  const totalItems = countGroupItems(grp);

  return (
    <div
      class={`category-section level-${grp.level}${isCollapsed ? ' collapsed' : ''}`}
      data-path={grp.path}
    >
      {!isFlat && (
        <div class={`category-header level-${grp.level}`} onClick={handleToggle}>
          <span class="category-chevron">{'\u25BC'}</span>
          <span class="category-badge">
            <span class="category-dot" style={{ background: grp.color }} />
            {grp.label}
          </span>
          <span class="category-count">{totalItems}</span>
        </div>
      )}

      <div class="category-content">
        {/* Direct items (absorbed from (none) sub-groups) — shown first */}
        {grp.items.length > 0 && (
          <div class="table-wrap">
            <DataTable grp={grp} />
          </div>
        )}

        {/* Child sub-groups */}
        {grp.children.length > 0 && (
          grp.children.map(child => <GroupSection key={child.path} grp={child} />)
        )}

        {/* Empty state: no items and no children */}
        {grp.items.length === 0 && grp.children.length === 0 && (
          <div class="category-empty">No items in this group.</div>
        )}
      </div>
    </div>
  );
}
