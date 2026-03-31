import { useRef, useLayoutEffect, useState } from 'preact/hooks';
import { Content } from './renderContent';
import type { FlatBlock } from './db';
import {
  activeBlockId, blockData,
  saveBlock, deleteBlock,
} from './db';
import { beginUndo, commitUndo } from './undo';
import { parseHeading, parseAnnotations, parseTodoStatus } from './parse';
import { moveBlock, createChildBlock } from './blockOps';
import { setCursor } from './dom';
import { shared, activateBlock } from './editorState';

// --- Kanban Card ---

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
    const activation = shared.pendingActivation?.blockId === blockId ? shared.pendingActivation : null;
    shared.pendingActivation = null;
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
        shared.dragBlockId = blockId;
        ev.dataTransfer!.effectAllowed = 'move';
        ev.dataTransfer!.setData('text/plain', blockId);
      }}
      onDragEnd={() => { shared.dragBlockId = null; }}
      onDragOver={(e: Event) => {
        const ev = e as DragEvent;
        if (!shared.dragBlockId || shared.dragBlockId === blockId) return;
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
        if (shared.dragBlockId && shared.dragBlockId !== blockId) {
          beginUndo('move card');
          moveBlock(shared.dragBlockId, blockId, position as 'before' | 'after');
          commitUndo();
        }
        shared.dragBlockId = null;
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

// --- Column Header ---

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
        shared.dragBlockId = colId;
        shared.dragIsColumn = true;
        (e as DragEvent).dataTransfer!.effectAllowed = 'move';
      }}
      onDragEnd={() => { shared.dragBlockId = null; shared.dragIsColumn = false; }}
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

// --- Board ---

export function KanbanBoard({ node }: { node: FlatBlock }) {
  // Read children live from blockData so the board re-renders on changes
  const columns = Object.values(blockData.value)
    .filter(b => b.pageId === node.pageId && b.parent === node.id
      && b.type === 'paragraph' && parseHeading(b.content).level)
    .sort((a, b) => a.order - b.order);

  function handleColumnDragOver(e: DragEvent, columnId: string) {
    if (!shared.dragBlockId) return;
    e.preventDefault();
    if (shared.dragIsColumn && shared.dragBlockId !== columnId) {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const half = (e.clientX - rect.left) / rect.width;
      el.classList.remove('drop-before', 'drop-after', 'drop-over');
      el.classList.add(half < 0.5 ? 'drop-before' : 'drop-after');
    }
  }

  function handleColumnDragEnter(e: DragEvent) {
    if (!shared.dragBlockId) return;
    if (!shared.dragIsColumn) {
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
    if (shared.dragIsColumn) {
      const position = el.classList.contains('drop-before') ? 'before' : 'after';
      el.classList.remove('drop-before', 'drop-after');
      if (shared.dragBlockId && shared.dragBlockId !== columnId) {
        beginUndo('reorder column');
        moveBlock(shared.dragBlockId, columnId, position as 'before' | 'after');
        commitUndo();
      }
    } else {
      el.classList.remove('drop-over');
      if (shared.dragBlockId && shared.dragBlockId !== columnId) {
        beginUndo('move card');
        moveBlock(shared.dragBlockId, columnId, 'nested');
        commitUndo();
      }
    }
    shared.dragBlockId = null;
    shared.dragIsColumn = false;
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
