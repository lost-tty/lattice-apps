// Lattice Outliner — Editor
//
// Block outliner with contentEditable, keyboard navigation,
// wiki link rendering, backlinks, collapse, and drag-and-drop.
//
// Blocks render as a FLAT list so indent/outdent/drag keeps
// the contentEditable mounted and focused.

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'preact/hooks';
import { Content } from './renderContent';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { IconCopy, IconDownload, IconCode, IconTree, IconUndo, IconRedo } from './Icons';
import type { BlockNode } from './types';
import {
  activeBlockId, currentPage, blockData,
  saveBlock, deleteBlock, buildTree, flattenTree, hasChildren, toggleCollapse,
  createBlockAfter, createChildBlock, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious, moveBlock, isDescendant,
  blockKind, canAcceptChildren, isCollapsed, blockToMarkdown, markdownToBlock,
  createTable, insertTableRow, insertTableCol, reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol,
  parseMarkdownToItems, insertBlocksAfter, exportPage,
  parseHeading, parseAnnotations, parseTodoStatus, cycleTodoStatus, isTableRow, isTableSeparator, parseTableCells, getTableGrid,
  getBacklinks, pageTitle, navigateTo, navigateById,
  isJournalPage, getJournalPages,
  beginUndo, commitUndo, undo, redo, canUndo, canRedo,
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

// --- Activation & cursor ---
//
// pendingActivation is the single source of truth for which block should
// become active and where the cursor goes.  It is scoped to a specific
// block ID so stale values from cancelled operations are harmless.

let pendingActivation: {
  blockId: string;
  cursor: 'start' | 'end' | number;
} | null = null;

/** Activate a block with a specific cursor position. */
function activateBlock(blockId: string, cursor: 'start' | 'end' | number = 'end') {
  pendingActivation = { blockId, cursor };
  activeBlockId.value = blockId;
}

/** Get the cursor's character offset within a contentEditable element.
 *  Handles both cases: focusNode is the text node (offset = char index)
 *  or focusNode is the element (offset = child index → convert). */
function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.focusNode) return 0;
  if (sel.focusNode === el) {
    // focusOffset is a child index — sum text lengths up to it
    let offset = 0;
    for (let i = 0; i < sel.focusOffset && i < el.childNodes.length; i++) {
      offset += el.childNodes[i].textContent?.length ?? 0;
    }
    return offset;
  }
  return sel.focusOffset;
}

/** Place the caret inside a contentEditable element.
 *  `position` is relative to the content (after prefix).
 *  Always targets the text node (not the element) so that
 *  sel.focusOffset is a character offset, not a child index. */
