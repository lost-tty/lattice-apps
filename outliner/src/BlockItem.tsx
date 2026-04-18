import { useRef, useLayoutEffect, useState } from 'preact/hooks';
import { Content } from './renderContent';
import { ActionMenu, SwipeRow, useLongPress, type ActionItem, type ActionMenuState } from '@ui';
import { IconTrash, IconArrowRight, IconChevronRight } from './Icons';
import type { FlatBlock } from './db';
import type { Block } from './types';
import {
  activeBlockId, blockData, pageData,
  saveBlock, deleteBlock, buildTree, flattenTree, hasChildren, toggleCollapse,
  blockKind, canAcceptChildren, isCollapsed, blockToMarkdown,
  setBlockMarkdown, blockText,
  navigateTo, getOrCreatePage,
} from './db';
import { beginUndo, commitUndo, undo, redo } from './undo';
import { parseAnnotations, cycleTodoStatus, parseTableCells, todaySlug } from './parse';
import { createBlockAfter, createChildBlock, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious, moveBlock, isDescendant, carryForward, hasIncompleteTodos } from './blockOps';
import { createTable, insertTableRow } from './table';
import { parseMarkdownToItems, insertBlocksAfter } from './importExport';
import { getCursorOffset, setCursor } from './dom';
import { shared, clearDropIndicators, INDENT_PX, activateBlock, getVisualDepth, startBlockDrag, continuationContent, normalizeEditorInput } from './editorState';

