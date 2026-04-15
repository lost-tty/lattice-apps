// Lattice Outliner — Types

export type StoreOp =
  | { put: { key: Uint8Array; value: Uint8Array } }
  | { delete: { key: Uint8Array } };

export interface Store {
  List(p: { prefix: Uint8Array }): Promise<unknown>;
  Get(p: { key: Uint8Array }): Promise<{ value: Uint8Array | null }>;
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
  folder?: string;   // e.g. 'journals' — undefined means root
  createdAt: string;
  updatedAt: string;
}

export interface Block {
  id: string;
  /** Full markdown syntax: "- foo" for bullets, "# H" for headings,
   *  "- [ ] task" for todos, "---" for hrule, bare text for paragraphs.
   *  Indentation is not part of content — it's derived from the tree. */
  content: string;
  pageId: string;
  parent: string | null;
  order: number;
  /** Structural layout of the block's children. Currently only `'grid'`
   *  (the container's children are table cells positioned by `col`). */
  layout?: 'grid';
  col?: number;   // column position for grid cell blocks (fractional)
  collapsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlockNode extends Block {
  children: BlockNode[];
}
