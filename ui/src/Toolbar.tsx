import { Fragment } from 'preact';
import type { ActionItem } from './ActionMenu';

/** ActionItem variant for `<Toolbar>` — adds toggle/disabled state. */
export interface ToolbarItem extends ActionItem {
  /** Render with the visually-toggled-on style. When present, the button
   *  is treated as a toggle and `aria-pressed` reflects the state. */
  active?: boolean;
  /** Render but make non-interactive. */
  disabled?: boolean;
}

/** A group of related toolbar buttons. Toolbars take an array of groups;
 *  visual separators are rendered between groups, never inside one. */
export type ToolbarGroup = ToolbarItem[];

export interface ToolbarProps {
  groups: ToolbarGroup[];
  /** Optional extra class on the wrapper for scoped styling
   *  (e.g. `page-toolbar`, `topbar-actions`). */
  class?: string;
}

export function Toolbar({ groups, class: className = '' }: ToolbarProps) {
  return (
    <div class={`toolbar${className ? ' ' + className : ''}`}>
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <div class="toolbar-sep" />}
          {group.map(item => (
            <button
              key={item.label}
              class={[
                'toolbar-btn',
                item.active ? 'active' : '',
                item.danger ? 'toolbar-btn-danger' : '',
              ].filter(Boolean).join(' ')}
              disabled={item.disabled}
              title={item.label}
              aria-label={item.label}
              // Only advertise a toggle state when `active` was actually
              // provided — non-toggle buttons (e.g. Copy) shouldn't have
              // aria-pressed at all.
              aria-pressed={item.active === undefined ? undefined : item.active}
              onClick={item.onAction}
            >
              {item.icon ?? item.short ?? item.label}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
