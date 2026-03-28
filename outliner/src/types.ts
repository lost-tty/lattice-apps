// Lattice Outliner — Types

export interface Store {
  List(p: { prefix: Uint8Array }): Promise<unknown>;
  Get(p: { key: Uint8Array }): Promise<{ value: Uint8Array | null }>;
  Put(p: { key: Uint8Array; value: Uint8Array }): Promise<void>;
  Delete(p: { key: Uint8Array }): Promise<void>;
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
  content: string;
  pageId: string;
  parent: string | null;
  order: number;
  type?: 'bullet' | 'paragraph' | 'table';  // default: 'bullet'
  col?: number;   // column position for table cell blocks (fractional)
  collapsed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BlockNode extends Block {
  children: BlockNode[];
}
