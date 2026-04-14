import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ActionItem } from './ActionMenu';

export interface SwipeRowProps {
  actions: ActionItem[];
  children: ComponentChildren;
  /** Width in px of each revealed action button. */
  actionWidth?: number;
}

/** A row whose primary content slides left to reveal action buttons on the
 *  right (iOS Mail/Reminders pattern). Snaps open/closed based on how far
 *  the user has dragged at touchend. Tap anywhere on the content while
 *  open closes the row without invoking an action. */
export function SwipeRow({ actions, children, actionWidth = 72 }: SwipeRowProps) {
  const revealWidth = actions.length * actionWidth;
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const baseX = useRef(0);

  const onTouchStart = (e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    baseX.current = translateX;
    setDragging(true);
  };
  const onTouchMove = (e: TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    // Clamp: can go left up to revealWidth*1.15 (slight overscroll), can't go right past 0.
    const next = Math.min(0, Math.max(-revealWidth * 1.15, baseX.current + dx));
    setTranslateX(next);
  };
  const onTouchEnd = () => {
    setDragging(false);
    // Functional setter: use the most recent pending value, not the one
    // captured in this closure (which may predate the last touchmove).
    setTranslateX(x => x < -revealWidth / 2 ? -revealWidth : 0);
  };

  const isOpen = translateX < 0;
  const close = () => setTranslateX(0);

  return (
    <div class={`swipe-row${isOpen ? ' swipe-row-open' : ''}`}>
      <div
        class={`swipe-row-content${dragging ? ' swipe-row-dragging' : ''}`}
        style={`transform: translateX(${translateX}px)`}
        onTouchStart={(e: Event) => onTouchStart(e as TouchEvent)}
        onTouchMove={(e: Event) => onTouchMove(e as TouchEvent)}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e: MouseEvent) => {
          if (isOpen) { e.stopPropagation(); close(); }
        }}
      >
        {children}
      </div>
      <div class="swipe-row-actions" style={`width: ${revealWidth}px`}>
        {actions.map(a => (
          <button
            key={a.label}
            class={`swipe-row-action${a.danger ? ' swipe-row-action-danger' : ''}`}
            style={`width: ${actionWidth}px`}
            aria-label={a.label}
            onClick={() => { close(); a.onAction(); }}
          >
            {a.icon ?? a.short ?? a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
