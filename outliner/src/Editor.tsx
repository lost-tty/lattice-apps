// Lattice Outliner — Editor
//
// Block outliner with contentEditable, keyboard navigation,
// wiki link rendering, backlinks, collapse, and drag-and-drop.
//
// Blocks render as a FLAT list so indent/outdent/drag keeps
// the contentEditable mounted and focused.

import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { IconCopy, IconDownload } from './Icons';
import {
  activeBlockId, currentPage,
  saveBlock, deleteBlock, buildTree, flattenTree, hasChildren, toggleCollapse,
  createBlockAfter, isParagraph, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious, moveBlock,
  createTable, insertTableRow, insertTableCol, reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol,
  parseMarkdownToItems, insertBlocksAfter, exportPage,
  renderContent, parseHeading, parseTodoStatus, cycleTodoStatus, toggleCheckbox, isTableRow, isTableSeparator, parseTableCells, getTableGrid,
  getBacklinks, pageTitle, navigateTo, navigateById,
  isJournalPage, getJournalPages,
} from './db';

// --- Drag state (module-level, no signals needed) ---

let dragBlockId: string | null = null;

function clearDropIndicators() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-nested').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-nested');
  });
}

// Must match --indent in style.css
const INDENT_PX = 24;

// --- Cursor placement hint ---

let cursorPlacement: 'start' | 'end' | number = 'end';

// --- Block component ---

