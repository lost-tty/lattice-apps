// Lattice Kanban — A minimal real-time kanban board
//
// Demonstrates: connect, openAppStore, List, Put, Delete, subscribe

import { render } from 'preact';
import { signal, computed, type Signal } from '@preact/signals';

// --- Lattice SDK types ---

interface Store {
  List(p: { prefix: Uint8Array }): Promise<unknown>;
  Put(p: { key: Uint8Array; value: Uint8Array }): Promise<void>;
  Delete(p: { key: Uint8Array }): Promise<void>;
  subscribe(stream: string, p: { prefix: Uint8Array }, cb: (e: WatchEvent) => void): () => void;
}

type WatchEvent = { key: Uint8Array; value: Uint8Array | null; deleted: boolean };

declare const LatticeSDK: { connect(): Promise<{ openAppStore(): Promise<Store> }> };

// --- Encoding helpers ---

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);


// --- Data types ---

type Card = { id: string; title: string; column: string; order: number };
type Col = { id: string; name: string; order: number };

const DEFAULTS: Col[] = [
  { id: 'todo', name: 'To Do', order: 0 },
  { id: 'progress', name: 'In Progress', order: 1 },
  { id: 'done', name: 'Done', order: 2 },
];

// --- Reactive state ---
// Plain objects in signals — spreading creates new references, triggering re-renders.

let store: Store;

const cardData = signal<Record<string, Card>>({});
const colData = signal<Record<string, Col>>({});

const sortedCards = computed(() => Object.values(cardData.value).sort((a, b) => a.order - b.order));
const sortedCols = computed(() => Object.values(colData.value).sort((a, b) => a.order - b.order));

function uid() { return crypto.randomUUID().slice(0, 8); }
function nextOrder(items: { order: number }[]) { return items.reduce((m, i) => Math.max(m, i.order), -1) + 1; }

// --- Store operations ---

async function saveCard(card: Card) {
  cardData.value = { ...cardData.value, [card.id]: card };
  const { id, ...rest } = card;
  await store.Put({ key: encode('card/' + id), value: encode(JSON.stringify(rest)) });
}

async function deleteCard(id: string) {
  const { [id]: _, ...rest } = cardData.value;
  cardData.value = rest;
  await store.Delete({ key: encode('card/' + id) });
}

async function saveCol(col: Col) {
  colData.value = { ...colData.value, [col.id]: col };
  const { id, ...rest } = col;
  await store.Put({ key: encode('col/' + id), value: encode(JSON.stringify(rest)) });
}

async function deleteCol(id: string) {
  const deletes: Promise<void>[] = [];
  const nextCards: Record<string, Card> = {};
  for (const [cid, c] of Object.entries(cardData.value)) {
    if (c.column === id) deletes.push(store.Delete({ key: encode('card/' + cid) }));
    else nextCards[cid] = c;
  }
  cardData.value = nextCards;
  const { [id]: _, ...restCols } = colData.value;
  colData.value = restCols;
  deletes.push(store.Delete({ key: encode('col/' + id) }));
  await Promise.all(deletes);
}

/** Apply a watch event to a signal holding a Record<string, T>. */
function applyWatch<T>(sig: Signal<Record<string, T>>, prefix: string, key: string, e: WatchEvent) {
  if (!key.startsWith(prefix)) return false;
  const id = key.slice(prefix.length);
  if (e.deleted || !e.value) {
    const { [id]: _, ...rest } = sig.value;
    sig.value = rest;
  } else {
    try { sig.value = { ...sig.value, [id]: { id, ...JSON.parse(decode(e.value)) } as T }; }
    catch (err) { console.warn('[kanban] parse error:', err); return false; }
  }
  return true;
}

const DRAG_TYPE = 'application/x-kanban-card';

// --- Components ---

function CardItem({ card }: { card: Card }) {
  return (
    <div class="card" draggable onDragStart={(e: Event) => {
      const dt = (e as DragEvent).dataTransfer!;
      dt.effectAllowed = 'move';
      dt.setData(DRAG_TYPE, card.id);
    }}>
      <span>{card.title}</span>
      <button class="del" onClick={() => deleteCard(card.id)}>&times;</button>
    </div>
  );
}

