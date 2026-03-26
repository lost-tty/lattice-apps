// ============================================================================
// Lattice Todo — UI
// ============================================================================

import { useRef, useEffect } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import type { Filter } from './types';
import {
  filteredTodos, filter, editingId, activeCount, completedCount,
  addTodo, toggleTodo, updateText, removeTodo, clearCompleted, reorder,
} from './state';

// --- Input ---

function TodoInput() {
  const inputRef = useRef<HTMLInputElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const val = inputRef.current?.value;
      if (val) {
        addTodo(val);
        inputRef.current!.value = '';
      }
    }
  };

  return (
    <div class="todo-input-wrap">
      <input
        ref={inputRef}
        class="todo-input"
        type="text"
        placeholder="What needs to be done?"
        onKeyDown={onKeyDown}
        autofocus
      />
    </div>
  );
}

// --- Single item ---

function TodoItem({ id, text, done }: { id: string; text: string; done: boolean }) {
  const editing = useComputed(() => editingId.value === id);
  const editRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (editing.value) editRef.current?.focus();
  }, [editing.value]);

  const commitEdit = () => {
    const val = editRef.current?.value ?? '';
    updateText(id, val);
    editingId.value = null;
  };

  const onEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') editingId.value = null;
  };

  // Drag handlers
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', id);
    dragRef.current!.classList.add('dragging');
  };
  const onDragEnd = () => {
    dragRef.current!.classList.remove('dragging');
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const fromId = e.dataTransfer!.getData('text/plain');
    if (fromId && fromId !== id) reorder(fromId, id);
  };

  if (editing.value) {
    return (
      <li class="todo-item editing" ref={dragRef}>
        <input
          ref={editRef}
          class="todo-edit"
          type="text"
          value={text}
          onKeyDown={onEditKeyDown}
          onBlur={commitEdit}
        />
      </li>
    );
  }

  return (
    <li
      class={`todo-item ${done ? 'done' : ''}`}
      ref={dragRef}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button class="todo-check" onClick={() => toggleTodo(id)} aria-label="Toggle">
        {done ? '\u2611' : '\u2610'}
      </button>
      <span class="todo-text" onDblClick={() => { editingId.value = id; }}>
        {text}
      </span>
      <button class="todo-remove" onClick={() => removeTodo(id)} aria-label="Delete">
        &times;
      </button>
    </li>
  );
}

// --- List ---

function TodoList() {
  const items = filteredTodos.value;

  if (items.length === 0) {
    const f = filter.value;
    const msg = f === 'active' ? 'No active tasks'
      : f === 'completed' ? 'No completed tasks'
      : 'Nothing to do yet';
    return <div class="todo-empty">{msg}</div>;
  }

  return (
    <ul class="todo-list">
      {items.map(t => (
        <TodoItem key={t.id} id={t.id} text={t.text} done={t.done} />
      ))}
    </ul>
  );
}

// --- Footer ---

function FilterButton({ value, label }: { value: Filter; label: string }) {
  const active = useComputed(() => filter.value === value);
  return (
    <button
      class={`filter-btn ${active.value ? 'active' : ''}`}
      onClick={() => { filter.value = value; }}
    >
      {label}
    </button>
  );
}

function TodoFooter() {
  const active = activeCount.value;
  const completed = completedCount.value;
  const total = active + completed;

  if (total === 0) return null;

  return (
    <div class="todo-footer">
      <span class="todo-count">
        {active} {active === 1 ? 'item' : 'items'} left
      </span>
      <div class="filter-group">
        <FilterButton value="all" label="All" />
        <FilterButton value="active" label="Active" />
        <FilterButton value="completed" label="Completed" />
      </div>
      {completed > 0 && (
        <button class="clear-btn" onClick={clearCompleted}>
          Clear completed
        </button>
      )}
    </div>
  );
}

// --- App ---

export function App() {
  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Focus input on '/' when not editing
      if (e.key === '/' && !editingId.value && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        (document.querySelector('.todo-input') as HTMLInputElement)?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div class="todo-app">
      <h1 class="todo-title">Todos</h1>
      <div class="todo-panel">
        <TodoInput />
        <TodoList />
        <TodoFooter />
      </div>
      <div class="todo-hint">
        Double-click to edit &middot; Drag to reorder &middot; Press <kbd>/</kbd> to focus input
      </div>
    </div>
  );
}
