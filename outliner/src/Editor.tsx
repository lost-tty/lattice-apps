// Lattice Outliner — Editor
//
// Block outliner with contentEditable, keyboard navigation,
// wiki link rendering, backlinks, collapse, and drag-and-drop.
//
// Blocks render as a FLAT list so indent/outdent/drag keeps
// the contentEditable mounted and focused.

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'preact/hooks';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { IconCopy, IconDownload, IconCode, IconTree, IconUndo, IconRedo } from './Icons';
import type { BlockNode } from './types';
import {
  activeBlockId, currentPage, blockData,
  saveBlock, deleteBlock, buildTree, flattenTree, hasChildren, toggleCollapse,
  createBlockAfter, createChildBlock, isParagraph, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious, moveBlock, isDescendant,
  blockKind, canAcceptChildren, isCollapsed,
  createTable, insertTableRow, insertTableCol, reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol,
  parseMarkdownToItems, insertBlocksAfter, exportPage,
  renderContent, parseHeading, parseTodoStatus, cycleTodoStatus, toggleCheckbox, isTableRow, isTableSeparator, parseTableCells, getTableGrid,
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
  requestAnimationFrame(() => {
    (e.target as HTMLElement).closest('.block')?.classList.add('dragging');
  });
}

// --- Block component ---

/** Parse raw editor text into block type + content.
 *  "- text" → bullet; everything else → paragraph.
 *  Headings/todos are stored inside content, so no special handling here. */
function parseRaw(raw: string): { type: 'bullet' | 'paragraph'; content: string } {
  if (raw.startsWith('- ') || raw.startsWith('* ') || raw.startsWith('+ ')) {
    return { type: 'bullet', content: raw.slice(2) };
  }
  return { type: 'paragraph', content: raw };
}

/** The prefix shown in the editor for a given block type. */
function editPrefix(type: string | undefined): string {
  return type === 'paragraph' ? '' : '- ';
}