function setCursor(el: HTMLElement, position: 'start' | 'end' | number, prefixLen: number) {
  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== 3) return; // need a text node
  const len = textNode.textContent?.length ?? 0;
  const sel = window.getSelection()!;
  const range = document.createRange();
  let offset: number;
  if (typeof position === 'number') {
    offset = Math.min(position + prefixLen, len);
  } else if (position === 'start') {
    offset = prefixLen;
  } else {
    offset = len;
  }
  range.setStart(textNode, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// --- Shared helpers ---

/** Compute visual depth: subtract heading ancestor levels so children
 *  of headings render at the heading's visual level. */
function getVisualDepth(node: FlatBlock): number {
  let depth = node.depth;
  let pid = node.parent;
  while (pid) {
    const p = blockData.value[pid];
    if (p && p.type === 'paragraph' && parseHeading(p.content).level) depth--;
    pid = p?.parent ?? null;
  }
  return depth;
}

/** Start a block-level drag operation. */
function startBlockDrag(e: DragEvent, blockId: string) {
  dragBlockId = blockId;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', blockId);
  const block = (e.target as HTMLElement).closest('.block') as HTMLElement;
  if (block) {
    e.dataTransfer!.setDragImage(block, 0, block.offsetHeight / 2);
    requestAnimationFrame(() => block.classList.add('dragging'));
  }
}

/** Return the content template for a new sibling of this block.
 *  Checkboxes continue unchecked, todo keywords carry over, etc. */
function continuationContent(block: Block): string {
  const { status, syntax } = parseTodoStatus(block.content);
  if (syntax === 'checkbox') return '[ ] ';
  if (status) return status === 'done' || status === 'cancelled' ? '' : `${status.toUpperCase()} `;
  return '';
}

// --- Block component ---

function BlockItem({ node }: { node: FlatBlock }) {
  const isActive = activeBlockId.value === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const hasKids = hasChildren(node.id);
  const isHr = node.content === '---';

  // Edit mode: show markdown source.
  const md = blockToMarkdown(node);

  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const activation = pendingActivation?.blockId === node.id ? pendingActivation : null;
    pendingActivation = null;
    el.textContent = md;
    el.focus();
    setCursor(el, activation?.cursor ?? 'end', md.length - node.content.length);
  }, [isActive]);



  /** Parse editor text back to block fields and save. */
  function saveFromEditor() {
    const { type, content } = markdownToBlock(ref.current?.textContent || '');
    const current = blockData.value[node.id];
    if (!current) return;
    if (content !== current.content || type !== current.type) {
      saveBlock({ ...current, content, type });
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const el = ref.current!;
    const rawText = el.textContent || '';
    const { type: parsedType, content } = markdownToBlock(rawText);
    const prefixLen = rawText.length - content.length;

    // Undo / Redo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      saveFromEditor();
      if (e.shiftKey) redo(); else undo();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      const cells = parseTableCells(content);
      if (cells && cells.length > 0) {
        beginUndo('create table');
        const tableId = createTable(node.id, [cells]);
        void deleteBlock(node.id);
        const newCellIds = insertTableRow(tableId);
        commitUndo();
        if (newCellIds.length > 0) activateBlock(newCellIds[0], 'start');
        return;
      }

      const contentOffset = Math.max(0, getCursorOffset(el) - prefixLen);
      const before = content.slice(0, contentOffset);
      const after = content.slice(contentOffset);

      if (before === '') {
        beginUndo('split block');
        saveBlock({ ...node, content: '', type: 'paragraph' });
        const newId = createBlockAfter(node.id, content, parsedType);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      beginUndo('split block');
      saveBlock({ ...node, content: before, type: parsedType });

      const { level } = parseHeading(before);
      if (level) {
        const newId = createChildBlock(node.id, after);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      const newContent = after || continuationContent(node);
      const newId = createBlockAfter(node.id, newContent, parsedType);
      commitUndo();
      activateBlock(newId, newContent ? 'end' : 'start');
      return;
    }

    if (e.key === 'Backspace') {
      // Cursor at absolute start → join with previous or delete block
      if (getCursorOffset(el) === 0) {
        e.preventDefault();
        beginUndo(content === '' ? 'delete block' : 'join blocks');
        const joined = joinBlockWithPrevious(node.id, content);
        if (joined) {
          activateBlock(joined.prevId, joined.cursorPos);
        } else if (content === '') {
          removeBlock(node.id);
        }
        commitUndo();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      beginUndo(e.shiftKey ? 'outdent' : 'indent');
      saveFromEditor();
      if (e.shiftKey) outdentBlock(node.id);
      else indentBlock(node.id);
      commitUndo();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (getCursorOffset(el) === 0) {
        const flat = flattenTree(buildTree(node.pageId));
        const idx = flat.findIndex(b => b.id === node.id);
        if (idx > 0) {
          e.preventDefault();
          saveFromEditor();
          activateBlock(flat[idx - 1].id, 'end');
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (getCursorOffset(el) === (el.textContent?.length ?? 0)) {
        const flat = flattenTree(buildTree(node.pageId));
        const idx = flat.findIndex(b => b.id === node.id);
        if (idx < flat.length - 1) {
          e.preventDefault();
          saveFromEditor();
          activateBlock(flat[idx + 1].id, 'start');
        }
      }
      return;
    }
  }

  function handleBlur() {
    if (!ref.current) return;
    if (activeBlockId.value === node.id) {
      saveFromEditor();
      activeBlockId.value = null;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\n')) return;

    e.preventDefault();

    const el = ref.current!;
    const rawText = el.textContent ?? '';
    const { content } = markdownToBlock(rawText);
    const contentOffset = Math.max(0, getCursorOffset(el) - (rawText.length - content.length));
    const before = content.slice(0, contentOffset);
    const after = content.slice(contentOffset);

    const items = parseMarkdownToItems(text);
    if (items.length === 0) return;

    const merged = items.map((item, i) => ({
      ...item,
      content:
        (i === 0 ? before : '') + item.content + (i === items.length - 1 ? after : ''),
    }));

    beginUndo('paste');
    saveBlock({ ...node, content: merged[0].content });

    if (merged.length === 1) {
      commitUndo();
      activateBlock(node.id, before.length + items[0].content.length);
      return;
    }

    const lastId = insertBlocksAfter(node.id, merged.slice(1));
    commitUndo();
    const lastContent = merged[merged.length - 1].content;
    activateBlock(lastId, lastContent.length - after.length);
  }

  function handleClick(e: MouseEvent) {
    if (isActive) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('wiki-link') || target.classList.contains('tag')) {
      e.stopPropagation();
      const page = target.dataset.page;
      if (page) navigateTo(page);
      return;
    }
    if (target.classList.contains('hyperlink')) {
      e.stopPropagation();
      return;
    }
    if (target.classList.contains('todo-marker')) {
      e.stopPropagation();
      const current = blockData.value[node.id];
      if (current) saveBlock({ ...current, content: cycleTodoStatus(current.content) });
      return;
    }
    activeBlockId.value = node.id;
  }

  // --- Drag handlers ---

  function handleDragStart(e: DragEvent) {
    startBlockDrag(e, node.id);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!dragBlockId || dragBlockId === node.id) return;
    if (isDescendant(node.id, dragBlockId)) return; // can't drop onto own descendant

    const dragBlock = blockData.value[dragBlockId];
    if (!dragBlock) return;

    const dragKind = blockKind(dragBlock);
    const targetKind = blockKind(node);

    // Can the dragged block be a sibling at this level?
    // If target is a heading, only headings may be siblings.
    const canSibling = targetKind !== 'heading' || dragKind === 'heading';

    // Can the dragged block nest under this target?
    const canNest = canAcceptChildren(node);

    const el = (e.currentTarget as HTMLElement);
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const xOffset = e.clientX - rect.left;

    clearDropIndicators();

    if (y < rect.height * 0.25 && canSibling) {
      el.classList.add('drop-before');
    } else {
      const nestThreshold = (node.depth + 1) * INDENT_PX;
      const wantsNest = xOffset >= nestThreshold;
      if (wantsNest && canNest) {
        el.classList.add('drop-nested');
      } else if (canSibling) {
        el.classList.add('drop-after');
      }
      // If neither is allowed, no indicator shown
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
      beginUndo('move block');
      moveBlock(dragBlockId, node.id, position);
      commitUndo();
    }
    dragBlockId = null;
  }

  function handleDragEnd() {
    clearDropIndicators();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    dragBlockId = null;
  }

  // --- Render ---

  const isPara = node.type === 'paragraph';
  const collapsed = hasKids && isCollapsed(node.id);
  const { status, text: statusText } = parseTodoStatus(node.content);
  const { level, text: headingText } = parseHeading(statusText);
  const viewText = level ? parseAnnotations(headingText).text : headingText;
  const contentClass = [
    'block-content',
    isActive ? 'editing' : '',
    !isActive && status === 'done' ? 'is-done' : '',
    !isActive && status === 'cancelled' ? 'is-cancelled' : '',
    level ? `heading-${level}` : '',
  ].filter(Boolean).join(' ');

  const visualDepth = getVisualDepth(node);

  return (
    <div
      class="block"
      style={isHr && !isActive ? '--depth: 0' : `--depth: ${visualDepth}`}
      onDragOver={(e: Event) => handleDragOver(e as DragEvent)}
      onDragLeave={(e: Event) => handleDragLeave(e as DragEvent)}
      onDrop={(e: Event) => handleDrop(e as DragEvent)}
      onDragEnd={handleDragEnd}
    >
      <span
        class={`gutter${hasKids ? ' has-children' : ''}${isCollapsed(node.id) ? ' collapsed' : ''}`}
        draggable
        onClick={(e: Event) => { if (hasKids) { e.stopPropagation(); toggleCollapse(node.id); } }}
        onDragStart={(e: Event) => handleDragStart(e as DragEvent)}
      />
      {isHr && !isActive ? (
        <hr onClick={handleClick} />
      ) : isActive ? (
        <div
          key="edit"
          ref={ref}
          class={contentClass}
          contentEditable
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={handleClick}
          onPaste={(e: Event) => handlePaste(e as ClipboardEvent)}
        />
      ) : (
        <div key="view" class={contentClass} onClick={handleClick}>
          {!isPara && <span class="bullet-marker" />}
          {status && <span class={`todo-marker ${status}`} />}
          <span><Content text={viewText} fallback={<br />} /></span>
          {collapsed && (
            <span class="collapsed-ellipsis" onClick={(e: Event) => { e.stopPropagation(); toggleCollapse(node.id); }}>…</span>
          )}
        </div>
      )}
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

  function onDragEnd() {
    dragRowState = null;
    dragColState = null;
    dragBlockId = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  const colCount = colOrders.length;

  return (
    <div class="block table-block" style={`--depth: ${getVisualDepth(node)}`} onDragEnd={onDragEnd}>
      <span
        class="gutter table-gutter"
        draggable
        tabIndex={0}
        onClick={() => { activeBlockId.value = node.id; }}
        onKeyDown={(e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Backspace' || ke.key === 'Delete') {
            ke.preventDefault();
            beginUndo('delete table');
            void deleteBlock(node.id);
            commitUndo();
            activeBlockId.value = null;
          }
        }}
        onDragStart={(e: Event) => startBlockDrag(e as DragEvent, node.id)}
      />
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
                  >⋯</span>
                )}
                {activeBlockId.value === cell.id ? (
                  <CellEditor cell={cell} />
                ) : (
                  <span><Content text={cell.content} fallback="&nbsp;" /></span>
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

// --- Kanban Board ---

/** Collect all descendant IDs from a BlockNode's children tree. */
function collectDescendantIds(node: FlatBlock): Set<string> {
  const ids = new Set<string>();
  function walk(children: BlockNode[]) {
    for (const child of children) {
      ids.add(child.id);
      walk(child.children);
    }
  }
  walk(node.children);
  return ids;
}

function KanbanCard({ blockId }: { blockId: string }) {
  const block = blockData.value[blockId];
  if (!block) return null;
  const isActive = activeBlockId.value === blockId;
  const ref = useRef<HTMLDivElement>(null);

  const { status, text: statusText } = parseTodoStatus(block.content);
  const { text: viewText } = parseHeading(statusText);

  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const activation = pendingActivation?.blockId === blockId ? pendingActivation : null;
    pendingActivation = null;
    el.textContent = block.content;
    el.focus();
    setCursor(el, activation?.cursor ?? 'end', 0);
  }, [isActive]);

  function saveFromEditor() {
    const content = ref.current?.textContent || '';
    const current = blockData.value[blockId];
    if (!current) return;
    if (content !== current.content) {
      saveBlock({ ...current, content, type: 'bullet' });
    }
  }

  return (
    <div
      class={`kanban-card${isActive ? ' editing' : ''}`}
      draggable={!isActive}
      onDragStart={(e: Event) => {
        const ev = e as DragEvent;
        dragBlockId = blockId;
        ev.dataTransfer!.effectAllowed = 'move';
        ev.dataTransfer!.setData('text/plain', blockId);
      }}
      onDragEnd={() => { dragBlockId = null; }}
      onDragOver={(e: Event) => {
        const ev = e as DragEvent;
        if (!dragBlockId || dragBlockId === blockId) return;
        ev.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const half = (ev.clientY - rect.top) / rect.height;
        el.classList.remove('drop-before', 'drop-after');
        el.classList.add(half < 0.5 ? 'drop-before' : 'drop-after');
      }}
      onDragLeave={(e: Event) => {
        (e.currentTarget as HTMLElement).classList.remove('drop-before', 'drop-after');
      }}
      onDrop={(e: Event) => {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        const position = el.classList.contains('drop-before') ? 'before' : 'after';
        el.classList.remove('drop-before', 'drop-after');
        if (dragBlockId && dragBlockId !== blockId) {
          beginUndo('move card');
          moveBlock(dragBlockId, blockId, position as 'before' | 'after');
          commitUndo();
        }
        dragBlockId = null;
      }}
    >
      {isActive ? (
        <div
          ref={ref}
          class="kanban-card-content"
          contentEditable
          onBlur={() => {
            if (activeBlockId.value === blockId) {
              saveFromEditor();
              activeBlockId.value = null;
            }
          }}
          onKeyDown={(e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Escape' || ke.key === 'Enter') {
              ke.preventDefault();
              saveFromEditor();
              activeBlockId.value = null;
            }
            if (ke.key === 'Backspace' && (ref.current?.textContent || '') === '') {
              ke.preventDefault();
              beginUndo('delete card');
              void deleteBlock(blockId);
              commitUndo();
              activeBlockId.value = null;
            }
          }}
        />
      ) : (
        <div
          class="kanban-card-content"
          onClick={() => { activeBlockId.value = blockId; }}
        >
          {status && <span class={`todo-marker ${status}`} />}
          <span><Content text={viewText} fallback={<br />} /></span>
        </div>
      )}
    </div>
  );
}

function KanbanColumnHeader({ colId, title, count }: { colId: string; title: string; count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);

  function save() {
    if (!ref.current) return;
    const newTitle = ref.current.textContent?.trim() || title;
    const block = blockData.value[colId];
    if (!block) return;
    const { level } = parseHeading(block.content);
    if (!level) return;
    // Rebuild heading content preserving annotations
    const { kanban, hl } = parseAnnotations(parseHeading(block.content).text);
    let content = '#'.repeat(level) + ' ' + newTitle;
    if (kanban) content += ' [.kanban]';
    if (hl != null) content += ` [.hl-${hl}]`;
    if (content !== block.content) saveBlock({ ...block, content });
    setEditing(false);
  }

  return (
    <div
      class="kanban-column-header"
      draggable={!editing}
      onDragStart={(e: Event) => {
        dragBlockId = colId;
        dragIsColumn = true;
        (e as DragEvent).dataTransfer!.effectAllowed = 'move';
      }}
      onDragEnd={() => { dragBlockId = null; dragIsColumn = false; }}
    >
      <span
        ref={ref}
        contentEditable={editing}
        class={`kanban-column-title${editing ? ' editing' : ''}`}
        onClick={() => {
          if (!editing) {
            setEditing(true);
            requestAnimationFrame(() => {
              if (ref.current) {
                ref.current.textContent = title;
                ref.current.focus();
                const sel = window.getSelection()!;
                sel.selectAllChildren(ref.current);
                sel.collapseToEnd();
              }
            });
          }
        }}
        onBlur={() => save()}
        onKeyDown={(e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === 'Escape') {
            ke.preventDefault();
            save();
          }
        }}
      >{title}</span>
      <span class="kanban-column-count">{count}</span>
    </div>
  );
}

let dragIsColumn = false;

function KanbanBoard({ node }: { node: FlatBlock }) {
  // Read children live from blockData so the board re-renders on changes
  const columns = Object.values(blockData.value)
    .filter(b => b.pageId === node.pageId && b.parent === node.id
      && b.type === 'paragraph' && parseHeading(b.content).level)
    .sort((a, b) => a.order - b.order);

  function handleColumnDragOver(e: DragEvent, columnId: string) {
    if (!dragBlockId) return;
    e.preventDefault();
    if (dragIsColumn && dragBlockId !== columnId) {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const half = (e.clientX - rect.left) / rect.width;
      el.classList.remove('drop-before', 'drop-after', 'drop-over');
      el.classList.add(half < 0.5 ? 'drop-before' : 'drop-after');
    }
  }

  function handleColumnDragEnter(e: DragEvent) {
    if (!dragBlockId) return;
    if (!dragIsColumn) {
      (e.currentTarget as HTMLElement).classList.add('drop-over');
    }
  }

  function handleColumnDragLeave(e: DragEvent) {
    const el = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      el.classList.remove('drop-over', 'drop-before', 'drop-after');
    }
  }

  function handleColumnDrop(e: DragEvent, columnId: string) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    if (dragIsColumn) {
      const position = el.classList.contains('drop-before') ? 'before' : 'after';
      el.classList.remove('drop-before', 'drop-after');
      if (dragBlockId && dragBlockId !== columnId) {
        beginUndo('reorder column');
        moveBlock(dragBlockId, columnId, position as 'before' | 'after');
        commitUndo();
      }
    } else {
      el.classList.remove('drop-over');
      if (dragBlockId && dragBlockId !== columnId) {
        beginUndo('move card');
        moveBlock(dragBlockId, columnId, 'nested');
        commitUndo();
      }
    }
    dragBlockId = null;
    dragIsColumn = false;
  }

  return (
    <div class="kanban-board">
      <div class="kanban-columns">
        {columns.map(col => {
          const { text: headingText } = parseHeading(col.content);
          const { text: title, hl } = parseAnnotations(headingText);
          const cards = Object.values(blockData.value)
            .filter(b => b.pageId === node.pageId && b.parent === col.id && b.type !== 'table')
            .sort((a, b) => a.order - b.order);
          return (
            <div
              key={col.id}
              class={`kanban-column${hl ? ` hl-${hl}` : ''}`}
              onDragOver={(e: Event) => handleColumnDragOver(e as DragEvent, col.id)}
              onDragEnter={(e: Event) => handleColumnDragEnter(e as DragEvent)}
              onDragLeave={(e: Event) => handleColumnDragLeave(e as DragEvent)}
              onDrop={(e: Event) => handleColumnDrop(e as DragEvent, col.id)}
            >
              <KanbanColumnHeader colId={col.id} title={title} count={cards.length} />
              {cards.map(card => (
                <KanbanCard key={card.id} blockId={card.id} />
              ))}
              <button
                class="kanban-add-card"
                onClick={() => {
                  beginUndo('add card');
                  const newId = createChildBlock(col.id, '', 'bullet');
                  commitUndo();
                  activateBlock(newId, 'start');
                }}
              >+ Add card</button>
            </div>
          );
        })}
        <button
          class="kanban-add-column"
          onClick={() => {
            const level = (parseHeading(node.content).level ?? 1) + 1;
            const prefix = '#'.repeat(level) + ' ';
            beginUndo('add column');
            const newId = createChildBlock(node.id, prefix + 'New column', 'paragraph');
            commitUndo();
            activateBlock(newId, 'start');
          }}
        >+</button>
      </div>
    </div>
  );
}