function BlockItem({ node }: { node: FlatBlock }) {
  const isActive = activeBlockId.value === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const hasKids = hasChildren(node.id);

  // Focus and set content when block becomes active
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    el.textContent = node.content;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    if (el.childNodes.length > 0) {
      if (typeof cursorPlacement === 'number') {
        range.setStart(el.firstChild!, cursorPlacement);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(cursorPlacement === 'start');
      }
    }
    sel.removeAllRanges();
    sel.addRange(range);
    cursorPlacement = 'end';
  }, [isActive]);

  function handleKeyDown(e: KeyboardEvent) {
    const el = ref.current!;
    const content = el.textContent || '';

    // Typing '- ' at the start of a paragraph promotes it to a bullet
    if (e.key === ' ' && isParagraph(node.id)) {
      const sel = window.getSelection()!;
      if (sel.focusOffset === 1 && content === '-') {
        e.preventDefault();
        el.textContent = '';
        saveBlock({ ...node, content: '', type: 'bullet' });
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      // If the block content is a table row, convert it to a table
      const cells = parseTableCells(content);
      if (cells && cells.length > 0) {
        const tableId = createTable(node.id, [cells]);
        deleteBlock(node.id);
        // Add an empty second row and focus its first cell
        const newCellIds = insertTableRow(tableId);
        if (newCellIds.length > 0) activeBlockId.value = newCellIds[0];
        return;
      }

      const sel = window.getSelection()!;
      const offset = sel.focusOffset;
      const before = content.slice(0, offset);
      const after = content.slice(offset);
      el.textContent = before;
      saveBlock({ ...node, content: before });
      const newId = createBlockAfter(node.id, after);
      cursorPlacement = 'start';
      activeBlockId.value = newId;
      return;
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection()!;
      if (sel.focusOffset === 0 && content !== '') {
        // Cursor at the left of a non-empty block: join with the previous block.
        e.preventDefault();
        const joined = joinBlockWithPrevious(node.id);
        if (joined) {
          cursorPlacement = joined.cursorPos;
          activeBlockId.value = joined.prevId;
        }
        return;
      }
      if (content === '') {
        e.preventDefault();
        // Empty bullet → demote to paragraph first; empty paragraph → delete
        if (!isParagraph(node.id)) {
          saveBlock({ ...node, type: 'paragraph' });
          return;
        }
        const prevId = removeBlock(node.id);
        if (prevId) activeBlockId.value = prevId;
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      saveBlock({ ...node, content });
      if (e.shiftKey) outdentBlock(node.id);
      else indentBlock(node.id);
      return;
    }

    if (e.key === 'ArrowUp') {
      const sel = window.getSelection()!;
      if (sel.focusOffset === 0) {
        const flat = flattenTree(buildTree(node.pageId));
        const idx = flat.findIndex(b => b.id === node.id);
        if (idx > 0) {
          e.preventDefault();
          saveBlock({ ...node, content });
          activeBlockId.value = flat[idx - 1].id;
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      const sel = window.getSelection()!;
      if (sel.focusOffset === content.length) {
        const flat = flattenTree(buildTree(node.pageId));
        const idx = flat.findIndex(b => b.id === node.id);
        if (idx < flat.length - 1) {
          e.preventDefault();
          saveBlock({ ...node, content });
          activeBlockId.value = flat[idx + 1].id;
        }
      }
      return;
    }
  }

  function handleBlur() {
    if (!ref.current) return;
    const content = ref.current.textContent || '';
    if (content !== node.content) saveBlock({ ...node, content });
    if (activeBlockId.value === node.id) activeBlockId.value = null;
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // Single-line paste: let the browser insert it as plain text.
    if (!text.includes('\n')) return;

    e.preventDefault();

    const el = ref.current!;
    const offset = window.getSelection()?.focusOffset ?? (el.textContent?.length ?? 0);
    const current = el.textContent ?? '';
    const before = current.slice(0, offset);
    const after = current.slice(offset);

    const items = parseMarkdownToItems(text);
    if (items.length === 0) return;

    // Merge the cursor split with the first and last pasted items.
    const merged = items.map((item, i) => ({
      ...item,
      content:
        (i === 0 ? before : '') + item.content + (i === items.length - 1 ? after : ''),
    }));

    // The current block takes the first item's content.
    saveBlock({ ...node, content: merged[0].content });

    if (merged.length === 1) {
      // Everything fit in one block — place cursor after the pasted text.
      cursorPlacement = before.length + items[0].content.length;
      activeBlockId.value = node.id;
      return;
    }

    // Remaining items become new blocks; cursor lands before the "after" text.
    const lastId = insertBlocksAfter(node.id, merged.slice(1));
    const lastContent = merged[merged.length - 1].content;
    cursorPlacement = lastContent.length - after.length;
    activeBlockId.value = lastId;
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('wiki-link') || target.classList.contains('tag')) {
      e.stopPropagation();
      const page = target.dataset.page;
      if (page) navigateTo(page);
      return;
    }
    if (target.classList.contains('hyperlink')) {
      e.stopPropagation();
      return; // let the <a> handle navigation
    }
    if (target.classList.contains('md-checkbox')) {
      e.stopPropagation();
      saveBlock({ ...node, content: toggleCheckbox(node.content) });
      return;
    }
    activeBlockId.value = node.id;
  }

  function handleTodoClick(e: MouseEvent) {
    e.stopPropagation();
    saveBlock({ ...node, content: cycleTodoStatus(node.content) });
  }

  // --- Drag handlers ---

  function handleDragStart(e: DragEvent) {
    dragBlockId = node.id;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', node.id);
    // Add dragging class after a tick so the drag image captures the normal state
    requestAnimationFrame(() => {
      (e.target as HTMLElement).closest('.block')?.classList.add('dragging');
    });
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!dragBlockId || dragBlockId === node.id) return;

    const el = (e.currentTarget as HTMLElement);
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const xOffset = e.clientX - rect.left;

    clearDropIndicators();

    if (y < rect.height * 0.25) {
      // Top quarter → insert before (sibling above)
      el.classList.add('drop-before');
    } else {
      // Bottom three-quarters: x-position decides sibling vs child.
      // Past the bullet + gap (one full --indent step) → nest as child; otherwise sibling.
      const nestThreshold = (node.depth + 1) * INDENT_PX;
      el.classList.add(xOffset >= nestThreshold ? 'drop-nested' : 'drop-after');
    }
  }

  function handleDragLeave(e: DragEvent) {
    const el = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      el.classList.remove('drop-before', 'drop-after', 'drop-nested');
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const position = el.classList.contains('drop-before') ? 'before'
      : el.classList.contains('drop-nested') ? 'nested'
      : 'after';
    clearDropIndicators();

    if (dragBlockId && dragBlockId !== node.id) {
      moveBlock(dragBlockId, node.id, position);
    }
    dragBlockId = null;
  }

  function handleDragEnd() {
    clearDropIndicators();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    dragBlockId = null;
  }

  // --- Bullet ---

  const isPara = node.type === 'paragraph';
  const bulletClass = `bullet${hasKids ? ' has-children' : ''}${node.collapsed ? ' collapsed' : ''}${isPara ? ' paragraph' : ''}`;

  const isHr = node.content === '---';

  return (
    <div
      class="block"
      // HR blocks render at full width regardless of tree depth
      style={isHr && !isActive ? '--depth: 0' : `--depth: ${node.depth}`}
      onDragOver={(e: Event) => handleDragOver(e as DragEvent)}
      onDragLeave={(e: Event) => handleDragLeave(e as DragEvent)}
      onDrop={(e: Event) => handleDrop(e as DragEvent)}
      onDragEnd={handleDragEnd}
    >
      <span
        class={bulletClass}
        draggable
        onClick={(e: Event) => { if (hasKids) { e.stopPropagation(); toggleCollapse(node.id); } }}
        onDragStart={(e: Event) => handleDragStart(e as DragEvent)}
      />
      {isActive ? (
        // key="edit" forces Preact to unmount/remount when toggling active state.
        // Without it Preact patches the same DOM node in place, leaving the raw
        // text node (set via el.textContent in useEffect) alongside the new
        // <span> child — causing the text to appear twice.
        <div
          key="edit"
          ref={ref}
          class="block-content editing"
          contentEditable
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onPaste={(e: Event) => handlePaste(e as ClipboardEvent)}
        />
      ) : isHr ? (
        <hr onClick={handleClick} />
      ) : (() => {
        const { status, text: statusText } = parseTodoStatus(node.content);
        const { level, text } = parseHeading(statusText);
        const cls = [
          'block-content',
          status === 'done' ? 'is-done' : status === 'cancelled' ? 'is-cancelled' : '',
          level ? `heading-${level}` : '',
        ].filter(Boolean).join(' ');
        return (
          <div key="view" class={cls} onClick={handleClick}>
            {status && <span class={`todo-marker ${status}`} onClick={handleTodoClick} />}
            <span dangerouslySetInnerHTML={{ __html: renderContent(text) || '<br>' }} />
          </div>
        );
      })()}
    </div>
  );
}

// --- Table Block ---

// Module-level drag state for table row/col reordering
let dragRowState: { tableId: string; rowOrder: number } | null = null;
let dragColState: { tableId: string; colOrder: number } | null = null;

// --- Context menu ---

type MenuState = { x: number; y: number; items: Array<{ label: string; action: () => void }> } | null;

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
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

function TableBlock({ node }: { node: FlatBlock }) {
  const grid = getTableGrid(node.id);
  if (grid.length === 0) return null;

  const colOrders = grid[0].cells.map(c => c.col ?? 0);
  const [menu, setMenu] = useState<MenuState>(null);

  function onRowContext(e: MouseEvent, rowOrder: number) {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Insert row above', action: () => {
          const g = getTableGrid(node.id);
          const idx = g.findIndex(r => r.order === rowOrder);
          const prev = g[idx - 1];
          insertTableRow(node.id, prev ? prev.order : undefined);
          // If no prev, we need to insert before the first row
          if (!prev) {
            const newGrid = getTableGrid(node.id);
            reorderTableRow(node.id, newGrid[newGrid.length - 1].order, rowOrder, 'before');
          }
        }},
        { label: 'Insert row below', action: () => insertTableRow(node.id, rowOrder) },
        { label: 'Delete row', action: () => deleteTableRow(node.id, rowOrder) },
      ],
    });
  }

  function onColContext(e: MouseEvent, colOrder: number) {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Insert column left', action: () => {
          const g = getTableGrid(node.id);
          const cols = g[0].cells.map(c => c.col ?? 0);
          const idx = cols.indexOf(colOrder);
          const prev = cols[idx - 1];
          insertTableCol(node.id, prev !== undefined ? prev : undefined);
          if (prev === undefined) {
            const newGrid = getTableGrid(node.id);
            const newCols = newGrid[0].cells.map(c => c.col ?? 0);
            const lastCol = newCols[newCols.length - 1];
            reorderTableCol(node.id, lastCol, colOrder, 'before');
          }
        }},
        { label: 'Insert column right', action: () => insertTableCol(node.id, colOrder) },
        { label: 'Delete column', action: () => deleteTableCol(node.id, colOrder) },
      ],
    });
  }

  function onRowDragStart(rowOrder: number) {
    dragRowState = { tableId: node.id, rowOrder };
    dragColState = null;
  }

  function onRowDragOver(e: DragEvent, targetOrder: number) {
    if (!dragRowState || dragRowState.tableId !== node.id) return;
    if (dragRowState.rowOrder === targetOrder) return;
    e.preventDefault();
    const tr = (e.currentTarget as HTMLElement);
    const rect = tr.getBoundingClientRect();
    const half = (e.clientY - rect.top) / rect.height;
    tr.classList.remove('drop-row-before', 'drop-row-after');
    tr.classList.add(half < 0.5 ? 'drop-row-before' : 'drop-row-after');
  }

  function onRowDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('drop-row-before', 'drop-row-after');
  }

  function onRowDrop(e: DragEvent, targetOrder: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drop-row-before', 'drop-row-after');
    if (!dragRowState || dragRowState.tableId !== node.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientY - rect.top) / rect.height;
    reorderTableRow(node.id, dragRowState.rowOrder, targetOrder, half < 0.5 ? 'before' : 'after');
    dragRowState = null;
  }

  function onColDragStart(colOrder: number) {
    dragColState = { tableId: node.id, colOrder };
    dragRowState = null;
  }

  function onColDragOver(e: DragEvent, targetCol: number) {
    if (!dragColState || dragColState.tableId !== node.id) return;
    if (dragColState.colOrder === targetCol) return;
    e.preventDefault();
    const td = (e.currentTarget as HTMLElement);
    const rect = td.getBoundingClientRect();
    const half = (e.clientX - rect.left) / rect.width;
    td.classList.remove('drop-col-before', 'drop-col-after');
    td.classList.add(half < 0.5 ? 'drop-col-before' : 'drop-col-after');
  }

  function onColDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('drop-col-before', 'drop-col-after');
  }

  function onColDrop(e: DragEvent, targetCol: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drop-col-before', 'drop-col-after');
    if (!dragColState || dragColState.tableId !== node.id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientX - rect.left) / rect.width;
    reorderTableCol(node.id, dragColState.colOrder, targetCol, half < 0.5 ? 'before' : 'after');
    dragColState = null;
  }

  function onDragEnd() { dragRowState = null; dragColState = null; }

  const colCount = colOrders.length;

  return (
    <div class="block table-block" style={`--depth: ${node.depth}`} onDragEnd={onDragEnd}>
      <div class="table-grid" style={`grid-template-columns: repeat(${colCount}, 1fr)`}>
        {grid.map((row, ri) =>
          row.cells.map((cell, ci) => {
            const colOrder = cell.col ?? 0;
            return (
              <div
                key={cell.id}
                class={`table-cell${ri === 0 ? ' table-header-cell' : ''}`}
                onClick={() => { if (activeBlockId.value !== cell.id) activeBlockId.value = cell.id; }}
                onDragOver={(e: Event) => {
                  onRowDragOver(e as DragEvent, row.order);
                  onColDragOver(e as DragEvent, colOrder);
                }}
                onDragLeave={(e: Event) => {
                  onRowDragLeave(e as DragEvent);
                  onColDragLeave(e as DragEvent);
                }}
                onDrop={(e: Event) => {
                  onRowDrop(e as DragEvent, row.order);
                  onColDrop(e as DragEvent, colOrder);
                }}
              >
                {ci === 0 && (
                  <span
                    class="row-handle"
                    draggable
                    onDragStart={() => onRowDragStart(row.order)}
                    onContextMenu={(e: Event) => onRowContext(e as MouseEvent, row.order)}
                  >⠿</span>
                )}
                {ri === 0 && (
                  <span
                    class="col-handle"
                    draggable
                    onDragStart={() => onColDragStart(colOrder)}
                    onContextMenu={(e: Event) => onColContext(e as MouseEvent, colOrder)}
                  >⠿</span>
                )}
                {activeBlockId.value === cell.id ? (
                  <CellEditor cell={cell} />
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: renderContent(cell.content) || '&nbsp;' }} />
                )}
              </div>
            );
          })
        )}
      </div>
      <div class="table-add-col" onClick={() => insertTableCol(node.id)} title="Add column">+</div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

