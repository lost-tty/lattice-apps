// Lattice Outliner — Types

export type StoreOp =
  | { put: { key: Uint8Array; value: Uint8Array } }
  | { delete: { key: Uint8Array } };

export type ProjectedEntry = { value: Uint8Array; timestamp?: unknown; author?: Uint8Array };
export type KeyEntry = { key: Uint8Array; entries: ProjectedEntry[] };

export interface Store {
  List(p: { prefix: Uint8Array }): Promise<{ items: KeyEntry[] }>;
  Get(p: { key: Uint8Array }): Promise<{ entries: ProjectedEntry[] }>;
  GetLww(p: { key: Uint8Array }): Promise<{ value: Uint8Array | null }>;
  Put(p: { key: Uint8Array; value: Uint8Array }): Promise<void>;
  Delete(p: { key: Uint8Array }): Promise<void>;
  Batch(p: { ops: StoreOp[] }): Promise<void>;
  subscribe(
    stream: string,
    p: { prefix: Uint8Array },
    cb: (e: WatchEvent) => void,
  ): () => void;
}

export type WatchEvent = { key: Uint8Array; value: Uint8Array | null; deleted: boolean };

declare global {
  const LatticeSDK: { connect(): Promise<{ openAppStore(): Promise<Store> }> };
}

export interface Page {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** On-disk shape: a flat record persisted to the kvstore. The block's
 *  identity lives in the key (`block/<id>`); fields here mirror the
 *  pre-union schema for backward storage compatibility. */
export interface StoredBlock {
  /** Full markdown syntax: "- foo", "# H", "- [ ] task", "---", or bare
   *  text. Empty for grid containers. */
  content: string;
  pageId: string;
  parent: string | null;
  order: number;
  layout?: 'grid';
  col?: number;
  collapsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** In-memory block: fields are parsed from `StoredBlock.content` once at
 *  the db.ts boundary. Renderers and editors read `kind`/`text`/`level`/
 *  `todo` directly — no prefix parsing scattered through the codebase. */
export type TodoStatus = { status: string; syntax: 'checkbox' | 'keyword' };

interface BlockBase {
  id: string;
  pageId: string;
  parent: string | null;
  order: number;
  col?: number;
  collapsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Memory-only block that hasn't earned store persistence yet (empty
   *  block created speculatively by the click handler, Enter continuation,
   *  etc.). saveBlock auto-clears this flag and emits when the block
   *  acquires real text; deleteBlock skips the store delete when set. */
  tentative?: boolean;
}

export type Block =
  | (BlockBase & { kind: 'bullet';    text: string; todo?: TodoStatus })
  | (BlockBase & { kind: 'heading';   text: string; level: 1 | 2 | 3 | 4 | 5 | 6 })
  | (BlockBase & { kind: 'paragraph'; text: string })
  | (BlockBase & { kind: 'hrule' })
  | (BlockBase & { kind: 'grid' });

export type BlockNode = Block & { children: BlockNode[] };
