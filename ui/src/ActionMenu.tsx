import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Restore focus to the element that was active before the menu opened.
 *  Guarded so we don't throw if that element was removed from the DOM. */
function restoreFocus(el: HTMLElement | null) {
  if (!el || !document.body.contains(el)) return;
  try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
}

export interface ActionItem {
  /** Full label, shown in popover/sheet menus. */
  label: string;
  /** Compact label for tight UI surfaces like swipe buttons.
   *  Falls back to `label` when omitted. */
  short?: string;
  /** Icon for compact contexts (toolbar buttons, swipe). */
  icon?: ComponentChildren;
  onAction: () => void;
  danger?: boolean;
}

export interface ActionMenuState {
  /** Anchor point for popover rendering on desktop. Ignored on mobile
   *  where the menu renders as a bottom sheet. */
  x: number;
  y: number;
  items: ActionItem[];
}

/** A context menu that renders as an anchored popover on pointer devices
 *  and as a bottom sheet on touch devices. Which is chosen is controlled
 *  entirely by CSS (the same DOM is rendered either way), so components
 *  don't need to know about viewport size. */
export function ActionMenu({ menu, onClose }: { menu: ActionMenuState | null; onClose: () => void }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!menu) return;

    // Remember what had focus before the menu opened, move focus into the
    // menu so screen readers announce it, and restore on close.
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    popupRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPointer = (e: PointerEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // `pointerdown` (not `mousedown`) so that on iOS the simulated mousedown
    // dispatched after touchend doesn't dismiss a menu we just opened via
    // long-press. pointerdown fires on the actual touch, before simulation.
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      restoreFocus(returnFocusTo.current);
      returnFocusTo.current = null;
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div class="action-menu-root">
      <div class="action-menu-backdrop" onClick={onClose} />
      <div
        ref={popupRef}
        class="action-menu"
        role="menu"
        style={`--action-menu-x: ${menu.x}px; --action-menu-y: ${menu.y}px`}
      >
        {menu.items.map(item => (
          <button
            key={item.label}
            class={`action-menu-item${item.danger ? ' action-menu-item-danger' : ''}`}
            role="menuitem"
            onClick={() => { item.onAction(); onClose(); }}
          >
            {item.icon && <span class="action-menu-icon">{item.icon}</span>}
            <span class="action-menu-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