function renderBlockList(flat: FlatBlock[]) {
  const cellIds = new Set<string>();
  const kanbanIds = new Set<string>();

  // Collect IDs to skip
  for (const node of flat) {
    if (node.type === 'table') {
      const grid = getTableGrid(node.id);
      for (const row of grid) for (const cell of row.cells) cellIds.add(cell.id);
    }
    if (node.type === 'paragraph') {
      const heading = parseHeading(node.content);
      if (heading.level && parseAnnotations(heading.text).kanban) {
        for (const id of collectDescendantIds(node)) kanbanIds.add(id);
      }
    }
  }

  const elements: any[] = [];
  for (const node of flat) {
    if (cellIds.has(node.id) || kanbanIds.has(node.id)) continue;
    if (node.type === 'table') {
      elements.push(<TableBlock key={node.id} node={node} />);
    } else if (node.type === 'paragraph') {
      const heading = parseHeading(node.content);
      if (heading.level && parseAnnotations(heading.text).kanban) {
        elements.push(<BlockItem key={node.id} node={node} />);
        elements.push(<KanbanBoard key={`kanban-${node.id}`} node={node} />);
        continue;
      }
      elements.push(<BlockItem key={node.id} node={node} />);
    } else {
      elements.push(<BlockItem key={node.id} node={node} />);
    }
  }
  return elements;
}

