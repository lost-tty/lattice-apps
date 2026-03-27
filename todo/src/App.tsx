// ============================================================================
// Lattice Todo — UI
//
// Sidebar + main content. View-specific rendering for each smart list.
// ============================================================================

import { useRef, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { useComputed, useSignal } from '@preact/signals';
import type { View, Task, ChecklistItem } from './types';
import { todayDate, tomorrowDate, nextMonday, formatDate, formatTimestamp, formatTodayHeader } from './types';
import {
  viewTasks, activeView, editingId, projects, areas, checklist,
  addTask, toggleTask, updateTask, removeTask, reorderTask,
  scheduleTask, deferTask, moveTaskToInbox,
  addChecklistItem, toggleChecklistItem, removeChecklistItem, reorderChecklistItem,
} from './state';
import { Sidebar } from './Sidebar';

/** Which task's detail panel is expanded (null = none). */
const expandedId = signal<string | null>(null);

// ============================================================================
// View metadata
// ============================================================================

function useViewTitle(): string {
  const v = activeView.value;
  switch (v.type) {
    case 'inbox':    return 'Inbox';
    case 'today':    return 'Today';
    case 'upcoming': return 'Upcoming';
    case 'anytime':  return 'Anytime';
    case 'someday':  return 'Someday';
    case 'logbook':  return 'Logbook';
    case 'project':  return projects.value.get(v.projectId)?.title ?? 'Project';
    case 'area':     return areas.value.get(v.areaId)?.title ?? 'Area';
    case 'tag':      return 'Tag';
  }
}

function useViewSubtitle(): string | null {
  const v = activeView.value;
  if (v.type === 'today') return formatTodayHeader();
  return null;
}

function canAddInView(v: View): boolean {
  return v.type !== 'logbook' && v.type !== 'upcoming';
}

function emptyMessage(v: View): string {
  switch (v.type) {
    case 'inbox':    return 'Inbox is empty';
    case 'today':    return 'Nothing scheduled for today';
    case 'upcoming': return 'Nothing upcoming';
    case 'anytime':  return 'No open tasks';
    case 'someday':  return 'No someday tasks';
    case 'logbook':  return 'No completed tasks yet';
    case 'project':  return 'No tasks in this project';
    case 'area':     return 'No tasks in this area';
    case 'tag':      return 'No tasks with this tag';
  }
}

// ============================================================================
// Date scheduling popover
// ============================================================================

function DatePopover({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (date: string | null) => {
    scheduleTask(taskId, date);
    onClose();
  };
  const defer = () => {
    deferTask(taskId);
    onClose();
  };
  const toInbox = () => {
    moveTaskToInbox(taskId);
    onClose();
  };

  return (
    <div class="date-popover" ref={ref}>
      <div class="date-popover-title">Schedule</div>
      <button class="date-option" onClick={() => pick(todayDate())}>
        <span class="date-option-label">Today</span>
        <span class="date-option-hint">{formatDate(todayDate())}</span>
      </button>
      <button class="date-option" onClick={() => pick(tomorrowDate())}>
        <span class="date-option-label">Tomorrow</span>
        <span class="date-option-hint">{formatDate(tomorrowDate())}</span>
      </button>
      <button class="date-option" onClick={() => pick(nextMonday())}>
        <span class="date-option-label">Next Monday</span>
        <span class="date-option-hint">{formatDate(nextMonday())}</span>
      </button>
      <div class="date-popover-divider" />
      <button class="date-option" onClick={defer}>
        <span class="date-option-label">Someday</span>
      </button>
      <button class="date-option" onClick={toInbox}>
        <span class="date-option-label">No date</span>
      </button>
      <div class="date-popover-divider" />
      <div class="date-custom-wrap">
        <input
          class="date-custom-input"
          type="date"
          onChange={(e) => {
            const val = (e.target as HTMLInputElement).value;
            if (val) pick(val);
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Deadline popover
// ============================================================================

function DeadlinePopover({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (date: string | null) => {
    updateTask(taskId, { deadline: date });
    onClose();
  };

  return (
    <div class="date-popover" ref={ref}>
      <div class="date-popover-title">Deadline</div>
      <button class="date-option" onClick={() => pick(todayDate())}>
        <span class="date-option-label">Today</span>
      </button>
      <button class="date-option" onClick={() => pick(tomorrowDate())}>
        <span class="date-option-label">Tomorrow</span>
      </button>
      <button class="date-option" onClick={() => pick(nextMonday())}>
        <span class="date-option-label">Next Monday</span>
      </button>
      <div class="date-popover-divider" />
      <button class="date-option" onClick={() => pick(null)}>
        <span class="date-option-label">No deadline</span>
      </button>
      <div class="date-popover-divider" />
      <div class="date-custom-wrap">
        <input
          class="date-custom-input"
          type="date"
          onChange={(e) => {
            const val = (e.target as HTMLInputElement).value;
            if (val) pick(val);
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Task input
// ============================================================================

/** Parse a markdown checkbox line into task fields.
 *  Supports:  - [ ] dd.mm.yyyy title   - [x] title   - title   plain title
 *  Date formats: dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd */
function parseLine(raw: string): { title: string; done: boolean; startDate: string | null } | null {
  let line = raw.trim();
  if (!line) return null;

  // Strip leading "- " or "* "
  line = line.replace(/^[-*]\s*/, '');

  // Checkbox: [ ] or [x] or [X]
  let done = false;
  const cbMatch = line.match(/^\[([xX ])\]\s*/);
  if (cbMatch) {
    done = cbMatch[1].toLowerCase() === 'x';
    line = line.slice(cbMatch[0].length);
  }

  // Leading date: dd.mm.yyyy, dd/mm/yyyy, or yyyy-mm-dd
  let startDate: string | null = null;
  const dmyMatch = line.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})\s+/);
  const isoMatch = line.match(/^(\d{4})-(\d{2})-(\d{2})\s+/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    startDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    line = line.slice(dmyMatch[0].length);
  } else if (isoMatch) {
    startDate = isoMatch[0].trim();
    line = line.slice(isoMatch[0].length);
  }

  const title = line.trim();
  if (!title) return null;
  return { title, done, startDate };
}

function TaskInput() {
  const inputRef = useRef<HTMLInputElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const val = inputRef.current?.value;
      if (val) {
        addTask(val);
        inputRef.current!.value = '';
      }
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const lines = text.split(/\r?\n/);
    // Only intercept multi-line pastes or lines with markdown syntax
    if (lines.length <= 1 && !text.match(/^[-*]\s*\[/)) return;

    e.preventDefault();
    let count = 0;
    for (const raw of lines) {
      const parsed = parseLine(raw);
      if (!parsed) continue;
      const overrides: Record<string, unknown> = {};
      if (parsed.startDate) overrides.startDate = parsed.startDate;
      if (parsed.done) {
        overrides.status = 'completed';
        overrides.completedAt = new Date().toISOString();
      }
      addTask(parsed.title, overrides);
      count++;
    }
    if (count > 0 && inputRef.current) inputRef.current.value = '';
  };

  if (!canAddInView(activeView.value)) return null;

  return (
    <div class="task-input-wrap">
      <span class="task-input-icon">+</span>
      <input
        ref={inputRef}
        class="task-input"
        type="text"
        placeholder="New task…"
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        autofocus
      />
    </div>
  );
}

// ============================================================================
// Task detail panel (notes + checklist)
// ============================================================================

function TaskNotes({ task }: { task: Task }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const commitNotes = () => {
    const val = ref.current?.value ?? '';
    if (val !== task.notes) updateTask(task.id, { notes: val });
  };
  return (
    <textarea
      ref={ref}
      class="task-notes"
      placeholder="Notes (markdown)…"
      value={task.notes}
      onBlur={commitNotes}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') ref.current?.blur(); }}
      rows={Math.max(2, (task.notes.match(/\n/g)?.length ?? 0) + 2)}
    />
  );
}

function ChecklistView({ taskId }: { taskId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const items = [...checklist.value.values()]
    .filter(c => c.taskId === taskId)
    .sort((a, b) => a.order - b.order);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const val = inputRef.current?.value;
      if (val) { addChecklistItem(taskId, val); inputRef.current!.value = ''; }
    }
  };

  return (
    <div class="checklist">
      {items.map(ci => (
        <div
          key={ci.id}
          class={`checklist-item ${ci.done ? 'done' : ''}`}
          draggable
          onDragStart={(e: DragEvent) => {
            e.stopPropagation();
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/x-checklist', ci.id);
            (e.currentTarget as HTMLElement).classList.add('dragging');
          }}
          onDragEnd={(e: DragEvent) => {
            (e.currentTarget as HTMLElement).classList.remove('dragging');
          }}
          onDragOver={(e: DragEvent) => {
            if (!e.dataTransfer!.types.includes('text/x-checklist')) return;
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
          }}
          onDrop={(e: DragEvent) => {
            const fromId = e.dataTransfer!.getData('text/x-checklist');
            if (fromId && fromId !== ci.id) reorderChecklistItem(fromId, ci.id);
          }}
        >
          <button class="checklist-check" onClick={() => toggleChecklistItem(ci.id)}>
            <span class={`check-square ${ci.done ? 'checked' : ''}`} />
          </button>
          <span class="checklist-title">{ci.title}</span>
          <button class="checklist-remove" onClick={() => removeChecklistItem(ci.id)}>&times;</button>
        </div>
      ))}
      <div class="checklist-add">
        <span class="checklist-add-icon">+</span>
        <input
          ref={inputRef}
          class="checklist-add-input"
          type="text"
          placeholder="Add sub-task…"
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

function TaskDetail({ task }: { task: Task }) {
  return (
    <div class="task-detail">
      <TaskNotes task={task} />
      <ChecklistView taskId={task.id} />
    </div>
  );
}

// ============================================================================
// Task item
// ============================================================================

function TaskItem({ task, showDates = true, showCompleted = false }: {
  task: Task; showDates?: boolean; showCompleted?: boolean;
}) {
  const { id, title, status, startDate, deadline, completedAt, notes } = task;
  const done = status === 'completed' || status === 'canceled';
  const editing = useComputed(() => editingId.value === id);
  const expanded = useComputed(() => expandedId.value === id);
  const editRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLLIElement>(null);
  const showDatePicker = useSignal(false);
  const showDeadlinePicker = useSignal(false);

  // Count sub-tasks for this task
  const subCount = useComputed(() => {
    let total = 0, checked = 0;
    for (const ci of checklist.value.values()) {
      if (ci.taskId === id) { total++; if (ci.done) checked++; }
    }
    return { total, checked };
  });

  useEffect(() => {
    if (editing.value) editRef.current?.focus();
  }, [editing.value]);

  const commitEdit = () => {
    const val = editRef.current?.value?.trim() ?? '';
    if (val && val !== title) {
      updateTask(id, { title: val });
    } else if (!val) {
      removeTask(id);
    }
    editingId.value = null;
  };

  const onEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') editingId.value = null;
  };

  const toggleExpand = () => {
    expandedId.value = expandedId.value === id ? null : id;
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
    if (fromId && fromId !== id) reorderTask(fromId, id);
  };

  // Is deadline overdue?
  const overdue = deadline && deadline < todayDate() && !done;

  // Indicators for collapsed state
  const hasNotes = notes.length > 0;
  const { total: subTotal, checked: subChecked } = subCount.value;

  if (editing.value) {
    return (
      <li class="task-item editing" ref={dragRef}>
        <input
          ref={editRef}
          class="task-edit"
          type="text"
          value={title}
          onKeyDown={onEditKeyDown}
          onBlur={commitEdit}
        />
      </li>
    );
  }

  return (
    <li
      class={`task-item ${done ? 'done' : ''} ${expanded.value ? 'expanded' : ''}`}
      ref={dragRef}
      draggable={!done && !expanded.value}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div class="task-row">
        <button class="task-check" onClick={() => toggleTask(id)} aria-label="Toggle">
          <span class={`check-circle ${done ? 'checked' : ''}`} />
        </button>

        <div class="task-body" onClick={toggleExpand}>
          <span class="task-title" onDblClick={(e: MouseEvent) => { e.stopPropagation(); editingId.value = id; }}>
            {title}
          </span>

          {showDates && !done && (
            <div class="task-meta">
              {startDate && (
                <span class="task-date when" onClick={(e: MouseEvent) => { e.stopPropagation(); showDatePicker.value = !showDatePicker.value; }}>
                  {formatDate(startDate)}
                </span>
              )}
              {deadline && (
                <span class={`task-date due ${overdue ? 'overdue' : ''}`}
                  onClick={(e: MouseEvent) => { e.stopPropagation(); showDeadlinePicker.value = !showDeadlinePicker.value; }}>
                  Due {formatDate(deadline)}
                </span>
              )}
              {!expanded.value && hasNotes && (
                <span class="task-indicator notes-indicator" title="Has notes">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <path d="M3 3h10M3 7h10M3 11h6" />
                  </svg>
                </span>
              )}
              {!expanded.value && subTotal > 0 && (
                <span class={`task-indicator checklist-indicator ${subChecked === subTotal ? 'all-done' : ''}`}>
                  {subChecked}/{subTotal}
                </span>
              )}
              {!startDate && !deadline && !hasNotes && subTotal === 0 && (
                <button class="task-schedule-btn" onClick={(e: MouseEvent) => { e.stopPropagation(); showDatePicker.value = true; }}>
                  Schedule
                </button>
              )}
            </div>
          )}

          {showCompleted && completedAt && (
            <div class="task-meta">
              <span class="task-date completed">{formatTimestamp(completedAt)}</span>
            </div>
          )}
        </div>

        <div class="task-actions">
          {!done && (
            <button class="task-action-btn" onClick={() => { showDatePicker.value = true; }}
              aria-label="Schedule" title="Schedule">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M2 6h12M5 1v2M11 1v2" />
              </svg>
            </button>
          )}
          {!done && (
            <button class="task-action-btn" onClick={() => { showDeadlinePicker.value = true; }}
              aria-label="Deadline" title="Deadline">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M1 15l7-7m0 0V3m0 5h5" />
              </svg>
            </button>
          )}
          <button class="task-remove" onClick={() => removeTask(id)} aria-label="Delete">
            &times;
          </button>
        </div>
      </div>

      {expanded.value && <TaskDetail task={task} />}

      {showDatePicker.value && (
        <DatePopover taskId={id} onClose={() => { showDatePicker.value = false; }} />
      )}
      {showDeadlinePicker.value && (
        <DeadlinePopover taskId={id} onClose={() => { showDeadlinePicker.value = false; }} />
      )}
    </li>
  );
}

// ============================================================================
// Task list — flat
// ============================================================================

function TaskListFlat({ tasks, showDates, showCompleted }: {
  tasks: Task[]; showDates?: boolean; showCompleted?: boolean;
}) {
  if (tasks.length === 0) {
    return <div class="task-empty">{emptyMessage(activeView.value)}</div>;
  }
  return (
    <ul class="task-list">
      {tasks.map(t => (
        <TaskItem key={t.id} task={t} showDates={showDates} showCompleted={showCompleted} />
      ))}
    </ul>
  );
}

// ============================================================================
// Upcoming view — grouped by date
// ============================================================================

function UpcomingView({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <div class="task-empty">{emptyMessage(activeView.value)}</div>;
  }

  // Group by startDate
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.startDate ?? '';
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const sortedKeys = [...groups.keys()].sort();

  return (
    <div class="upcoming-groups">
      {sortedKeys.map(date => (
        <div key={date} class="upcoming-group">
          <div class="upcoming-date-header">{formatDate(date)}</div>
          <ul class="task-list">
            {groups.get(date)!.map(t => (
              <TaskItem key={t.id} task={t} showDates={false} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Logbook view — grouped by date
// ============================================================================

function LogbookView({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <div class="task-empty">{emptyMessage(activeView.value)}</div>;
  }

  // Group by completion date (day)
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.completedAt ? t.completedAt.slice(0, 10) : 'unknown';
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const sortedKeys = [...groups.keys()].sort().reverse();

  return (
    <div class="upcoming-groups">
      {sortedKeys.map(date => (
        <div key={date} class="upcoming-group">
          <div class="upcoming-date-header">{formatDate(date)}</div>
          <ul class="task-list">
            {groups.get(date)!.map(t => (
              <TaskItem key={t.id} task={t} showDates={false} showCompleted={true} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// View body — routes to the right renderer
// ============================================================================

function ViewBody() {
  const items = viewTasks.value;
  const v = activeView.value;

  if (v.type === 'upcoming') return <UpcomingView tasks={items} />;
  if (v.type === 'logbook')  return <LogbookView tasks={items} />;

  // Show dates in views where mixed dates appear
  const showDates = v.type !== 'today';

  return <TaskListFlat tasks={items} showDates={showDates} />;
}

// ============================================================================
// Main content
// ============================================================================

function MainContent() {
  const title = useViewTitle();
  const subtitle = useViewSubtitle();

  return (
    <main class="main-content">
      <header class="view-header">
        <h1 class="view-title">{title}</h1>
        {subtitle && <div class="view-subtitle">{subtitle}</div>}
      </header>
      <div class="view-body">
        <TaskInput />
        <ViewBody />
      </div>
    </main>
  );
}

// ============================================================================
// App
// ============================================================================

export function App() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === '/' || e.key === 'n') && !editingId.value && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        (document.querySelector('.task-input') as HTMLInputElement)?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div class="app-shell">
      <Sidebar />
      <MainContent />
    </div>
  );
}
