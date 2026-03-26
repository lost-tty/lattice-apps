// ============================================================================
// Lattice Inventory — Undo/Redo System
//
// Stores undo/redo stacks in sessionStorage so they survive page refresh.
// No fixed depth limit — trims oldest entries when storage quota is hit.
// Each entry is a self-contained operation that can be applied forward (redo)
// or backward (undo). The store sees normal put/delete operations.
// ============================================================================

import { signal } from '@preact/signals';

const SESSION_KEY = 'lattice-inventory-undo';

// --- Types ---

/** A single field change: one cell. */
export interface FieldChange {
  itemId: string;
  key: string;
  oldValue: unknown;  // null means field didn't exist
  newValue: unknown;  // null means field was deleted
}

/** A deleted item snapshot (all its fields). */
export interface DeletedItem {
  itemId: string;
  fields: Record<string, unknown>;
}

/** A created item (for undoing creation = delete it). */
export interface CreatedItem {
  itemId: string;
}

export type UndoEntry =
  | { type: 'fields'; label: string; changes: FieldChange[] }
  | { type: 'delete'; label: string; items: DeletedItem[] }
  | { type: 'create'; label: string; items: CreatedItem[] };

interface UndoState {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

// --- Signals for UI ---
export const canUndo = signal(false);
export const canRedo = signal(false);

// --- Storage ---

function load(): UndoState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { undo: [], redo: [] };
}

function save(state: UndoState) {
  const json = JSON.stringify(state);
  // Try to write; on quota error, trim oldest entries and retry
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      sessionStorage.setItem(SESSION_KEY, json);
      canUndo.value = state.undo.length > 0;
      canRedo.value = state.redo.length > 0;
      return;
    } catch {
      // Quota exceeded — drop oldest undo entry (or redo if undo is empty)
      if (state.undo.length > 1) {
        state.undo.shift();
      } else if (state.redo.length > 0) {
        state.redo.shift();
      } else {
        // Nothing left to trim — give up
        break;
      }
    }
  }
  // Last resort: clear entirely
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  canUndo.value = state.undo.length > 0;
  canRedo.value = state.redo.length > 0;
}

// --- Init ---

export function initUndo() {
  const state = load();
  canUndo.value = state.undo.length > 0;
  canRedo.value = state.redo.length > 0;
}

// --- Push ---

export function pushUndo(entry: UndoEntry) {
  const state = load();
  state.undo.push(entry);
  state.redo = [];
  save(state);
}

// --- Pop ---

export function popUndo(): UndoEntry | null {
  const state = load();
  const entry = state.undo.pop();
  if (!entry) return null;
  state.redo.push(entry);
  save(state);
  return entry;
}

export function popRedo(): UndoEntry | null {
  const state = load();
  const entry = state.redo.pop();
  if (!entry) return null;
  state.undo.push(entry);
  save(state);
  return entry;
}
