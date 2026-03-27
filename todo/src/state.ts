// ============================================================================
// Lattice Todo — Reactive State
//
// Signals for all entities, computed view queries, and actions.
// ============================================================================

import { signal, computed, batch } from '@preact/signals';
import type { Task, Project, Area, Heading, ChecklistItem, Tag, View, ItemStatus } from './types';
import { todayDate } from './types';
import { AppStore } from './db';

// --- Store ---

export const db = new AppStore();

// --- Signals: raw entity maps ---

export const tasks     = signal<Map<string, Task>>(new Map());
export const projects  = signal<Map<string, Project>>(new Map());
export const areas     = signal<Map<string, Area>>(new Map());
export const headings  = signal<Map<string, Heading>>(new Map());
export const checklist = signal<Map<string, ChecklistItem>>(new Map());
export const tags      = signal<Map<string, Tag>>(new Map());

// --- Navigation ---

export const activeView = signal<View>({ type: 'inbox' });
export const editingId  = signal<string | null>(null);

// --- Refresh helper ---

function refresh() {
  batch(() => {
    tasks.value     = db.tasks.getAll();
    projects.value  = db.projects.getAll();
    areas.value     = db.areas.getAll();
    headings.value  = db.headings.getAll();
    checklist.value = db.checklist.getAll();
    tags.value      = db.tags.getAll();
  });
}

// --- Sorted lists ---

export const sortedTasks = computed(() => {
  const list = [...tasks.value.values()];
  list.sort((a, b) => a.order - b.order);
  return list;
});

export const sortedProjects = computed(() => {
  const list = [...projects.value.values()];
  list.sort((a, b) => a.order - b.order);
  return list;
});

export const sortedAreas = computed(() => {
  const list = [...areas.value.values()];
  list.sort((a, b) => a.order - b.order);
  return list;
});

// --- View queries (Things 3 smart lists) ---

export const inboxTasks = computed(() =>
  sortedTasks.value.filter(t =>
    t.status === 'open' &&
    t.projectId === null &&
    t.areaId === null &&
    t.startDate === null &&
    !t.deferred
  )
);

export const todayTasks = computed(() => {
  const today = todayDate();
  return sortedTasks.value.filter(t =>
    t.status === 'open' &&
    t.startDate !== null &&
    t.startDate <= today &&
    !t.deferred
  );
});

export const upcomingTasks = computed(() => {
  const today = todayDate();
  const list = sortedTasks.value.filter(t =>
    t.status === 'open' &&
    t.startDate !== null &&
    t.startDate > today &&
    !t.deferred
  );
  list.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  return list;
});

export const anytimeTasks = computed(() => {
  const today = todayDate();
  return sortedTasks.value.filter(t =>
    t.status === 'open' &&
    !t.deferred &&
    (t.startDate === null || t.startDate <= today)
  );
});

export const somedayTasks = computed(() =>
  sortedTasks.value.filter(t =>
    t.status === 'open' && t.deferred
  )
);

export const logbookTasks = computed(() => {
  const list = sortedTasks.value.filter(t =>
    t.status === 'completed' || t.status === 'canceled'
  );
  list.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return list;
});

// --- Current view tasks ---

export const viewTasks = computed((): Task[] => {
  const v = activeView.value;
  switch (v.type) {
    case 'inbox':    return inboxTasks.value;
    case 'today':    return todayTasks.value;
    case 'upcoming': return upcomingTasks.value;
    case 'anytime':  return anytimeTasks.value;
    case 'someday':  return somedayTasks.value;
    case 'logbook':  return logbookTasks.value;
    case 'project':
      return sortedTasks.value.filter(t =>
        t.projectId === v.projectId && t.status === 'open'
      );
    case 'area':
      return sortedTasks.value.filter(t =>
        t.areaId === v.areaId && t.projectId === null && t.status === 'open'
      );
    case 'tag':
      return sortedTasks.value.filter(t =>
        t.status === 'open' && t.tags.includes(v.tagId)
      );
  }
});

// --- View counts (for sidebar badges) ---

export const inboxCount   = computed(() => inboxTasks.value.length);
export const todayCount   = computed(() => todayTasks.value.length);
export const upcomingCount = computed(() => upcomingTasks.value.length);
export const somedayCount = computed(() => somedayTasks.value.length);

// --- Helpers ---

function nextOrder(map: Map<string, { order: number }>): number {
  let max = 0;
  for (const item of map.values()) {
    if (item.order > max) max = item.order;
  }
  return max + 1;
}

/** Build a new Task with sensible defaults based on the current view. */
function taskDefaults(): Partial<Task> {
  const v = activeView.value;
  switch (v.type) {
    case 'today':
      return { startDate: todayDate() };
    case 'someday':
      return { deferred: true };
    case 'project':
      return { projectId: v.projectId };
    case 'area':
      return { areaId: v.areaId };
    default:
      return {};
  }
}

// --- Task actions ---

export async function addTask(title: string, overrides?: Partial<Omit<Task, 'id'>>) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const defaults = taskDefaults();
  const task: Task = {
    id: crypto.randomUUID(),
    title: trimmed,
    notes: '',
    startDate: defaults.startDate ?? null,
    deadline: null,
    status: 'open',
    deferred: defaults.deferred ?? false,
    tags: [],
    areaId: defaults.areaId ?? null,
    projectId: defaults.projectId ?? null,
    headingId: null,
    order: nextOrder(tasks.value),
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
  await db.tasks.save(task);
  refresh();
}

export async function updateTask(id: string, changes: Partial<Omit<Task, 'id'>>) {
  const task = tasks.value.get(id);
  if (!task) return;
  await db.tasks.save({ ...task, ...changes });
  refresh();
}

