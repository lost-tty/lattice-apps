// ============================================================================
// Lattice Todo — Type definitions
// ============================================================================

// --- Store interface (provided by LatticeSDK) ---

export interface Store {
  readonly storeId: string;
  get(key: string): Promise<{ value: Uint8Array | null }>;
  getJSON(key: string): Promise<{ value: unknown }>;
  put(key: string, value: string | Uint8Array): Promise<void>;
  putJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<{ key: Uint8Array; value: Uint8Array }[]>;
  watch(
    prefix: string,
    onEvent: (e: { key: Uint8Array; value: Uint8Array | null; deleted: boolean }) => void,
  ): () => void;
  exportJSON(): Promise<{ entries: { key: string; value: unknown }[] }>;
  importJSON(data: { entries: { key: string; value: unknown }[] }): Promise<number>;
}

declare global {
  const LatticeSDK: { connect(): Promise<Store> };
}

// --- Todo item ---

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  order: number;
  createdAt: string;
}

export type Filter = 'all' | 'active' | 'completed';
