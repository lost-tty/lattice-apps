// ============================================================================
// Lattice Todo — Sidebar
//
// Smart lists (Inbox, Today, Upcoming, Anytime, Someday, Logbook)
// + user Areas and Projects.
// ============================================================================

import { useComputed, useSignal } from '@preact/signals';
import type { View } from './types';
import { todayDate } from './types';
import {
  activeView, inboxCount, todayCount, upcomingCount, somedayCount,
  sortedAreas, sortedProjects,
  addProject, addArea,
  updateTask, scheduleTask, deferTask, moveTaskToInbox, toggleTask,
} from './state';

// --- Icons (SVG paths, 16x16 viewBox) ---

const ICONS: Record<string, string> = {
  inbox:    'M2 3h12v2H2zm0 4h12v2H2zm0 4h8v2H2z',                                         // tray lines
  today:    'M8 1a7 7 0 110 14A7 7 0 018 1zm0 2.5V8l3 2',                                    // clock
  upcoming: 'M2 2h12v2H2zm2 4h8v2H4zm2 4h4v2H6z',                                            // calendar stack
  anytime:  'M8 1a7 7 0 110 14A7 7 0 018 1z',                                                // open circle
  someday:  'M8 1a7 7 0 110 14A7 7 0 018 1zm0 3v4h4',                                        // half clock
  logbook:  'M4 1h8l1 2v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm0 4h8m-4 2v4',                    // book
  project:  'M3 1h10a1 1 0 011 1v12l-6-3-6 3V2a1 1 0 011-1z',                                // bookmark
  area:     'M1 3h14v10a1 1 0 01-1 1H2a1 1 0 01-1-1V3zm0 0l2-2h10l2 2M6 7h4',               // folder
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d={d} />
    </svg>
  );
}

// --- Helpers ---

function viewEq(a: View, b: View): boolean {
  if (a.type !== b.type) return false;
  if ('projectId' in a && 'projectId' in b) return a.projectId === b.projectId;
  if ('areaId' in a && 'areaId' in b) return a.areaId === b.areaId;
  if ('tagId' in a && 'tagId' in b) return a.tagId === b.tagId;
  return true;
}

// --- Smart list item ---

function NavItem({ view, icon, label, count, onDropTask }: {
  view: View; icon: string; label: string; count?: number;
  onDropTask?: (taskId: string) => void;
}) {
  const active = useComputed(() => viewEq(activeView.value, view));
  const dragOver = useSignal(false);

  const onDragOver = (e: DragEvent) => {
    if (!onDropTask) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOver.value = true;
  };
  const onDragLeave = () => { dragOver.value = false; };
  const onDrop = (e: DragEvent) => {
    dragOver.value = false;
    if (!onDropTask) return;
    e.preventDefault();
    const taskId = e.dataTransfer!.getData('text/plain');
    if (taskId) onDropTask(taskId);
  };

  return (
    <button
      class={`nav-item ${active.value ? 'active' : ''} ${dragOver.value ? 'drop-target' : ''}`}
      onClick={() => { activeView.value = view; }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span class="nav-icon"><Icon name={icon} /></span>
      <span class="nav-label">{label}</span>
      {count !== undefined && count > 0 && (
        <span class="nav-count">{count}</span>
      )}
    </button>
  );
}

// --- Section header with add button ---

function SectionHeader({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div class="nav-section-header">
      <span class="nav-section-label">{label}</span>
      <button class="nav-section-add" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}>+</button>
    </div>
  );
}

// --- Sidebar ---

export function Sidebar() {
  const areaList = sortedAreas.value;
  const projectList = sortedProjects.value;

  const handleAddProject = () => {
    const title = prompt('Project name:');
    if (title) addProject(title);
  };

  const handleAddArea = () => {
    const title = prompt('Area name:');
    if (title) addArea(title);
  };

  const standaloneProjects = projectList.filter(p => p.areaId === null && p.status === 'open');

  return (
    <nav class="sidebar">
      <div class="sidebar-top">
        <div class="sidebar-brand">Things</div>
      </div>

      <div class="sidebar-scroll">
        {/* Smart lists */}
        <div class="nav-group">
          <NavItem view={{ type: 'inbox' }}    icon="inbox"    label="Inbox"    count={inboxCount.value}
            onDropTask={(id) => moveTaskToInbox(id)} />
          <NavItem view={{ type: 'today' }}    icon="today"    label="Today"    count={todayCount.value}
            onDropTask={(id) => scheduleTask(id, todayDate())} />
          <NavItem view={{ type: 'upcoming' }} icon="upcoming" label="Upcoming" count={upcomingCount.value} />
          <NavItem view={{ type: 'anytime' }}  icon="anytime"  label="Anytime"
            onDropTask={(id) => updateTask(id, { deferred: false, startDate: null })} />
          <NavItem view={{ type: 'someday' }}  icon="someday"  label="Someday"  count={somedayCount.value}
            onDropTask={(id) => deferTask(id)} />
          <NavItem view={{ type: 'logbook' }}  icon="logbook"  label="Logbook"
            onDropTask={(id) => toggleTask(id)} />
        </div>

        <div class="nav-divider" />

        {/* Projects */}
        {(standaloneProjects.length > 0 || areaList.length === 0) && (
          <div class="nav-group">
            <SectionHeader label="Projects" onAdd={handleAddProject} />
            {standaloneProjects.map(p => (
              <NavItem
                key={p.id}
                view={{ type: 'project', projectId: p.id }}
                icon="project"
                label={p.title}
                onDropTask={(id) => updateTask(id, { projectId: p.id })}
              />
            ))}
          </div>
        )}

        {/* Areas (with their projects nested) */}
        {areaList.length > 0 && (
          <div class="nav-group">
            <SectionHeader label="Areas" onAdd={handleAddArea} />
            {areaList.map(area => {
              const areaProjects = projectList.filter(p => p.areaId === area.id && p.status === 'open');
              return (
                <div key={area.id} class="nav-area-group">
                  <NavItem
                    view={{ type: 'area', areaId: area.id }}
                    icon="area"
                    label={area.title}
                    onDropTask={(id) => updateTask(id, { areaId: area.id, projectId: null })}
                  />
                  {areaProjects.map(p => (
                    <NavItem
                      key={p.id}
                      view={{ type: 'project', projectId: p.id }}
                      icon="project"
                      label={p.title}
                      onDropTask={(id) => updateTask(id, { projectId: p.id })}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
