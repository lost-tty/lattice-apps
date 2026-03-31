// Lattice Outliner — Sidebar
//
// Collapsible sections: Journal, Pages, Tags.
// Journal entries beyond the last 7 days are grouped by month/year.
// Tags section shows a tag cloud based on usage frequency.

import { useRef, useState } from 'preact/hooks';
import {
  pageList, currentPage, navigateTo, navigateById, deletePage,
  pageTitle, getTagCounts,
} from './db';
import { todaySlug } from './parse';
import { exportAllPages, importAllPages } from './importExport';
import { buildTar, parseTar } from './tar';
import { IconDownload, IconUpload, IconChevronRight, IconChevronDown, IconCalendar, IconFile } from './Icons';
import type { Page } from './types';

interface MonthGroup { label: string; key: string; pages: Page[] }
interface YearGroup { year: string; months: MonthGroup[]; totalCount: number }

/** Group older journal pages: current year by month, past years collapsed. */
function groupOlderJournals(pages: Page[]): { currentYearMonths: MonthGroup[]; pastYears: YearGroup[] } {
  const currentYear = new Date().getFullYear().toString();
  const byYear = new Map<string, Map<string, Page[]>>();
  for (const p of pages) {
    const year = p.title.slice(0, 4);
    const monthKey = p.title.slice(0, 7);
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey)!.push(p);
  }

  function buildMonthGroups(monthsMap: Map<string, Page[]>): MonthGroup[] {
    return [...monthsMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, pages]) => {
        const [year, month] = key.split('-');
        const monthName = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long' });
        return { label: `${monthName} ${year}`, key, pages };
      });
  }

  const currentYearMonths = byYear.has(currentYear)
    ? buildMonthGroups(byYear.get(currentYear)!)
    : [];

  const pastYears: YearGroup[] = [...byYear.entries()]
    .filter(([y]) => y !== currentYear)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, monthsMap]) => ({
      year,
      months: buildMonthGroups(monthsMap),
      totalCount: [...monthsMap.values()].reduce((sum, p) => sum + p.length, 0),
    }));

  return { currentYearMonths, pastYears };
}

// --- Collapsible section header ---

function SectionHeader({ title, open, onToggle, count }: {
  title: string; open: boolean; onToggle: () => void; count?: number;
}) {
  return (
    <h3 class="sidebar-section-header" onClick={onToggle}>
      <span class="sidebar-group-arrow">{open ? <IconChevronDown /> : <IconChevronRight />}</span>
      {title}
      {count != null && count > 0 && <span class="sidebar-group-count">{count}</span>}
    </h3>
  );
}

// --- Main Sidebar ---

export function Sidebar() {
  const pages = pageList.value;
  const currentId = currentPage.value;
  const todayTitle = todaySlug();

  const journals = pages.filter(p => p.folder === 'journals');
  const rootPages = pages.filter(p => !p.folder);
  const todayPage = journals.find(p => p.title === todayTitle);

  const pastJournals = journals.filter(p => p.title !== todayTitle);
  const recentJournals = pastJournals.slice(0, 7);
  const olderJournals = pastJournals.slice(7);
  const { currentYearMonths, pastYears } = groupOlderJournals(olderJournals);

  const otherFolders = new Map<string, Page[]>();
  for (const p of pages) {
    if (p.folder && p.folder !== 'journals') {
      if (!otherFolders.has(p.folder)) otherFolders.set(p.folder, []);
      otherFolders.get(p.folder)!.push(p);
    }
  }

  const tagCounts = getTagCounts();

  const tarInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [journalOpen, setJournalOpen] = useState(true);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);

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
      {/* --- Journal --- */}
      <div class="sidebar-section">
        <SectionHeader title="Journal" open={journalOpen} onToggle={() => setJournalOpen(!journalOpen)} />
        {journalOpen && <>
          <button
            class={`sidebar-item sidebar-item-icon ${currentId === todayPage?.id ? 'active' : ''}`}
            onClick={() => navigateTo(todayTitle)}
          >
            <span class="sidebar-icon"><IconCalendar /></span>
            Today
          </button>
          {recentJournals.map(page => (
            <button
              key={page.id}
              class={`sidebar-item sidebar-item-icon ${currentId === page.id ? 'active' : ''}`}
              onClick={() => navigateById(page.id)}
            >
              <span class="sidebar-icon"><IconCalendar /></span>
              {pageTitle(page.id)}
            </button>
          ))}
          {currentYearMonths.map(group => (
            <MonthGroupRow key={group.key} label={group.label} pages={group.pages} currentId={currentId} />
          ))}
          {pastYears.map(yg => (
            <YearGroupRow key={yg.year} group={yg} currentId={currentId} />
          ))}
        </>}
      </div>

      {/* --- Pages --- */}
      <div class="sidebar-section">
        <SectionHeader title="Pages" open={pagesOpen} onToggle={() => setPagesOpen(!pagesOpen)} count={rootPages.length} />
        {pagesOpen && <>
          {rootPages.map(page => (
            <PageRow key={page.id} page={page} currentId={currentId} />
          ))}
          <button class="sidebar-add" onClick={() => {
            const title = prompt('Page title:');
            if (!title?.trim()) return;
            navigateTo(title.trim());
          }}>+ New Page</button>
        </>}
      </div>

      {/* --- Tags --- */}
      {tagCounts.length > 0 && (
        <div class="sidebar-section">
          <SectionHeader title="Tags" open={tagsOpen} onToggle={() => setTagsOpen(!tagsOpen)} count={tagCounts.length} />
          {tagsOpen && <TagCloud tags={tagCounts} />}
        </div>
      )}

      {/* --- Other folders --- */}
      {[...otherFolders.entries()].map(([folder, folderPages]) => (
        <div key={folder} class="sidebar-section">
          <h3>{folder}</h3>
          {folderPages.map(page => (
            <PageRow key={page.id} page={page} currentId={currentId} />
          ))}
        </div>
      ))}

      {/* --- Actions --- */}
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

