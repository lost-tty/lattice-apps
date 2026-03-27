// ============================================================================
// Lattice Todo — Data Layer
//
// Generic KV-backed entity store with per-prefix collections.
// Migrates legacy "todo/" keys to "task/" on first load.
// ============================================================================

import type { Store, Task, Project, Area, Heading, ChecklistItem, Tag } from './types';

const enc = new TextEncoder();
const encode = (s: string): Uint8Array => enc.encode(s);
const decode = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Unwrap List response — the proto message wraps the repeated field;
 *  the field name varies by schema, so find the first array. */
function unwrapList(resp: unknown): { key: Uint8Array; value: Uint8Array }[] {
  if (Array.isArray(resp)) return resp;
  if (resp != null && typeof resp === 'object') {
    for (const v of Object.values(resp)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// --- Key prefixes ---

const PREFIX = {
  task: 'task/',
  project: 'project/',
  area: 'area/',
  heading: 'heading/',
  checklist: 'checklist/',
  tag: 'tag/',
} as const;

const LEGACY_PREFIX = 'todo/';

type EntityMap = {
  task: Task;
  project: Project;
  area: Area;
  heading: Heading;
  checklist: ChecklistItem;
  tag: Tag;
};

type Kind = keyof EntityMap;

// --- EntityCollection: typed Map wrapper for one entity kind ---

class EntityCollection<T extends { id: string }> {
  readonly items = new Map<string, T>();
  private store: Store | null = null;
  private prefix: string;
  private onChange: () => void;

  constructor(prefix: string, onChange: () => void) {
    this.prefix = prefix;
    this.onChange = onChange;
  }

  /** Load all entries from the store under this prefix. */
  async load(store: Store): Promise<void> {
    this.store = store;
    const entries = unwrapList(await store.List({ prefix: encode(this.prefix) }));
    for (const e of entries) {
      const key = decode(e.key);
      const id = key.slice(this.prefix.length);
      try {
        const data = JSON.parse(decode(e.value));
        if (data && typeof data === 'object') {
          this.items.set(id, { id, ...data } as T);
        }
      } catch { /* skip malformed */ }
    }
  }

  /** Handle a watch event for this prefix. */
  handleWatch(key: string, value: Uint8Array | null, deleted: boolean): boolean {
    if (!key.startsWith(this.prefix)) return false;
    const id = key.slice(this.prefix.length);

    if (deleted || !value) {
      if (!this.items.has(id)) return false;
      this.items.delete(id);
      return true;
    }

    try {
      const data = JSON.parse(decode(value));
      if (!data || typeof data !== 'object') return false;
      const updated = { id, ...data } as T;
      const existing = this.items.get(id);
      // Skip if JSON-identical
      if (existing && JSON.stringify(existing) === JSON.stringify(updated)) return false;
      this.items.set(id, updated);
      return true;
    } catch { return false; }
  }

  getAll(): Map<string, T> {
    return new Map(this.items);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  async save(entity: T): Promise<void> {
    this.items.set(entity.id, entity);
    if (!this.store) return;
    const { id, ...data } = entity as T & { id: string };
    await this.store.Put({ key: encode(this.prefix + id), value: encode(JSON.stringify(data)) });
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
    if (!this.store) return;
    await this.store.Delete({ key: encode(this.prefix + id) });
  }
}

// --- AppStore: the full multi-entity store ---

export class AppStore {
  private store: Store | null = null;
  private unwatch: (() => void) | null = null;
  private onChange: () => void = () => {};

  tasks!: EntityCollection<Task>;
  projects!: EntityCollection<Project>;
  areas!: EntityCollection<Area>;
  headings!: EntityCollection<Heading>;
  checklist!: EntityCollection<ChecklistItem>;
  tags!: EntityCollection<Tag>;

  async init(store: Store, onChange: () => void): Promise<void> {
    this.store = store;
    this.onChange = onChange;

    // Create collections
    this.tasks = new EntityCollection<Task>(PREFIX.task, onChange);
    this.projects = new EntityCollection<Project>(PREFIX.project, onChange);
    this.areas = new EntityCollection<Area>(PREFIX.area, onChange);
    this.headings = new EntityCollection<Heading>(PREFIX.heading, onChange);
    this.checklist = new EntityCollection<ChecklistItem>(PREFIX.checklist, onChange);
    this.tags = new EntityCollection<Tag>(PREFIX.tag, onChange);

    // Load all collections in parallel
    await Promise.all([
      this.tasks.load(store),
      this.projects.load(store),
      this.areas.load(store),
      this.headings.load(store),
      this.checklist.load(store),
      this.tags.load(store),
    ]);

    // Migrate legacy todo/* entries to task/*
    await this.migrateLegacy(store);

    // Single watch on all keys — route to the right collection
    this.unwatch = store.subscribe('watch', { prefix: encode('') }, (e) => this.handleWatch(e));
  }

  /** Migrate old "todo/" keys to "task/" format. */
  private async migrateLegacy(store: Store): Promise<void> {
    const entries = unwrapList(await store.List({ prefix: encode(LEGACY_PREFIX) }));
    if (entries.length === 0) return;

    for (const e of entries) {
      const key = decode(e.key);
      const id = key.slice(LEGACY_PREFIX.length);

      // Skip if we already have this task
      if (this.tasks.items.has(id)) {
        await store.Delete({ key: encode(key) });
        continue;
      }

      try {
        const old = JSON.parse(decode(e.value));
        if (!old || typeof old !== 'object') continue;

        // Convert Todo → Task
        const task: Task = {
          id,
          title: old.text ?? '',
          notes: '',
          startDate: null,
          deadline: null,
          status: old.done ? 'completed' : 'open',
          deferred: false,
          tags: [],
          areaId: null,
          projectId: null,
          headingId: null,
          order: old.order ?? 0,
          createdAt: old.createdAt ?? new Date().toISOString(),
          completedAt: old.done ? new Date().toISOString() : null,
        };

        await this.tasks.save(task);
        await store.Delete({ key: encode(key) });
      } catch { /* skip malformed */ }
    }
  }

  private handleWatch(e: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) {
    const key = decode(e.key);

    // Ignore legacy prefix (migration handles these)
    if (key.startsWith(LEGACY_PREFIX)) return;

    const changed =
      this.tasks.handleWatch(key, e.value, e.deleted) ||
      this.projects.handleWatch(key, e.value, e.deleted) ||
      this.areas.handleWatch(key, e.value, e.deleted) ||
      this.headings.handleWatch(key, e.value, e.deleted) ||
      this.checklist.handleWatch(key, e.value, e.deleted) ||
      this.tags.handleWatch(key, e.value, e.deleted);

    if (changed) this.onChange();
  }

  destroy() {
    this.unwatch?.();
  }
}
