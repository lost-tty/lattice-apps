// ============================================================================
// Lattice Inventory — Modal Shell + shared UI hooks
// ============================================================================

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
}

/** Position a popup within the viewport. Pass initial x/y (e.g. mouse coords
 *  or anchor rect bottom/left). Returns a ref for the popup element and
 *  an adjusted style object. First render is hidden for measurement. */
export function useViewportPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = y;
    let left = x;
    if (left + r.width > vw - 8) left = vw - r.width - 8;
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 4);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ top, left });
  });

  const style = pos
    ? { top: `${pos.top}px`, left: `${pos.left}px` }
    : { top: `${y}px`, left: `${x}px`, visibility: 'hidden' as const };

  return { ref, style };
}

export function ModalShell({ title, onClose, className, children }: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ComponentChildren;
}) {
  useEscapeKey(onClose);
  return (
    <div class="modal-overlay">
      <div class="modal-backdrop" onClick={onClose} />
      <div class={className ? `modal-box ${className}` : 'modal-box'}>
        <div class="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
