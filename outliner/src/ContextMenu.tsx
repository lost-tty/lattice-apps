import { useRef, useEffect } from 'preact/hooks';

export type MenuState = { x: number; y: number; items: Array<{ label: string; action: () => void }> } | null;

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} class="context-menu" style={`left:${menu.x}px;top:${menu.y}px`}>
      {menu.items.map(item => (
        <button
          key={item.label}
          class="context-menu-item"
          onClick={() => { item.action(); onClose(); }}
        >{item.label}</button>
      ))}
    </div>
  );
}