export async function toggleTask(id: string) {
  const task = tasks.value.get(id);
  if (!task) return;
  const newStatus: ItemStatus = task.status === 'open' ? 'completed' : 'open';
  await db.tasks.save({
    ...task,
    status: newStatus,
    completedAt: newStatus === 'completed' ? new Date().toISOString() : null,
  });
  refresh();
}

export async function removeTask(id: string) {
  // Also remove associated checklist items
  for (const ci of checklist.value.values()) {
    if (ci.taskId === id) await db.checklist.remove(ci.id);
  }
  await db.tasks.remove(id);
  refresh();
}

export async function moveTaskToInbox(id: string) {
  await updateTask(id, {
    projectId: null, areaId: null, headingId: null,
    startDate: null, deferred: false,
  });
}

export async function scheduleTask(id: string, startDate: string | null) {
  await updateTask(id, { startDate, deferred: false });
}

export async function deferTask(id: string) {
  await updateTask(id, { deferred: true, startDate: null });
}

export async function reorderTask(id: string, targetId: string) {
  if (id === targetId) return;
  const list = viewTasks.value;
  const fromIdx = list.findIndex(t => t.id === id);
  const toIdx = list.findIndex(t => t.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  const reordered = [...list];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i].order !== i) {
      await db.tasks.save({ ...reordered[i], order: i });
    }
  }
  refresh();
}

// --- Project actions ---

export async function addProject(title: string, areaId: string | null = null) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const project: Project = {
    id: crypto.randomUUID(),
    title: trimmed,
    notes: '',
    deadline: null,
    status: 'open',
    areaId,
    order: nextOrder(projects.value),
    createdAt: new Date().toISOString(),
  };
  await db.projects.save(project);
  refresh();
}

export async function updateProject(id: string, changes: Partial<Omit<Project, 'id'>>) {
  const project = projects.value.get(id);
  if (!project) return;
  await db.projects.save({ ...project, ...changes });
  refresh();
}

export async function removeProject(id: string) {
  // Move tasks in this project to inbox
  for (const t of tasks.value.values()) {
    if (t.projectId === id) {
      await db.tasks.save({ ...t, projectId: null, headingId: null });
    }
  }
  // Remove headings
  for (const h of headings.value.values()) {
    if (h.projectId === id) await db.headings.remove(h.id);
  }
  await db.projects.remove(id);
  refresh();
}

// --- Area actions ---

export async function addArea(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const area: Area = {
    id: crypto.randomUUID(),
    title: trimmed,
    order: nextOrder(areas.value),
  };
  await db.areas.save(area);
  refresh();
}

export async function updateArea(id: string, changes: Partial<Omit<Area, 'id'>>) {
  const area = areas.value.get(id);
  if (!area) return;
  await db.areas.save({ ...area, ...changes });
  refresh();
}

export async function removeArea(id: string) {
  // Unassign tasks and projects from this area
  for (const t of tasks.value.values()) {
    if (t.areaId === id) await db.tasks.save({ ...t, areaId: null });
  }
  for (const p of projects.value.values()) {
    if (p.areaId === id) await db.projects.save({ ...p, areaId: null });
  }
  await db.areas.remove(id);
  refresh();
}

// --- Heading actions ---

export async function addHeading(title: string, projectId: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const heading: Heading = {
    id: crypto.randomUUID(),
    title: trimmed,
    projectId,
    order: nextOrder(headings.value),
  };
  await db.headings.save(heading);
  refresh();
}

export async function removeHeading(id: string) {
  // Unassign tasks from this heading
  for (const t of tasks.value.values()) {
    if (t.headingId === id) await db.tasks.save({ ...t, headingId: null });
  }
  await db.headings.remove(id);
  refresh();
}

// --- Checklist actions ---

export async function addChecklistItem(taskId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const item: ChecklistItem = {
    id: crypto.randomUUID(),
    title: trimmed,
    done: false,
    taskId,
    order: nextOrder(checklist.value),
  };
  await db.checklist.save(item);
  refresh();
}

export async function toggleChecklistItem(id: string) {
  const item = checklist.value.get(id);
  if (!item) return;
  await db.checklist.save({ ...item, done: !item.done });
  refresh();
}

export async function removeChecklistItem(id: string) {
  await db.checklist.remove(id);
  refresh();
}

export async function reorderChecklistItem(id: string, targetId: string) {
  if (id === targetId) return;
  const item = checklist.value.get(id);
  if (!item) return;
  const list = [...checklist.value.values()]
    .filter(c => c.taskId === item.taskId)
    .sort((a, b) => a.order - b.order);
  const fromIdx = list.findIndex(c => c.id === id);
  const toIdx = list.findIndex(c => c.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  const reordered = [...list];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i].order !== i) {
      await db.checklist.save({ ...reordered[i], order: i });
    }
  }
  refresh();
}

// --- Tag actions ---

export async function addTag(title: string, parentId: string | null = null) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const tag: Tag = {
    id: crypto.randomUUID(),
    title: trimmed,
    parentId,
    order: nextOrder(tags.value),
  };
  await db.tags.save(tag);
  refresh();
}

export async function removeTag(id: string) {
  // Remove tag from all tasks
  for (const t of tasks.value.values()) {
    if (t.tags.includes(id)) {
      await db.tasks.save({ ...t, tags: t.tags.filter(tid => tid !== id) });
    }
  }
  // Remove child tags
  for (const t of tags.value.values()) {
    if (t.parentId === id) await db.tags.remove(t.id);
  }
  await db.tags.remove(id);
  refresh();
}

// --- Init ---

export function initState() {
  refresh();
}
