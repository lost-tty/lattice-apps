// ============================================================================
// Lattice Todo — Type definitions
// ============================================================================

// --- SDK + Store interfaces (provided by LatticeSDK) ---

export interface Store {
  readonly storeId: string;
  List(params: { prefix: Uint8Array }): Promise<any>;
  Get(params: { key: Uint8Array }): Promise<{ value: Uint8Array | null }>;
  Put(params: { key: Uint8Array; value: Uint8Array }): Promise<void>;
  Delete(params: { key: Uint8Array }): Promise<void>;
  subscribe(
    stream: string,
    params: { prefix: Uint8Array },
    onEvent: (event: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) => void,
  ): () => void;
}

export interface SDK {
  openAppStore(): Promise<Store>;
}

type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

declare global {
  const LatticeSDK: { connect(opts?: { onStatus?: StatusCallback }): Promise<SDK> };
  var SDK: SDK;
}

// --- Status ---

export type ItemStatus = 'open' | 'completed' | 'canceled';

// --- Area ---

export interface Area {
  id: string;
  title: string;
  order: number;
}

// --- Project ---

export interface Project {
  id: string;
  title: string;
  notes: string;
  deadline: string | null;     // ISO-8601 date or null
  status: ItemStatus;
  areaId: string | null;
  order: number;
  createdAt: string;
}

// --- Heading ---

export interface Heading {
  id: string;
  title: string;
  projectId: string;
  order: number;
}

// --- Task (the core entity, replaces Todo) ---

export interface Task {
  id: string;
  title: string;
  notes: string;
  startDate: string | null;    // "When" — ISO-8601 date or null
  deadline: string | null;     // "Due" — ISO-8601 date or null
  status: ItemStatus;
  deferred: boolean;           // true = lives in Someday
  tags: string[];              // tag IDs
  areaId: string | null;
  projectId: string | null;
  headingId: string | null;
  order: number;
  createdAt: string;
  completedAt: string | null;  // set when status changes to completed/canceled
}

// --- Checklist item (subtask within a Task) ---

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  taskId: string;
  order: number;
}

// --- Tag ---

export interface Tag {
  id: string;
  title: string;
  parentId: string | null;     // for nested tags
  order: number;
}

// --- Views ---

export type View =
  | { type: 'inbox' }
  | { type: 'today' }
  | { type: 'upcoming' }
  | { type: 'anytime' }
  | { type: 'someday' }
  | { type: 'logbook' }
  | { type: 'project'; projectId: string }
  | { type: 'area'; areaId: string }
  | { type: 'tag'; tagId: string };

// --- Helpers ---

/** Today as YYYY-MM-DD */
export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tomorrow as YYYY-MM-DD */
export function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Date N days from now as YYYY-MM-DD */
export function dateInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Next Monday as YYYY-MM-DD */
export function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format YYYY-MM-DD as friendly label relative to today. */
export function formatDate(iso: string): string {
  const today = todayDate();
  if (iso === today) return 'Today';
  const tmrw = tomorrowDate();
  if (iso === tmrw) return 'Tomorrow';

  const d = new Date(iso + 'T00:00:00');
  const now = new Date();
  const diffMs = d.getTime() - new Date(today + 'T00:00:00').getTime();
  const diffDays = Math.round(diffMs / 86400000);

  // Yesterday
  if (diffDays === -1) return 'Yesterday';

  // Within this week (next 6 days)
  if (diffDays > 0 && diffDays <= 6) return DAYS[d.getDay()];

  // Same year — "Mon, Jan 5"
  if (d.getFullYear() === now.getFullYear()) {
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // Different year — "Jan 5, 2025"
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Format ISO timestamp as "Jan 5 at 3:42 PM" */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mm = m < 10 ? '0' + m : '' + m;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} at ${h12}:${mm} ${ampm}`;
}

/** Format today's date for the header — "Wednesday, March 26" */
export function formatTodayHeader(): string {
  const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date();
  return `${FULL_DAYS[d.getDay()]}, ${FULL_MONTHS[d.getMonth()]} ${d.getDate()}`;
}