// --- Editor ---

// How many journal days to load per batch (large enough to fill most viewports)
const JOURNAL_BATCH = 15;

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
    return <JournalView key={pageId} startPageId={pageId} />;
  }

  return <SinglePageView pageId={pageId} />;
}

// --- Page section (shared between single page and journal views) ---

function PageSection({ pageId, titleClickable }: { pageId: string; titleClickable?: boolean }) {
  const tree = buildTree(pageId);
  const flat = flattenTree(tree);
  const backlinks = getBacklinks(pageId);
  const [debugPanel, setDebugPanel] = useState<'off' | 'markdown' | 'ast'>('off');

  function togglePanel(panel: 'markdown' | 'ast') {
    setDebugPanel(prev => prev === panel ? 'off' : panel);
  }

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
    <div class={`page-section ${debugPanel !== 'off' ? 'with-debug' : ''}`}>
      <div class="page-section-main">
        <div class="page-toolbar">
          <button class="toolbar-btn" disabled={!canUndo()} onClick={() => undo()} title="Undo (⌘Z)"><IconUndo /></button>
          <button class="toolbar-btn" disabled={!canRedo()} onClick={() => redo()} title="Redo (⌘⇧Z)"><IconRedo /></button>
          <div class="toolbar-sep" />
          <button class={`toolbar-btn${debugPanel === 'markdown' ? ' active' : ''}`} onClick={() => togglePanel('markdown')} title="Debug Markdown"><IconCode /></button>
          <button class={`toolbar-btn${debugPanel === 'ast' ? ' active' : ''}`} onClick={() => togglePanel('ast')} title="Debug AST"><IconTree /></button>
          <div class="toolbar-sep" />
          <button class="toolbar-btn" onClick={handleCopyMarkdown} title="Copy as Markdown"><IconCopy /></button>
          <button class="toolbar-btn" onClick={handleDownloadMarkdown} title="Download page as Markdown"><IconDownload /></button>
        </div>
        <h1
          class={`page-title${titleClickable ? ' journal-day-title' : ''}`}
          onClick={titleClickable ? () => navigateById(pageId) : undefined}
        >
          {pageTitle(pageId)}
        </h1>
        <div class="block-tree">
          {renderBlockList(flat)}
          <div
            class="block-tree-tail"
            onClick={() => {
              const currentFlat = flattenTree(buildTree(pageId));
              if (currentFlat.length === 0) return;

              // Walk up from the last block past table cells and kanban descendants
              // to find the container block (table or kanban heading) we need to insert after
              let last = currentFlat[currentFlat.length - 1];
              let anchor = blockData.value[last.id];

              // Walk up to table
              if (anchor?.parent && blockData.value[anchor.parent]?.type === 'table') {
                anchor = blockData.value[anchor.parent];
              }

              // Walk up to kanban heading (card → column heading → kanban heading)
              function isKanbanHeading(b: Block | undefined): boolean {
                if (!b) return false;
                const h = parseHeading(b.content);
                return !!h.level && parseAnnotations(h.text).kanban;
              }
              while (anchor?.parent) {
                const parent = blockData.value[anchor.parent];
                if (isKanbanHeading(parent)) { anchor = parent; break; }
                // Column heading (child of kanban heading)
                if (parent?.parent && isKanbanHeading(blockData.value[parent.parent])) {
                  anchor = blockData.value[parent.parent]; break;
                }
                break;
              }

              if (!anchor) return;

              // If the anchor is empty and editable, just focus it
              const isSpecial = anchor.type === 'table' || isKanbanHeading(anchor);
              if (anchor.content.trim() === '' && !isSpecial) {
                activateBlock(anchor.id, 'end');
                return;
              }

              // Create a sibling paragraph after the anchor
              beginUndo('new block');
              if (isSpecial) {
                const id = crypto.randomUUID();
                const siblings = Object.values(blockData.value)
                  .filter(b => b.pageId === pageId && b.parent === anchor!.parent);
                const maxOrder = siblings.reduce((m, b) => Math.max(m, b.order), 0);
                // Match the heading level so it becomes a proper sibling
                const { level } = parseHeading(anchor.content);
                const content = level ? '#'.repeat(level) + ' ' : '';
                saveBlock({ id, content, pageId, parent: anchor.parent, order: maxOrder + 1, type: 'paragraph' });
                commitUndo();
                activateBlock(id, 'end');
              } else {
                const newId = createBlockAfter(anchor.id, '', 'paragraph');
                commitUndo();
                activateBlock(newId, 'end');
              }
            }}
          />
        </div>
        {backlinks.length > 0 && <BacklinksPanel backlinks={backlinks} />}
      </div>
      {debugPanel === 'markdown' && <DebugPanel header="Markdown"><pre class="markdown-panel-content">{exportPage(pageId)}</pre></DebugPanel>}
      {debugPanel === 'ast' && <DebugPanel header="AST"><ASTContent tree={tree} /></DebugPanel>}
    </div>
  );
}

