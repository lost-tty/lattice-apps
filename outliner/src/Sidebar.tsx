// Lattice Outliner — Sidebar
//
// Page list grouped by folder. 'journals' folder comes first,
// then root pages, then any other folders alphabetically.

import { useRef, useState } from 'preact/hooks';
import {
  pageList, currentPage, navigateTo, navigateById, deletePage,
  todaySlug, pageTitle, exportAllPages, importAllPages,
} from './db';
import { buildTar, parseTar } from './tar';
import { IconDownload, IconUpload } from './Icons';
import type { Page } from './types';

export function Sidebar() {
  const pages = pageList.value;
  const currentId = currentPage.value;
  const todayTitle = todaySlug();

  const journals = pages.filter(p => p.folder === 'journals');
  const rootPages = pages.filter(p => !p.folder);
  const todayPage = journals.find(p => p.title === todayTitle);

  // Collect any other folders (future-proof)
  const otherFolders = new Map<string, Page[]>();
  for (const p of pages) {
    if (p.folder && p.folder !== 'journals') {
      if (!otherFolders.has(p.folder)) otherFolders.set(p.folder, []);
      otherFolders.get(p.folder)!.push(p);
    }
  }

  const tarInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const items = Array.from(e.dataTransfer?.files ?? []);
    const mdFiles = items.filter(f => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt'));
    if (mdFiles.length === 0) return;
    Promise.all(mdFiles.map(f => f.text().then(content => ({
      path: `pages/${f.name}`,
      content,
    })))).then(files => importAllPages(files));
  }

  function handleExportAll() {
    const files = exportAllPages();
    const blob = buildTar(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'outliner-export.tar';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportTar(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.arrayBuffer().then(buf => {
      const files = parseTar(buf);
      importAllPages(files);
      (e.target as HTMLInputElement).value = '';
    });
  }

  return (
    <nav
      class={`sidebar${dragging ? ' drop-active' : ''}`}
      onDragOver={(e: Event) => { (e as DragEvent).preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: Event) => handleFileDrop(e as DragEvent)}
    >
      <div class="sidebar-section">
        <h3>Journal</h3>
        <button
          class={`sidebar-item ${currentId === todayPage?.id ? 'active' : ''}`}
          onClick={() => navigateTo(todayTitle)}
        >
          Today
        </button>
        {journals.filter(p => p.title !== todayTitle).slice(0, 7).map(page => (
          <button
            key={page.id}
            class={`sidebar-item ${currentId === page.id ? 'active' : ''}`}
            onClick={() => navigateById(page.id)}
          >
            {pageTitle(page.id)}
          </button>
        ))}
      </div>

      <div class="sidebar-section">
        <h3>Pages</h3>
        {rootPages.map(page => (
          <PageRow key={page.id} page={page} currentId={currentId} />
        ))}
        <button class="sidebar-add" onClick={() => {
          const title = prompt('Page title:');
          if (!title?.trim()) return;
          navigateTo(title.trim());
        }}>+ New Page</button>
      </div>

      {[...otherFolders.entries()].map(([folder, folderPages]) => (
        <div key={folder} class="sidebar-section">
          <h3>{folder}</h3>
          {folderPages.map(page => (
            <PageRow key={page.id} page={page} currentId={currentId} />
          ))}
        </div>
      ))}

      <div class="sidebar-section sidebar-actions">
        <button class="sidebar-action" onClick={handleExportAll} title="Export all pages as .tar">
          <IconDownload /> Export
        </button>
        <button class="sidebar-action" onClick={() => tarInputRef.current?.click()} title="Import pages from .tar">
          <IconUpload /> Import
        </button>
        <input ref={tarInputRef} type="file" accept=".tar" style="display:none" onChange={handleImportTar} />
      </div>
    </nav>
  );
}

function PageRow({ page, currentId }: { page: Page; currentId: string | null }) {
  return (
    <div class={`sidebar-item-row ${currentId === page.id ? 'active' : ''}`}>
      <button class="sidebar-item" onClick={() => navigateById(page.id)}>
        {page.title}
      </button>
      <button
        class="sidebar-delete"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${page.title}"?`)) deletePage(page.id);
        }}
      >&times;</button>
    </div>
  );
}
