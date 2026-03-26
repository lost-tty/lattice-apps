// ============================================================================
// Lattice Todo — Reactive State
// ============================================================================

import { signal, computed, batch } from '@preact/signals';
import type { Todo, Filter } from './types';
import { TodoStore } from './db';

// --- Store ---

export const db = new TodoStore();

// --- Signals ---

export const todos = signal<Map<string, Todo>>(new Map());
export const filter = signal<Filter>('all');
export const editingId = signal<string | null>(null);

// --- Derived ---

export const sortedTodos = computed(() => {
  const list = [...todos.value.values()];
  list.sort((a, b) => a.order - b.order);
  return list;
});

export const filteredTodos = computed(() => {
  const list = sortedTodos.value;
  const f = filter.value;
  if (f === 'active') return list.filter(t => !t.done);
  if (f === 'completed') return list.filter(t => t.done);
  return list;
});

export const activeCount = computed(() =>
  [...todos.value.values()].filter(t => !t.done).length
);

export const completedCount = computed(() =>
  [...todos.value.values()].filter(t => t.done).length
);

// --- Actions ---

function nextOrder(): number {
  let max = 0;
  for (const t of todos.value.values()) {
    if (t.order > max) max = t.order;
  }
  return max + 1;
}

export async function addTodo(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const todo: Todo = {
    id: crypto.randomUUID(),
    text: trimmed,
    done: false,
    order: nextOrder(),
    createdAt: new Date().toISOString(),
  };
  await db.save(todo);
  todos.value = db.getAll();
}

export async function toggleTodo(id: string) {
  const todo = todos.value.get(id);
  if (!todo) return;
  await db.save({ ...todo, done: !todo.done });
  todos.value = db.getAll();
}

export async function updateText(id: string, text: string) {
  const todo = todos.value.get(id);
  if (!todo) return;
  const trimmed = text.trim();
  if (!trimmed) {
    await removeTodo(id);
    return;
  }
  if (trimmed === todo.text) return;
  await db.save({ ...todo, text: trimmed });
  todos.value = db.getAll();
}

export async function removeTodo(id: string) {
  await db.remove(id);
  todos.value = db.getAll();
}

export async function clearCompleted() {
  const done = [...todos.value.values()].filter(t => t.done);
  for (const t of done) {
    await db.remove(t.id);
  }
  todos.value = db.getAll();
}

export async function reorder(id: string, targetId: string) {
  if (id === targetId) return;
  const list = sortedTodos.value;
  const fromIdx = list.findIndex(t => t.id === id);
  const toIdx = list.findIndex(t => t.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  // Remove and reinsert
  const moved = list.splice(fromIdx, 1)[0];
  list.splice(toIdx, 0, moved);

  // Reassign order values
  for (let i = 0; i < list.length; i++) {
    if (list[i].order !== i) {
      list[i] = { ...list[i], order: i };
      await db.save(list[i]);
    }
  }
  todos.value = db.getAll();
}

export function initState(items: Map<string, Todo>) {
  batch(() => {
    todos.value = items;
    filter.value = 'all';
    editingId.value = null;
  });
}
