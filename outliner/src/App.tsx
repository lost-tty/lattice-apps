// Lattice Outliner — App shell

import { useEffect, useRef, useState } from 'preact/hooks';
import { Toolbar } from '@ui';
import { Sidebar } from './Sidebar';
import { Editor } from './Editor';
import { IconMenu } from './Icons';
import { currentPage, pageTitle } from './db';
import { anchoredPageId, topbarSlide } from './editorState';
import { buildPageToolbarGroups } from './pageActions';

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = () => setSidebarOpen(false);
  const prevFocus = useRef<HTMLElement | null>(null);

  const titleId = anchoredPageId.value ?? currentPage.value;
  const title = titleId ? pageTitle(titleId) : '';
  const toolbarGroups = titleId ? buildPageToolbarGroups(titleId) : [];

  // Progressive topbar slide: CSS uses `--topbar-slide` to drive translate-Y.
  // Forced to 0 when the sidebar is open so the close affordance is reachable.
  const slidePx = sidebarOpen ? 0 : topbarSlide.value;

  // Escape-to-close, focus management, and `inert` on background so keyboard
  // users can't Tab out of the drawer into content behind it.
  useEffect(() => {
    if (!sidebarOpen) return;

    prevFocus.current = document.activeElement as HTMLElement | null;

    const bg = document.querySelectorAll<HTMLElement>('.topbar, .editor');
    bg.forEach(el => el.setAttribute('inert', ''));

    document.querySelector<HTMLButtonElement>('.sidebar button')?.focus();

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    return () => {
      bg.forEach(el => el.removeAttribute('inert'));
      document.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [sidebarOpen]);

  return (
    <div class={`app${sidebarOpen ? ' sidebar-open' : ''}`} style={`--topbar-slide: ${slidePx}px`}>
      <header class="topbar">
        <button
          class="topbar-toggle"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(v => !v)}
        >
          <IconMenu />
        </button>
        <span class="topbar-title">{title}</span>
        <Toolbar groups={toolbarGroups} class="topbar-actions" />
      </header>
      <div class="sidebar-backdrop" onClick={close} />
      <Sidebar onNavigate={close} />
      <Editor />
    </div>
  );
}