function CellEditor({ cell }: { cell: import('./types').Block }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = cell.content;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    if (el.childNodes.length > 0) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }, [cell.id]);

  function handleBlur() {
    if (!ref.current) return;
    const content = ref.current.textContent || '';
    if (content !== cell.content) saveBlock({ ...cell, content });
    if (activeBlockId.value === cell.id) activeBlockId.value = null;
  }

  function flushContent() {
    const el = ref.current!;
    const content = el.textContent || '';
    if (content !== cell.content) saveBlock({ ...cell, content });
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      flushContent();
      const grid = getTableGrid(cell.parent!);
      const allCells = grid.flatMap(r => r.cells);
      const idx = allCells.findIndex(c => c.id === cell.id);
      const next = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
      if (next) {
        activeBlockId.value = next.id;
      } else if (!e.shiftKey) {
        // Tab past last cell → add a new row, focus its first cell
        const newCellIds = insertTableRow(cell.parent!);
        if (newCellIds.length > 0) activeBlockId.value = newCellIds[0];
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      flushContent();
      const grid = getTableGrid(cell.parent!);
      const rowIdx = grid.findIndex(r => r.cells.some(c => c.id === cell.id));
      const colIdx = grid[rowIdx].cells.findIndex(c => c.id === cell.id);
      const nextRow = grid[rowIdx + 1];
      if (nextRow && nextRow.cells[colIdx]) {
        activeBlockId.value = nextRow.cells[colIdx].id;
      } else {
        // Enter on last row → add a new row, focus same column
        const newCellIds = insertTableRow(cell.parent!, grid[rowIdx].order);
        if (newCellIds[colIdx]) activeBlockId.value = newCellIds[colIdx];
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      activeBlockId.value = null;
      return;
    }
  }

  return (
    <div
      ref={ref}
      class="cell-editor"
      contentEditable
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}

// --- Block list rendering (groups table blocks) ---

function renderBlockList(flat: FlatBlock[]) {
  const cellIds = new Set<string>();
  // Collect all cell IDs so we can skip them
  for (const node of flat) {
    if (node.type === 'table') {
      const grid = getTableGrid(node.id);
      for (const row of grid) for (const cell of row.cells) cellIds.add(cell.id);
    }
  }

  const elements: any[] = [];
  for (const node of flat) {
    if (cellIds.has(node.id)) continue; // skip table cells
    if (node.type === 'table') {
      elements.push(<TableBlock key={node.id} node={node} />);
    } else {
      elements.push(<BlockItem key={node.id} node={node} />);
    }
  }
  return elements;
}

// --- Editor ---

// How many journal days to load per batch
const JOURNAL_BATCH = 5;

export function Editor() {
  const pageId = currentPage.value;
  if (!pageId) {
    return (
      <div class="editor empty">
        <p>Select a page or start with today's journal.</p>
      </div>
    );
  }

  if (isJournalPage(pageId)) {
    return <JournalView startPageId={pageId} />;
  }

  return <SinglePageView pageId={pageId} />;
}

function SinglePageView({ pageId }: { pageId: string }) {
  const tree = buildTree(pageId);
  const flat = flattenTree(tree);
  const backlinks = getBacklinks(pageId);

  function handleCopyMarkdown() {
    const md = exportPage(pageId);
    navigator.clipboard.writeText(md);
  }

  function handleDownloadMarkdown() {
    const md = exportPage(pageId);
    const title = pageTitle(pageId);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class="editor">
      <div class="page-toolbar">
        <button class="toolbar-btn" onClick={handleCopyMarkdown} title="Copy as Markdown"><IconCopy /></button>
        <button class="toolbar-btn" onClick={handleDownloadMarkdown} title="Download page as Markdown"><IconDownload /></button>
      </div>
      <h1 class="page-title">{pageTitle(pageId)}</h1>
      <div class="block-tree">
        {renderBlockList(flat)}
      </div>
      {backlinks.length > 0 && <BacklinksPanel backlinks={backlinks} />}
    </div>
  );
}

function JournalView({ startPageId }: { startPageId: string }) {
  const allJournals = getJournalPages();

  // Find the index of the current journal in the sorted list
  const startIdx = allJournals.findIndex(p => p.id === startPageId);
  const [visibleCount, setVisibleCount] = useState(JOURNAL_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when the start page changes
  useEffect(() => {
    setVisibleCount(JOURNAL_BATCH);
  }, [startPageId]);

  // Slice from the current journal onwards (older)
  const visibleJournals = allJournals.slice(
    Math.max(startIdx, 0),
    Math.max(startIdx, 0) + visibleCount,
  );
  const hasMore = Math.max(startIdx, 0) + visibleCount < allJournals.length;

  // IntersectionObserver to load more when sentinel enters viewport
  const loadMore = useCallback(() => {
    if (hasMore) setVisibleCount(c => c + JOURNAL_BATCH);
  }, [hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, visibleCount]);

  return (
    <div class="editor journal-view">
      {visibleJournals.map(page => (
        <JournalDay key={page.id} pageId={page.id} />
      ))}
      {hasMore && <div ref={sentinelRef} class="journal-sentinel">Loading...</div>}
    </div>
  );
}

function JournalDay({ pageId }: { pageId: string }) {
  const tree = buildTree(pageId);
  const flat = flattenTree(tree);
  const backlinks = getBacklinks(pageId);

  return (
    <div class="journal-day">
      <h1 class="page-title journal-day-title" onClick={() => navigateById(pageId)}>
        {pageTitle(pageId)}
      </h1>
      <div class="block-tree">
        {renderBlockList(flat)}
      </div>
      {backlinks.length > 0 && <BacklinksPanel backlinks={backlinks} />}
    </div>
  );
}

function BacklinksPanel({ backlinks }: { backlinks: { block: Block; children: FlatBlock[] }[] }) {
  return (
    <div class="backlinks">
      <h3>Linked References</h3>
      {backlinks.map(({ block, children }) => (
        <div key={block.id} class="backlink" onClick={() => navigateById(block.pageId)}>
          <span class="backlink-page">{pageTitle(block.pageId)}</span>
          <span
            class="backlink-content"
            dangerouslySetInnerHTML={{ __html: renderContent(block.content) }}
          />
          {children.length > 0 && (
            <div class="backlink-children">
              {children.map(child => (
                <div
                  key={child.id}
                  class="backlink-child"
                  style={`padding-left: ${child.depth * 1}rem`}
                  dangerouslySetInnerHTML={{ __html: renderContent(child.content) }}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