function SinglePageView({ pageId }: { pageId: string }) {
  return (
    <div class="editor">
      <div class="editor-main">
        <PageSection pageId={pageId} />
      </div>
    </div>
  );
}

function DebugPanel({ header, children }: { header: string; children: any }) {
  return (
    <div class="debug-panel">
      <div class="debug-panel-header">{header}</div>
      {children}
    </div>
  );
}

function ASTContent({ tree }: { tree: BlockNode[] }) {
  function renderNode(node: BlockNode, prefix: string, isLast: boolean): any {
    const connector = isLast ? '└─ ' : '├─ ';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    const type = node.type === 'table' ? 'table' : node.type === 'paragraph' ? 'para' : 'bullet';
    const snippet = node.content.length > 30 ? node.content.slice(0, 30) + '…' : node.content;
    const meta = [
      isCollapsed(node.id) ? 'collapsed' : '',
    ].filter(Boolean).join(', ');

    return (
      <>
        <span class="ast-line">
          <span class="ast-prefix">{prefix}{connector}</span>
          <span class={`ast-type ast-type-${type}`}>{type}</span>
          {snippet && <span class="ast-content"> "{snippet}"</span>}
          {meta && <span class="ast-meta"> [{meta}]</span>}
        </span>{'\n'}
        {node.children.map((child, i) =>
          renderNode(child, childPrefix, i === node.children.length - 1)
        )}
      </>
    );
  }

  return (
    <pre class="markdown-panel-content ast-tree">
      <span class="ast-line"><span class="ast-type ast-type-page">page</span></span>{'\n'}
      {tree.map((node, i) => renderNode(node, '', i === tree.length - 1))}
    </pre>
  );
}

