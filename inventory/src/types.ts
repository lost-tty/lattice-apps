// ============================================================================
// Lattice Inventory — Type definitions
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

// --- Item ---

/** Symbol key for the item's unique ID. Invisible to JSON.stringify and Object.keys. */
export const ID: unique symbol = Symbol('id');

/** A single inventory item — flat JSON with arbitrary fields.
 *  The only structured property is [ID] (a Symbol), which carries the KV store key.
 *  All user-visible fields are plain string keys — no field is privileged. */
export interface Item {
  [ID]: string;
  [key: string]: unknown;
}

// --- Index engine types ---

export type ColumnType = 'text' | 'number' | 'currency' | 'measurement' | 'longtext';

export interface Column {
  key: string;       // field key = display label (no transformation)
  type: ColumnType;
  fillRate: number;  // 0–1, fraction of items that have this field
}

export interface GroupIndex {
  group: string;       // the value of the groupBy field (or '__all__' for flat view)
  path: string;        // full path for nesting: "category/subcategory" — used as collapse key
  level: number;       // nesting depth: 0 = top level
  label: string;
  color: string;
  columns: Column[];
  items: Item[];       // items directly in this group (only populated at leaf level)
  children: GroupIndex[]; // nested sub-groups (empty at leaf level)
}

// --- App state ---

export type SortDir = 'asc' | 'desc';

export interface SortState {
  group: string;
  column: string;
  dir: SortDir;
}

/** Persisted view preferences (synced via KV store). */
export interface ViewPrefs {
  groupLevels: string[];              // ordered hierarchy of field keys to group by; empty = flat
  filters: Record<string, string[]>;  // field key → selected values
  globalColumns: string[];            // field keys pinned as always-visible across all groups
  sort?: SortState | null;            // current sort column + direction
  columnOrder?: string[];             // explicit column ordering; columns not listed appear at end
  declaredColumns?: string[];         // user-created columns; visible even at 0% fill rate
}

export interface ColumnSelection {
  groupPath: string;                   // which group's table
  key: string;                         // field key of the selected column
}

export interface CellRef {
  itemId: string;
  colKey: string;
}

// --- Sync status ---

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