function BlockItem({ node }: { node: FlatBlock }) {
  const isActive = activeBlockId.value === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const hasKids = hasChildren(node.id);
  const isHr = node.content === '---';
  const prefix = editPrefix(node.type);

  // Enter edit mode: set raw markdown text, focus, and place cursor.
  // useLayoutEffect runs synchronously after DOM commit (before paint).
  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    el.textContent = prefix + node.content;
    el.focus();
    // Read cursor intent — ignore if it was meant for a different block
    const cursor = (pendingActivation?.blockId === node.id)
      ? pendingActivation.cursor
      : 'end';
    pendingActivation = null;
    setCursor(el, cursor, prefix.length);
  }, [isActive]);

  // View mode: render formatted HTML (Preact never owns children).
  const collapsed = hasKids && isCollapsed(node.id);
  useLayoutEffect(() => {
    if (isActive || !ref.current) return;
    const { status, text: statusText } = parseTodoStatus(node.content);
    const { text } = parseHeading(statusText);
    const marker = status ? `<span class="todo-marker ${status}"></span>` : '';
    ref.current.innerHTML = marker + `<span>${renderContent(text) || '<br>'}</span>`;
    if (collapsed) {
      const el = document.createElement('span');
      el.className = 'collapsed-ellipsis';
      el.textContent = '…';
      el.onclick = (e) => { e.stopPropagation(); toggleCollapse(node.id); };
      ref.current.appendChild(el);
    }
  }, [isActive, node.content, collapsed]);

  /** Save current editor text to the data model, re-parsing type from prefix. */
  function saveFromEditor() {
    const raw = ref.current?.textContent || '';
    const { type, content } = parseRaw(raw);
    const current = blockData.value[node.id];
    if (!current) return;
    const currentType = current.type || 'bullet';
    if (content !== current.content || type !== currentType) {
      saveBlock({ ...current, content, type });
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const el = ref.current!;
    const raw = el.textContent || '';
    const { type: parsedType, content: parsedContent } = parseRaw(raw);

    // Undo / Redo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      saveFromEditor();
      if (e.shiftKey) redo(); else undo();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      // If the block content is a table row, convert it to a table
      const cells = parseTableCells(parsedContent);
      if (cells && cells.length > 0) {
        beginUndo('create table');
        const tableId = createTable(node.id, [cells]);
        void deleteBlock(node.id);
        const newCellIds = insertTableRow(tableId);
        commitUndo();
        if (newCellIds.length > 0) activateBlock(newCellIds[0], 'start');
        return;
      }

      const offset = getCursorOffset(el);
      const rawBefore = raw.slice(0, offset);
      const rawAfter = raw.slice(offset);

      if (rawBefore === '') {
        // Cursor at position 0: insert empty block before, keep content in new block
        beginUndo('split block');
        saveBlock({ ...node, content: '', type: 'paragraph' });
        const { type: afterType, content: afterContent } = parseRaw(raw);
        const newId = createBlockAfter(node.id, afterContent, afterType);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      beginUndo('split block');
      const { type: beforeType, content: beforeContent } = parseRaw(rawBefore);
      el.textContent = rawBefore;
      saveBlock({ ...node, content: beforeContent, type: beforeType });

      // Headings act as parents — Enter creates a child block, not a sibling
      const { level } = parseHeading(beforeContent);
      if (level) {
        const newId = createChildBlock(node.id, rawAfter);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      const newId = createBlockAfter(node.id, rawAfter, beforeType);
      commitUndo();
      activateBlock(newId, 'start');
      return;
    }

    if (e.key === 'Backspace') {
      // Cursor at the very start → join with previous block
      if (getCursorOffset(el) === 0 && raw !== '') {
        e.preventDefault();
        beginUndo('join blocks');
        saveFromEditor();
        const joined = joinBlockWithPrevious(node.id);
        commitUndo();
        if (joined) activateBlock(joined.prevId, joined.cursorPos);
        return;
      }

      // Only the bullet prefix remains → demote to empty paragraph
      if (raw === '- ' || raw === '* ' || raw === '+ ') {
        e.preventDefault();
        el.textContent = '';
        const current = blockData.value[node.id];
        if (current) saveBlock({ ...current, content: '', type: 'paragraph' });
        return;
      }

      // Completely empty → try to join or delete
      if (raw === '') {
        e.preventDefault();
        beginUndo('delete block');
        const joined = joinBlockWithPrevious(node.id);
        if (joined) {
          activateBlock(joined.prevId, joined.cursorPos);
        } else {
          removeBlock(node.id);
        }
        commitUndo();
        return;
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
      if (getCursorOffset(el) === raw.length) {
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
    // Only save from editor if this block is still active.
    // If Enter/Tab/Arrow already saved and changed activeBlockId, skip —
    // the view useEffect may have overwritten the DOM content by now.
    if (activeBlockId.value === node.id) {
      saveFromEditor();
      activeBlockId.value = null;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    // Single-line paste: let the browser insert it as plain text.
    if (!text.includes('\n')) return;

    e.preventDefault();

    const el = ref.current!;
    const offset = getCursorOffset(el);
    const raw = el.textContent ?? '';
    const { content: beforeContent } = parseRaw(raw.slice(0, offset));
    const rawAfter = raw.slice(offset);

    const items = parseMarkdownToItems(text);
    if (items.length === 0) return;

    // Merge the cursor split with the first and last pasted items.
    const merged = items.map((item, i) => ({
      ...item,
      content:
        (i === 0 ? beforeContent : '') + item.content + (i === items.length - 1 ? rawAfter : ''),
    }));

    beginUndo('paste');
    // The current block takes the first item's content.
    saveBlock({ ...node, content: merged[0].content });

    if (merged.length === 1) {
      // Everything fit in one block — place cursor after the pasted text.
      commitUndo();
      activateBlock(node.id, beforeContent.length + items[0].content.length);
      return;
    }

    // Remaining items become new blocks; cursor lands before the "after" text.
    const lastId = insertBlocksAfter(node.id, merged.slice(1));
    commitUndo();
    const lastContent = merged[merged.length - 1].content;
    activateBlock(lastId, lastContent.length - rawAfter.length);
  }

  function handleClick(e: MouseEvent) {
    if (isActive) return; // let browser handle cursor placement in contentEditable
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
      const current = blockData.value[node.id];
      if (current) saveBlock({ ...current, content: toggleCheckbox(current.content) });
      return;
    }
    if (target.classList.contains('todo-marker')) {
      e.stopPropagation();
      const current = blockData.value[node.id];
      if (current) saveBlock({ ...current, content: cycleTodoStatus(current.content) });
      return;
    }
    // Defer activation to the next frame so the browser's click/mouseup caret
    // placement is fully resolved before we set content and place the cursor.
    // This eliminates the race where the browser overrides our caret position.
    const id = node.id;
    requestAnimationFrame(() => {
      activateBlock(id, 'end');
    });
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
  const { status } = parseTodoStatus(node.content);
  const { level } = parseHeading(node.content);
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
      {!isPara && <span class="bullet" />}
      {isHr && !isActive ? (
        <hr onClick={handleClick} />
      ) : (
        <div
          ref={ref}
          class={contentClass}
          contentEditable={isActive}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={handleClick}
          onPaste={(e: Event) => handlePaste(e as ClipboardEvent)}
        />
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
              if (flat.length === 0) return;
              // Find the right insertion level: last heading's children, or root
              let parentId: string | null = null;
              for (let i = flat.length - 1; i >= 0; i--) {
                if (flat[i].depth === 0 && blockKind(blockData.value[flat[i].id]) === 'heading') {
                  parentId = flat[i].id;
                  break;
                }
              }
              // Find the last sibling at that level
              const siblings = flat.filter(b => {
                const block = blockData.value[b.id];
                return block && block.parent === parentId && block.type !== 'table';
              });
              const lastSibling = siblings[siblings.length - 1];
              if (lastSibling) {
                const block = blockData.value[lastSibling.id];
                if (block && block.content === '') {
                  activateBlock(lastSibling.id, 'start');
                  return;
                }
              }
              // Create after the last block at that level
              const allAtLevel = flat.filter(b => blockData.value[b.id]?.parent === parentId);
              const anchor = allAtLevel[allAtLevel.length - 1];
              if (anchor) {
                beginUndo('new block');
                const newId = createBlockAfter(anchor.id, '', 'paragraph');
                commitUndo();
                activateBlock(newId, 'start');
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