// --- Journal view with bidirectional scrolling ---
//
// Journals are sorted newest-first. The view loads a window around the
// start date and lazily expands in both directions via scroll events.
// key={startPageId} on the parent forces a fresh mount when navigating.

function JournalView({ startPageId }: { startPageId: string }) {
  const allJournals = getJournalPages();
  const startIdx = Math.max(allJournals.findIndex(p => p.id === startPageId), 0);

  const [newerCount, setNewerCount] = useState(startIdx > 0 ? JOURNAL_BATCH : 0);
  const [olderCount, setOlderCount] = useState(JOURNAL_BATCH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevNewerCount = useRef(0);

  const newerStart = Math.max(startIdx - newerCount, 0);
  const olderEnd = Math.min(startIdx + olderCount, allJournals.length);
  const visibleJournals = allJournals.slice(newerStart, olderEnd);

  const hasNewer = newerStart > 0;
  const hasOlder = olderEnd < allJournals.length;

  // After newer entries prepend, restore scroll so the anchor doesn't jump.
  useLayoutEffect(() => {
    if (newerCount > prevNewerCount.current && anchorRef.current && scrollRef.current) {
      anchorRef.current.scrollIntoView({ block: 'start' });
    }
    prevNewerCount.current = newerCount;
  }, [newerCount]);

  // Load more on scroll (both directions).
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (hasOlder && el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setOlderCount(c => c + JOURNAL_BATCH);
    }
    if (hasNewer && el.scrollTop < 400) {
      setNewerCount(c => c + JOURNAL_BATCH);
    }
  }, [hasNewer, hasOlder]);

  return (
    <div class="editor" ref={scrollRef} onScroll={onScroll}>
      <div class="editor-main journal-view">
        {visibleJournals.map(page => (
          <div key={page.id} ref={page.id === startPageId ? anchorRef : undefined}>
            <PageSection pageId={page.id} titleClickable />
          </div>
        ))}
      </div>
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
          <span class="backlink-content"><Content text={block.content} /></span>
          {children.length > 0 && (
            <div class="backlink-children">
              {children.map(child => (
                <div
                  key={child.id}
                  class="backlink-child"
                  style={`padding-left: ${child.depth * 1}rem`}
                >
                  <Content text={child.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
