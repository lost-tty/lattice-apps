import { useRef, useLayoutEffect } from 'preact/hooks';
import { Content } from './renderContent';
import type { FlatBlock } from './db';
import {
  activeBlockId, blockData,
  saveBlock, deleteBlock, buildTree, flattenTree, hasChildren, toggleCollapse,
  blockKind, canAcceptChildren, isCollapsed, blockToMarkdown, markdownToBlock,
  navigateTo,
} from './db';
import { beginUndo, commitUndo, undo, redo } from './undo';
import { parseHeading, parseAnnotations, parseTodoStatus, cycleTodoStatus, parseTableCells } from './parse';
import { createBlockAfter, createChildBlock, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious, moveBlock, isDescendant } from './blockOps';
import { createTable, insertTableRow } from './table';
import { parseMarkdownToItems, insertBlocksAfter } from './importExport';
import { getCursorOffset, setCursor } from './dom';
import { shared, clearDropIndicators, INDENT_PX, activateBlock, getVisualDepth, startBlockDrag, continuationContent } from './editorState';

export function BlockItem({ node }: { node: FlatBlock }) {
  const isActive = activeBlockId.value === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const hasKids = hasChildren(node.id);
  const isHr = node.content === '---';

  // Edit mode: show markdown source.
  const md = blockToMarkdown(node);

  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const activation = shared.pendingActivation?.blockId === node.id ? shared.pendingActivation : null;
    shared.pendingActivation = null;
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
    if (!shared.dragBlockId || shared.dragBlockId === node.id) return;
    if (isDescendant(node.id, shared.dragBlockId)) return;

    const dragBlock = blockData.value[shared.dragBlockId];
    if (!dragBlock) return;

    const dragKind = blockKind(dragBlock);
    const targetKind = blockKind(node);

    const canSibling = targetKind !== 'heading' || dragKind === 'heading';
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
      if (canNest && xOffset > nestThreshold) {
        el.classList.add('drop-nested');
      } else if (canSibling) {
        el.classList.add('drop-after');
      } else if (canNest) {
        el.classList.add('drop-nested');
      }
    }
  }

  function handleDragLeave(e: DragEvent) {
    const el = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      clearDropIndicators();
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const position = el.classList.contains('drop-before') ? 'before'
      : el.classList.contains('drop-nested') ? 'nested'
      : 'after';
    clearDropIndicators();

    if (shared.dragBlockId && shared.dragBlockId !== node.id) {
      beginUndo('move block');
      moveBlock(shared.dragBlockId, node.id, position);
      commitUndo();
    }
    shared.dragBlockId = null;
  }

  function handleDragEnd() {
    clearDropIndicators();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    shared.dragBlockId = null;
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