function Column({ col }: { col: Col }) {
  const colCards = sortedCards.value.filter((c) => c.column === col.id);

  function handleDrop(e: Event) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drop-over');
    const id = (e as DragEvent).dataTransfer?.getData(DRAG_TYPE);
    const card = id ? cardData.value[id] : null;
    if (card && card.column !== col.id)
      saveCard({ ...card, column: col.id, order: nextOrder(colCards) });
  }

  function handleRename() {
    const name = prompt('Rename column:', col.name);
    if (name?.trim()) saveCol({ ...col, name: name.trim() });
  }

  function handleDelete() {
    if (colCards.length && !confirm(`Delete "${col.name}" and its ${colCards.length} card(s)?`)) return;
    deleteCol(col.id);
  }

  function handleAdd() {
    const title = prompt('Card title:');
    if (!title?.trim()) return;
    saveCard({ id: uid(), title: title.trim(), column: col.id, order: nextOrder(colCards) });
  }

  return (
    <div
      class="column"
      onDragOver={(e: Event) => e.preventDefault()}
      onDragEnter={(e: Event) => (e.currentTarget as HTMLElement).classList.add('drop-over')}
      onDragLeave={(e: Event) => {
        const el = e.currentTarget as HTMLElement;
        const related = (e as DragEvent).relatedTarget as Node | null;
        if (!related || !el.contains(related)) el.classList.remove('drop-over');
      }}
      onDrop={handleDrop}
    >
      <div class="column-header">
        <h2 onClick={handleRename}>{col.name}</h2>
        <span class="count">{colCards.length}</span>
        <button class="del" onClick={handleDelete}>&times;</button>
      </div>
      {colCards.map((card) => <CardItem key={card.id} card={card} />)}
      <button class="add" onClick={handleAdd}>+ Add card</button>
    </div>
  );
}

function Board() {
  const cols = sortedCols.value;
  return (
    <div class="board">
      <h1>Kanban</h1>
      <div class="columns">
        {cols.map((col) => <Column key={col.id} col={col} />)}
        <button class="add-col" onClick={() => {
          const name = prompt('Column name:');
          if (!name?.trim()) return;
          saveCol({ id: uid(), name: name.trim(), order: nextOrder(cols) });
        }}>+ Column</button>
      </div>
    </div>
  );
}

// --- Bootstrap ---

async function main() {
  const root = document.getElementById('app')!;
  root.textContent = 'Connecting…';

  try {
    const sdk = await LatticeSDK.connect();
    store = await sdk.openAppStore();

    // Load columns
    const cols: Record<string, Col> = {};
    for (const e of (await store.List({ prefix: encode('col/') })).items) {
      try { const id = decode(e.key).slice(4); cols[id] = { id, ...JSON.parse(decode(e.value)) }; }
      catch (err) { console.warn('[kanban] bad column:', err); }
    }
    colData.value = cols;

    // Seed defaults on first run
    if (Object.keys(cols).length === 0) for (const col of DEFAULTS) await saveCol(col);

    // Load cards
    const cards: Record<string, Card> = {};
    for (const e of (await store.List({ prefix: encode('card/') })).items) {
      try { const id = decode(e.key).slice(5); cards[id] = { id, ...JSON.parse(decode(e.value)) }; }
      catch (err) { console.warn('[kanban] bad card:', err); }
    }
    cardData.value = cards;

    // Watch for remote changes
    store.subscribe('watch', { prefix: encode('') }, (e) => {
      const key = decode(e.key);
      applyWatch(colData, 'col/', key, e) || applyWatch(cardData, 'card/', key, e);
    });

    root.textContent = '';
    render(<Board />, root);
  } catch (e) {
    console.error('[kanban] init failed:', e);
    root.textContent = `Failed to connect: ${e}`;
  }
}

main();