export function BlockItem({ node }: { node: FlatBlock }) {
  const isActive = activeBlockId.value === node.id;
  const ref = useRef<HTMLDivElement>(null);
  const hasKids = hasChildren(node.id);
  const isHr = node.kind === 'hrule';

  // Edit mode: show markdown source.
  const md = blockToMarkdown(node);
  // For cursor-positioning: how many chars of `md` are the prefix (e.g. "- ").
  const editorPrefixLen = md.length - blockText(node).length;

  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    const el = ref.current;
    const activation = shared.pendingActivation?.blockId === node.id ? shared.pendingActivation : null;
    shared.pendingActivation = null;
    el.textContent = md;
    el.focus();
    setCursor(el, activation?.cursor ?? 'end', editorPrefixLen);
  }, [isActive]);

  /** Parse editor text back to block fields and save. On blur, if the
   *  block never held any text (it was empty before the edit *and* it's
   *  still empty after — the user typed a prefix like `- ` / `# ` or
   *  nothing at all and clicked away), we drop the block entirely via
   *  removeBlock. This covers blocks that were auto-created by the
   *  "click into blank area" handler but never received content.
   *  Intentional content clears (bullet `foo` → bullet empty) still
   *  commit because current had text. Enter / Tab / Arrow handlers pass
   *  `onBlur=false` to commit unconditionally. */
  function saveFromEditor(onBlur = false) {
    const md = normalizeEditorInput(ref.current?.textContent || '');
    const current = blockData.value[node.id];
    if (!current) return;
    const next = setBlockMarkdown(current, md);
    if (onBlur && blockText(current) === '' && blockText(next) === '') {
      removeBlock(current.id);
      return;
    }
    if (blockToMarkdown(next) !== blockToMarkdown(current)) {
      saveBlock(next);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const el = ref.current!;
    // Editor's textContent is the raw markdown the user sees, normalized
    // via normalizeEditorInput (undoes contentEditable's NBSP substitution
    // so a just-typed `- ` / `# ` parses correctly). Downstream parse
    // boundaries handle alt markers (`*`, `+`) on their own.
    const content = normalizeEditorInput(el.textContent || '');
    const prefixLen = 0;

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

      // Derive the post-split current block by applying `before` through
      // the typed parser, so `updated.kind` is fresh (the user may have
      // *just* typed `- ` into a paragraph and hit Enter — `node.kind` is
      // still `paragraph`, but `updated.kind` is `bullet`).
      const updated = setBlockMarkdown(node, before);

      if (before === '') {
        beginUndo('split block');
        // Current becomes an empty block of the same kind so the outline
        // shape doesn't change.
        saveBlock(setBlockMarkdown(node, node.kind === 'bullet' ? '- ' : ''));
        const newId = createBlockAfter(node.id, content);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      beginUndo('split block');
      saveBlock(updated);

      if (updated.kind === 'heading') {
        // Enter under a heading creates a child paragraph (not a bullet) —
        // a heading isn't necessarily a list container; if the user wants
        // bullets under it they can type `- `.
        const newId = createChildBlock(node.id, after);
        commitUndo();
        activateBlock(newId, 'start');
        return;
      }

      // Mid-split carries `after` (bare) into a sibling of the same kind;
      // end-split uses `continuationContent(updated)` — already includes any
      // `- ` / `- [ ] ` / `- TODO ` prefix, so we must not add another one.
      const newContent = after !== ''
        ? (updated.kind === 'bullet' ? '- ' + after : after)
        : continuationContent(updated);
      const newId = createBlockAfter(node.id, newContent);
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
      saveFromEditor(true);
      activeBlockId.value = null;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\n')) return;

    e.preventDefault();

    const el = ref.current!;
    const content = normalizeEditorInput(el.textContent ?? '');
    const contentOffset = Math.max(0, getCursorOffset(el));
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
    saveBlock(setBlockMarkdown(node, merged[0].content));

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
      if (current) {
        const cycled = cycleTodoStatus(blockToMarkdown(current));
        saveBlock(setBlockMarkdown(current, cycled));
      }
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

  // --- Parsed block metadata ---

  const collapsed = hasKids && isCollapsed(node.id);
  const level = node.kind === 'heading' ? node.level : null;
  const status = node.kind === 'bullet' ? node.todo?.status ?? null : null;
  const headingText = blockText(node);

  // --- Block actions (used by context menu, long-press, and swipe) ---

  const [menu, setMenu] = useState<ActionMenuState | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  /** Single source of truth for per-block actions. Each surface
   *  (right-click menu, long-press menu, swipe-left buttons) renders the
   *  same list, with the same conditional inclusion of carry-forward. */
  function buildActions(): ActionItem[] {
    const items: ActionItem[] = [];
    if (hasIncompleteTodos(node.id)) {
      const today = todaySlug();
      const todayPage = Object.values(pageData.value).find(p => p.title === today);
      const isOnToday = todayPage && node.pageId === todayPage.id;
      if (!isOnToday) {
        items.push({
          label: 'Carry forward to today',
          icon: <IconArrowRight />,
          onAction: () => {
            const targetPageId = getOrCreatePage(today);
            carryForward(node.id, targetPageId);
          },
        });
      }
    }
    items.push({
      label: 'Delete',
      icon: <IconTrash />,
      danger: true,
      onAction: () => {
        beginUndo('delete block');
        deleteBlock(node.id);
        commitUndo();
        activeBlockId.value = null;
      },
    });
    return items;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const items = buildActions();
    if (items.length > 0) setMenu({ x: e.clientX, y: e.clientY, items });
  }

  // Long-press anywhere on a non-editing block opens the same menu.
  // (When the block is in edit mode iOS owns long-press for text selection,
  // and we render without this hook attached.) Targets the whole block so
  // users don't have to hit the small left gutter.
  useLongPress(blockRef, ({ clientX, clientY }) => {
    const items = buildActions();
    if (items.length > 0) setMenu({ x: clientX, y: clientY, items });
  });

  // --- Render ---
  const viewText = level ? parseAnnotations(headingText).text : headingText;
  const contentClass = [
    'block-content',
    isActive ? 'editing' : '',
    !isActive && status === 'done' ? 'is-done' : '',
    !isActive && status === 'cancelled' ? 'is-cancelled' : '',
    level ? `heading-${level}` : '',
  ].filter(Boolean).join(' ');

  const visualDepth = getVisualDepth(node);

  const depthStyle = isHr && !isActive ? '--depth: 0' : `--depth: ${visualDepth}`;

  const gutterEl = (
    <span
      class={`gutter${hasKids ? ' has-children' : ''}${isCollapsed(node.id) ? ' collapsed' : ''}`}
      draggable
      onClick={(e: Event) => { if (hasKids) { e.stopPropagation(); toggleCollapse(node.id); } }}
      onDragStart={(e: Event) => handleDragStart(e as DragEvent)}
    >{hasKids && <IconChevronRight />}</span>
  );

  const blockInner = (
    <div
      ref={blockRef}
      class="block"
      style={depthStyle}
      onContextMenu={(e: Event) => handleContextMenu(e as MouseEvent)}
      onDragOver={(e: Event) => handleDragOver(e as DragEvent)}
      onDragLeave={(e: Event) => handleDragLeave(e as DragEvent)}
      onDrop={(e: Event) => handleDrop(e as DragEvent)}
      onDragEnd={handleDragEnd}
    >
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
          {node.kind === 'bullet' && <span class="bullet-marker" />}
          {status && <span class={`todo-marker ${status}`} />}
          <span><Content text={viewText} fallback={<br />} /></span>
          {collapsed && (
            <span class="collapsed-ellipsis" onClick={(e: Event) => { e.stopPropagation(); toggleCollapse(node.id); }}>…</span>
          )}
        </div>
      )}
    </div>
  );

  // Gutter lives outside SwipeRow so its negative `left` offset at
  // depth-0 isn't clipped by `.swipe-row { overflow: hidden }`. The
  // `.block-row` wrapper is the shared positioned ancestor for absolute
  // gutter positioning and carries `--depth` for both children.
  // ActionMenu is rendered as a sibling of SwipeRow (not inside it)
  // because SwipeRow's transform creates a containing block that
  // traps `position: fixed` and the menu would otherwise be clipped.
  return (
    <>
      <div class="block-row" style={depthStyle}>
        {gutterEl}
        {isActive ? blockInner : <SwipeRow actions={buildActions()}>{blockInner}</SwipeRow>}
      </div>
      <ActionMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}