// --- Tag Cloud ---

function TagCloud({ tags }: { tags: { tag: string; count: number }[] }) {
  const maxCount = tags[0]?.count ?? 1;
  return (
    <div class="tag-cloud">
      {tags.map(({ tag, count }) => {
        const t = maxCount > 1 ? Math.log(count) / Math.log(maxCount) : 0;
        const scale = 0.75 + 0.35 * t;
        return (
          <button
            key={tag}
            class="tag-cloud-item"
            style={`font-size: ${scale}rem`}
            onClick={() => navigateTo(tag)}
            title={`#${tag} (${count})`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}

// --- Journal tree components ---

function MonthGroupRow({ label, pages, currentId }: {
  label: string; pages: Page[]; currentId: string | null;
}) {
  const hasActive = pages.some(p => p.id === currentId);
  const [open, setOpen] = useState(hasActive);
  return (
    <div class="sidebar-month-group">
      <button class="sidebar-item sidebar-group-toggle" onClick={() => setOpen(!open)}>
        <span class="sidebar-group-arrow">{open ? <IconChevronDown /> : <IconChevronRight />}</span>
        {label}
        <span class="sidebar-group-count">{pages.length}</span>
      </button>
      {open && pages.map(page => (
        <button
          key={page.id}
          class={`sidebar-item sidebar-item-icon sidebar-indent-1 ${currentId === page.id ? 'active' : ''}`}
          onClick={() => navigateById(page.id)}
        >
          <span class="sidebar-icon"><IconCalendar /></span>
          {pageTitle(page.id)}
        </button>
      ))}
    </div>
  );
}

function YearGroupRow({ group, currentId }: { group: YearGroup; currentId: string | null }) {
  const hasActive = group.months.some(m => m.pages.some(p => p.id === currentId));
  const [open, setOpen] = useState(hasActive);
  return (
    <div class="sidebar-year-group">
      <button class="sidebar-item sidebar-group-toggle" onClick={() => setOpen(!open)}>
        <span class="sidebar-group-arrow">{open ? <IconChevronDown /> : <IconChevronRight />}</span>
        {group.year}
        <span class="sidebar-group-count">{group.totalCount}</span>
      </button>
      {open && group.months.map(month => (
        <MonthInYear key={month.key} month={month} currentId={currentId} />
      ))}
    </div>
  );
}

function MonthInYear({ month, currentId }: { month: MonthGroup; currentId: string | null }) {
  const hasActive = month.pages.some(p => p.id === currentId);
  const [open, setOpen] = useState(hasActive);
  const shortLabel = month.label.split(' ')[0];
  return (
    <div>
      <button class="sidebar-item sidebar-group-toggle sidebar-indent-1" onClick={() => setOpen(!open)}>
        <span class="sidebar-group-arrow">{open ? <IconChevronDown /> : <IconChevronRight />}</span>
        {shortLabel}
        <span class="sidebar-group-count">{month.pages.length}</span>
      </button>
      {open && month.pages.map(page => (
        <button
          key={page.id}
          class={`sidebar-item sidebar-item-icon sidebar-indent-2 ${currentId === page.id ? 'active' : ''}`}
          onClick={() => navigateById(page.id)}
        >
          <span class="sidebar-icon"><IconCalendar /></span>
          {pageTitle(page.id)}
        </button>
      ))}
    </div>
  );
}

function PageRow({ page, currentId }: { page: Page; currentId: string | null }) {
  return (
    <div class={`sidebar-item-row ${currentId === page.id ? 'active' : ''}`}>
      <button class="sidebar-item sidebar-item-icon" onClick={() => navigateById(page.id)}>
        <span class="sidebar-icon"><IconFile /></span>
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
