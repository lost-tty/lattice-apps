import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

export interface LongPressEvent {
  clientX: number;
  clientY: number;
}

export interface LongPressOptions {
  /** ms to hold before firing. iOS uses ~500ms. */
  ms?: number;
  /** Max px of movement before the press is canceled. */
  tolerance?: number;
  /** Fire even when the touch lands on contenteditable content. Default
   *  is `false` so iOS keeps its own text-selection long-press. Set true
   *  if the caller genuinely wants long-press inside editable fields. */
  allowContentEditable?: boolean;
}

/** Fire `handler` when the user touches `ref.current` and holds for `ms`
 *  without moving more than `tolerance` px. Cancels on touchend/cancel. */
export function useLongPress(
  ref: RefObject<HTMLElement>,
  handler: (e: LongPressEvent) => void,
  options: LongPressOptions = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const ms = options.ms ?? 500;
  const tolerance = options.tolerance ?? 10;
  const allowContentEditable = options.allowContentEditable ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: number | null = null;
    let startX = 0;
    let startY = 0;

    const cancel = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onStart = (e: TouchEvent) => {
      // Skip when the touch lands on contenteditable content unless the
      // caller opts in. iOS owns long-press there (text selection /
      // callout) and our handler would either lose the race or compete.
      const target = e.target as HTMLElement | null;
      if (!allowContentEditable && target?.isContentEditable) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      cancel();
      timer = window.setTimeout(() => {
        timer = null;
        handlerRef.current({ clientX: startX, clientY: startY });
      }, ms);
    };

    const onMove = (e: TouchEvent) => {
      if (timer == null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx * dx + dy * dy > tolerance * tolerance) cancel();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('scroll', cancel, { passive: true });

    return () => {
      cancel();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', cancel);
      el.removeEventListener('touchcancel', cancel);
      el.removeEventListener('scroll', cancel);
    };
  }, [ref, ms, tolerance, allowContentEditable]);
}
