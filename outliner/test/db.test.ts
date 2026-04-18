import { describe, it, expect, beforeEach } from 'vitest';
import { createMockStore } from '../src/mock-sdk';
import { buildTar, parseTar } from '../src/tar';
import {
  init, reset, pageData, blockData,
  savePage, getOrCreatePage, deletePage,
  saveBlock as _rawSaveBlock, deleteBlock,
  buildTree, flattenTree, getSiblings, validateTree,
  hasChildren, toggleCollapse, isCollapsed, collapsedBlocks,
  getBacklinks,
  navigateTo, navigateById, findPageBySlug, currentPage, activeBlockId,
  pageTitle, pageList, isTentativePage,
} from '../src/db';
import type { Block } from '../src/types';
import { parseStoredBlock } from '../src/parse';

/** Test-only compatibility wrapper over `saveBlock`.
 *
 *  Historical fixtures here set `type: 'bullet' | 'paragraph' | 'table'`
 *  and stored bare content; this wrapper translates them on the fly into
 *  the current schema (`content` prefix + `layout`) so the large existing
 *  fixture base keeps working without a mass rewrite.
 *
 *  NEW TESTS should write the current shape directly and skip `type`:
 *
 *    saveBlock({ content: '- foo', ... })                    // bullet
 *    saveBlock({ content: '# H', ... })                      // heading
 *    saveBlock({ content: 'prose', ... })                    // paragraph
 *    saveBlock({ content: '', layout: 'grid', ... })         // grid container
 *
 *  The wrapper is a bridge, not a preferred API. */
function saveBlock(block: any) {
  const { id, type, content = '', layout, col, ...rest } = block;
  // Translate v1/v2 fixture shape into the on-disk StoredBlock shape, then
  // run it through parseStoredBlock to produce the typed in-memory Block
  // the real saveBlock now expects.
  let storedContent = content;
  let storedLayout = layout;
  if (type === 'table') {
    storedContent = '';
    storedLayout = 'grid';
  } else if (type === 'paragraph' || col !== undefined) {
    // bare content, no bullet prefix
  } else {
    const alreadyMigrated =
      content === '' ||
      content === '- ' ||
      content.startsWith('- ') ||
      /^#{1,6} /.test(content) ||
      content === '---';
    storedContent = alreadyMigrated ? content : '- ' + content;
  }
  const stored = { ...rest, content: storedContent, col, layout: storedLayout };
  return _rawSaveBlock(parseStoredBlock(stored, id));
}
import { beginUndo, commitUndo, undo, redo } from '../src/undo';
import {
  parseWikiLinks, isTableRow, isTableSeparator, parseTableCells, parseHeading,
  parseTodoStatus, cycleTodoStatus, parseAnnotations,
  isJournalSlug, formatJournalTitle,
} from '../src/parse';
import {
  createBlockAfter, createChildBlock, indentBlock, outdentBlock,
  removeBlock, joinBlockWithPrevious, fixHeadingSections, moveBlock,
  carryForward, carryForwardAll,
} from '../src/blockOps';
import {
  getTableGrid, createTable, insertTableRow, insertTableCol,
  reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol,
} from '../src/table';
import {
  parseMarkdownToItems, insertBlocksAfter,
  exportPage, exportAllPages, importPage, importAllPages,
} from '../src/importExport';

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

beforeEach(async () => {
  reset();
  const store = createMockStore();
  await init(store);
});

// --- Mock Store ---

describe('mock store', () => {
  it('put, get, list, delete', async () => {
    const store = createMockStore();
    await store.Put({ key: encode('a'), value: encode('1') });
    await store.Put({ key: encode('b'), value: encode('2') });

    const { value } = await store.Get({ key: encode('a') });
    expect(decode(value!)).toBe('1');

    const resp = await store.List({ prefix: encode('') });
    const items = (resp as any).items;
    expect(items.length).toBe(2);

    await store.Delete({ key: encode('a') });
    const { value: gone } = await store.Get({ key: encode('a') });
    expect(gone).toBeNull();
  });

  it('list filters by prefix', async () => {
    const store = createMockStore();
    await store.Put({ key: encode('block/1'), value: encode('{}') });
    await store.Put({ key: encode('block/2'), value: encode('{}') });
    await store.Put({ key: encode('other/x'), value: encode('{}') });

    const resp = await store.List({ prefix: encode('block/') });
    expect((resp as any).items.length).toBe(2);
  });

  it('subscribe receives put and delete events', async () => {
    const store = createMockStore();
    const events: any[] = [];
    store.subscribe('watch', { prefix: encode('') }, (e) => events.push(e));

    await store.Put({ key: encode('k'), value: encode('v') });
    expect(events.length).toBe(1);
    expect(events[0].deleted).toBe(false);

    await store.Delete({ key: encode('k') });
    expect(events.length).toBe(2);
    expect(events[1].deleted).toBe(true);
  });

  it('unsubscribe stops events', async () => {
    const store = createMockStore();
    const events: any[] = [];
    const unsub = store.subscribe('watch', { prefix: encode('') }, (e) => events.push(e));

    await store.Put({ key: encode('a'), value: encode('1') });
    expect(events.length).toBe(1);

    unsub();
    await store.Put({ key: encode('b'), value: encode('2') });
    expect(events.length).toBe(1);
  });
});

// --- Init & CRUD ---

describe('init and CRUD', () => {
  it('loads pages and blocks from store on init', async () => {
    reset();
    const store = createMockStore();
    const now = new Date().toISOString();
    await store.Put({
      key: encode('page/pg1'),
      value: encode(JSON.stringify({ title: 'test', slug: 'test', createdAt: now, updatedAt: now })),
    });
    await store.Put({
      key: encode('block/abc'),
      value: encode(JSON.stringify({ content: '- hello', pageId: 'pg1', parent: null, order: 0 })),
    });
    await init(store);

    expect(pageData.value['pg1']).toBeDefined();
    expect(pageData.value['pg1'].title).toBe('test');
    expect(blockData.value['abc']).toBeDefined();
    expect(blockData.value['abc']).toMatchObject({ kind: 'bullet', text: 'hello' });
    expect(blockData.value['abc'].pageId).toBe('pg1');
  });

  it('saveBlock updates signal and store', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hi', pageId, parent: null, order: 0 });
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hi' });
  });

  it('saveBlock auto-sets createdAt on new blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    expect(blockData.value['1'].createdAt).toBeDefined();
  });

  it('saveBlock sets updatedAt on every save', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    expect(blockData.value['1'].updatedAt).toBeDefined();
  });

  it('saveBlock preserves existing createdAt on updates', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0, createdAt: '2020-01-01' });
    saveBlock({ ...blockData.value['1'], content: 'b' });
    expect(blockData.value['1'].createdAt).toBe('2020-01-01');
  });

  it('deleteBlock removes block and descendants', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'grandchild', pageId, parent: '2', order: 0 });
    saveBlock({ id: '4', content: 'sibling', pageId, parent: null, order: 1 });

    await deleteBlock('1');
    expect(blockData.value['1']).toBeUndefined();
    expect(blockData.value['2']).toBeUndefined();
    expect(blockData.value['3']).toBeUndefined();
    expect(blockData.value['4']).toBeDefined();
  });

  it('deletePage removes all blocks and the page itself', async () => {
    const pageId1 = getOrCreatePage('p1');
    const pageId2 = getOrCreatePage('p2');
    saveBlock({ id: '1', content: 'a', pageId: pageId1, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId: pageId1, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'c', pageId: pageId2, parent: null, order: 0 });

    await deletePage(pageId1);
    expect(blockData.value['1']).toBeUndefined();
    expect(blockData.value['2']).toBeUndefined();
    expect(blockData.value['3']).toBeDefined();
    expect(pageList.value.find(p => p.id === pageId1)).toBeUndefined();
    expect(pageList.value.find(p => p.id === pageId2)).toBeDefined();
  });
});

// --- Tree ---

describe('buildTree', () => {
  it('builds nested tree from flat blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root1', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'root2', pageId, parent: null, order: 1 });

    const tree = buildTree(pageId);
    expect(tree.length).toBe(2);
    expect(tree[0].id).toBe('1');
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].id).toBe('2');
    expect(tree[1].id).toBe('3');
    expect(tree[1].children.length).toBe(0);
  });

  it('sorts by order', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'b', content: 'second', pageId, parent: null, order: 5 });
    saveBlock({ id: 'a', content: 'first', pageId, parent: null, order: 2 });

    const tree = buildTree(pageId);
    expect(tree[0].id).toBe('a');
    expect(tree[1].id).toBe('b');
  });

  it('only includes blocks for the given page', () => {
    const pageId1 = getOrCreatePage('p1');
    const pageId2 = getOrCreatePage('p2');
    saveBlock({ id: '1', content: 'a', pageId: pageId1, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId: pageId2, parent: null, order: 0 });

    expect(buildTree(pageId1).length).toBe(1);
    expect(buildTree(pageId1)[0].id).toBe('1');
  });
});

describe('flattenTree', () => {
  it('returns pre-order traversal with correct depths', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child1', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'grandchild', pageId, parent: '2', order: 0 });
    saveBlock({ id: '4', content: 'child2', pageId, parent: '1', order: 1 });
    saveBlock({ id: '5', content: 'root2', pageId, parent: null, order: 1 });

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(flat.map(b => b.depth)).toEqual([0, 1, 2, 1, 0]);
  });
});

// --- Block operations ---

describe('createBlockAfter', () => {
  it('creates a block between siblings', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'first', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'second', pageId, parent: null, order: 1 });

    const newId = createBlockAfter('1', '- between');
    const block = blockData.value[newId];
    expect(block).toMatchObject({ kind: 'bullet', text: 'between' });
    expect(block.order).toBeGreaterThan(0);
    expect(block.order).toBeLessThan(1);
    expect(block.parent).toBeNull();
    expect(block.pageId).toBe(pageId);
  });

  it('creates a block at the end', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'only', pageId, parent: null, order: 0 });

    const newId = createBlockAfter('1', '- after');
    expect(blockData.value[newId].order).toBeGreaterThan(0);
  });

  it('preserves parent context', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });

    const newId = createBlockAfter('2', '- new child');
    expect(blockData.value[newId].parent).toBe('1');
  });

  it('simulated Enter: split block and activeBlockId points to new block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });

    // Simulate Enter at offset 5: "hello" stays, " world" goes to new block.
    // In v2, the new block's content carries the bullet prefix: "- " + " world".
    const before = 'hello';
    const after = '-  world';
    saveBlock({ ...blockData.value['1'], content: before });
    const newId = createBlockAfter('1', after);
    activeBlockId.value = newId;

    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hello' });
    expect(blockData.value[newId]).toMatchObject({ kind: 'bullet', text: ' world' });
    expect(activeBlockId.value).toBe(newId);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'hello' },
      { kind: 'bullet', text: ' world' },
    ]);
  });
});

describe('createChildBlock', () => {
  it('creates a block as the last child of the parent', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'existing', pageId, parent: '1', order: 0 });

    const newId = createChildBlock('1', '- new child');
    const block = blockData.value[newId];
    expect(block.parent).toBe('1');
    expect(block).toMatchObject({ kind: 'bullet', text: 'new child' });
    expect(block.order).toBeGreaterThan(blockData.value['2'].order);
  });

  it('creates first child when parent has no children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });

    const newId = createChildBlock('1', '- first');
    expect(blockData.value[newId].parent).toBe('1');
  });
});

describe('indentBlock', () => {
  it('makes block a child of previous sibling', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });

    indentBlock('2');
    expect(blockData.value['2'].parent).toBe('1');
  });

  it('does nothing for first sibling', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });

    indentBlock('1');
    expect(blockData.value['1'].parent).toBeNull();
  });

  it('does not nest under a paragraph block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'para', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item', pageId, parent: null, order: 1 });

    indentBlock('2');
    expect(blockData.value['2'].parent).toBeNull();
  });

  it('nests under a heading block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item', pageId, parent: null, order: 1 });

    indentBlock('2');
    expect(blockData.value['2'].parent).toBe('1');
  });

  it('does not indent a heading block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'item', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '# Heading', pageId, parent: null, order: 1, type: 'paragraph' });

    indentBlock('2');
    expect(blockData.value['2'].parent).toBeNull();
  });
});

describe('outdentBlock', () => {
  it('makes block a sibling of its parent', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });

    outdentBlock('2');
    expect(blockData.value['2'].parent).toBeNull();
    expect(blockData.value['2'].order).toBeGreaterThan(blockData.value['1'].order);
  });

  it('does nothing for root blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });

    outdentBlock('1');
    expect(blockData.value['1'].parent).toBeNull();
  });

  it('does not outdent past a heading parent', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item', pageId, parent: '1', order: 0 });

    outdentBlock('2');
    expect(blockData.value['2'].parent).toBe('1');
  });

  it('does not outdent a heading block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '## Sub', pageId, parent: '1', order: 0, type: 'paragraph' });

    outdentBlock('2');
    expect(blockData.value['2'].parent).toBe('1');
  });
});

describe('removeBlock', () => {
  it('removes block and returns previous block id', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });

    const prevId = removeBlock('2');
    expect(prevId).toBe('1');
    expect(blockData.value['2']).toBeUndefined();
  });

  it('does not remove the only block on the page', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'only', pageId, parent: null, order: 0 });

    const prevId = removeBlock('1');
    expect(prevId).toBeNull();
    expect(blockData.value['1']).toBeDefined();
  });

  it('removes the first block when there are following blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });

    const nextId = removeBlock('1');
    expect(nextId).toBe('2');
    expect(blockData.value['1']).toBeUndefined();
    expect(blockData.value['2']).toBeDefined();
  });

  it('does not remove block with children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'other', pageId, parent: null, order: 1 });

    const prevId = removeBlock('1');
    expect(prevId).toBeNull();
    expect(blockData.value['1']).toBeDefined();
  });
});

describe('joinBlockWithPrevious', () => {
  it('concatenates content without implicit space', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'world', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('2', 'world');
    expect(result).not.toBeNull();
    expect(result!.prevId).toBe('1');
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'helloworld' });
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(7);
  });

  it('preserves existing trailing space', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello ', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'world', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('2', 'world');
    expect(result).not.toBeNull();
    expect(result!.prevId).toBe('1');
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hello world' });
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(8);
  });

  it('returns null for the first block on the page', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'only block', pageId, parent: null, order: 0 });

    const result = joinBlockWithPrevious('1', 'only block');
    expect(result).toBeNull();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'only block' });
  });

  it('works across nesting levels (previous in flat tree order)', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'next', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('3', 'next');
    expect(result!.prevId).toBe('2');
    expect(blockData.value['2']).toMatchObject({ kind: 'bullet', text: 'childnext' });
    expect(blockData.value['3']).toBeUndefined();
  });

  it('joins empty block with previous block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('2', '');
    expect(result).not.toBeNull();
    expect(result!.prevId).toBe('1');
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hello' });
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(7);
  });
});

// --- Paste helpers ---

describe('parseMarkdownToItems', () => {
  it('parses a flat bullet list', () => {
    expect(parseMarkdownToItems('- alpha\n- beta\n- gamma')).toEqual([
      { content: 'alpha', relativeDepth: 0, type: 'bullet' },
      { content: 'beta',  relativeDepth: 0, type: 'bullet' },
      { content: 'gamma', relativeDepth: 0, type: 'bullet' },
    ]);
  });

  it('parses an indented bullet list and normalises depth', () => {
    expect(parseMarkdownToItems('- parent\n  - child\n    - grandchild')).toEqual([
      { content: 'parent',      relativeDepth: 0, type: 'bullet' },
      { content: 'child',       relativeDepth: 1, type: 'bullet' },
      { content: 'grandchild',  relativeDepth: 2, type: 'bullet' },
    ]);
  });

  it('normalises so the shallowest line is always depth 0', () => {
    const items = parseMarkdownToItems('  - child\n    - grandchild');
    expect(items[0].relativeDepth).toBe(0);
    expect(items[1].relativeDepth).toBe(1);
  });

  it('handles 4-space indented bullet lists', () => {
    expect(parseMarkdownToItems('- parent\n    - child\n        - grandchild')).toEqual([
      { content: 'parent',     relativeDepth: 0, type: 'bullet' },
      { content: 'child',      relativeDepth: 1, type: 'bullet' },
      { content: 'grandchild', relativeDepth: 2, type: 'bullet' },
    ]);
  });

  it('joins consecutive plain text lines into one paragraph', () => {
    expect(parseMarkdownToItems('line one\nline two')).toEqual([
      { content: 'line one\nline two', relativeDepth: 0, type: 'paragraph' },
    ]);
  });

  it('splits paragraphs on blank lines', () => {
    expect(parseMarkdownToItems('first paragraph\n\nsecond paragraph')).toEqual([
      { content: 'first paragraph',  relativeDepth: 0, type: 'paragraph' },
      { content: 'second paragraph', relativeDepth: 0, type: 'paragraph' },
    ]);
  });

  it('maps heading levels to depths, preserving the # markers in content', () => {
    expect(parseMarkdownToItems('# H1\n## H2\n### H3')).toEqual([
      { content: '# H1',   relativeDepth: 0, type: 'paragraph' },
      { content: '## H2',  relativeDepth: 1, type: 'paragraph' },
      { content: '### H3', relativeDepth: 2, type: 'paragraph' },
    ]);
  });

  it('makes bullets children of the current heading', () => {
    expect(parseMarkdownToItems('# Section\n- Item')).toEqual([
      { content: '# Section', relativeDepth: 0, type: 'paragraph' },
      { content: 'Item',      relativeDepth: 1, type: 'bullet' },
    ]);
  });

  it('resets bullet depth context when a new heading is seen', () => {
    const items = parseMarkdownToItems(
      '# Top\n## Sub\n- Item under sub\n# Top2\n- Item under top2',
    );
    expect(items.map(i => i.relativeDepth)).toEqual([0, 1, 2, 0, 1]);
    expect(items.map(i => i.content)).toEqual([
      '# Top', '## Sub', 'Item under sub', '# Top2', 'Item under top2',
    ]);
    expect(items.map(i => i.type)).toEqual([
      'paragraph', 'paragraph', 'bullet', 'paragraph', 'bullet',
    ]);
  });

  it('--- resets nesting context so content after it starts at depth 0', () => {
    const items = parseMarkdownToItems(
      '# Top\n## Sub\n- nested\n---\n# Fresh\n- item',
    );
    expect(items.map(i => i.content)).toEqual(
      ['# Top', '## Sub', 'nested', '---', '# Fresh', 'item'],
    );
    expect(items.map(i => i.relativeDepth)).toEqual([0, 1, 2, 0, 0, 1]);
    expect(items.map(i => i.type)).toEqual([
      'paragraph', 'paragraph', 'bullet', 'paragraph', 'paragraph', 'bullet',
    ]);
  });

  it('skips blank lines', () => {
    expect(parseMarkdownToItems('- a\n\n- b')).toEqual([
      { content: 'a', relativeDepth: 0, type: 'bullet' },
      { content: 'b', relativeDepth: 0, type: 'bullet' },
    ]);
  });

  it('preserves inline markdown syntax in content', () => {
    const items = parseMarkdownToItems('- **bold** and [[link]]\n  - `code`');
    expect(items[0].content).toBe('**bold** and [[link]]');
    expect(items[1].content).toBe('`code`');
  });

  it('joins continuation lines with the preceding bullet', () => {
    const items = parseMarkdownToItems('- parent\ncontinuation\nanother line');
    expect(items).toEqual([
      { content: 'parent\ncontinuation\nanother line', relativeDepth: 0, type: 'bullet' },
    ]);
  });

  it('handles nested bullets with continuation lines (CommonMark)', () => {
    const items = parseMarkdownToItems(
      '- asd\nasdf\nadsf\nfad\n  - asdf\nadfasdf #asd',
    );
    expect(items).toEqual([
      { content: 'asd\nasdf\nadsf\nfad',    relativeDepth: 0, type: 'bullet' },
      { content: 'asdf\nadfasdf #asd',      relativeDepth: 1, type: 'bullet' },
    ]);
  });

  it('blank line + unindented text breaks out of bullet context', () => {
    const items = parseMarkdownToItems('- bullet\n\nstandalone paragraph');
    expect(items).toEqual([
      { content: 'bullet',               relativeDepth: 0, type: 'bullet' },
      { content: 'standalone paragraph',  relativeDepth: 0, type: 'paragraph' },
    ]);
  });

  it('blank line + indented text stays in bullet context', () => {
    const items = parseMarkdownToItems('- bullet\n\n  still in list');
    expect(items).toEqual([
      { content: 'bullet',        relativeDepth: 0, type: 'bullet' },
      { content: 'still in list', relativeDepth: 1, type: 'paragraph' },
    ]);
  });

  it('blank lines never produce empty blocks', () => {
    const items = parseMarkdownToItems('\n\n- a\n\n\n- b\n\n');
    expect(items).toEqual([
      { content: 'a', relativeDepth: 0, type: 'bullet' },
      { content: 'b', relativeDepth: 0, type: 'bullet' },
    ]);
  });

  it('continuation lines roundtrip through export and import', () => {
    const pageId = getOrCreatePage('rt-continuation');
    importPage(pageId, '- parent\n  continuation\n  more\n  - child\n    child cont');
    const flat = flattenTree(buildTree(pageId));
    // Continuation lines join with their bullet block (content now carries
    // the `- ` prefix as part of v2).
    expect(flat.map(b => ({ kind: b.kind, text: b.text, depth: b.depth }))).toEqual([
      { kind: 'bullet', text: 'parent\ncontinuation\nmore', depth: 0 },
      { kind: 'bullet', text: 'child\nchild cont',          depth: 1 },
    ]);
    // Re-export should produce valid CommonMark with indented continuations
    const md = exportPage(pageId);
    expect(md).toBe('- parent\n  continuation\n  more\n  - child\n    child cont');
  });
});

describe('insertBlocksAfter', () => {
  it('inserts flat items as siblings after the anchor', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '- a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '- z', pageId, parent: null, order: 1 });

    insertBlocksAfter('1', [
      { content: 'b', relativeDepth: 0 },
      { content: 'c', relativeDepth: 0 },
    ]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'a' },
      { kind: 'bullet', text: 'b' },
      { kind: 'bullet', text: 'c' },
      { kind: 'bullet', text: 'z' },
    ]);
  });

  it('inserts nested items at the correct depth', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '- root', pageId, parent: null, order: 0 });

    insertBlocksAfter('1', [
      { content: 'sibling',     relativeDepth: 0 },
      { content: 'child',       relativeDepth: 1 },
      { content: 'grandchild',  relativeDepth: 2 },
      { content: 'next',        relativeDepth: 0 },
    ]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ kind: b.kind, text: b.text, depth: b.depth }))).toEqual([
      { kind: 'bullet', text: 'root',       depth: 0 },
      { kind: 'bullet', text: 'sibling',    depth: 0 },
      { kind: 'bullet', text: 'child',      depth: 1 },
      { kind: 'bullet', text: 'grandchild', depth: 2 },
      { kind: 'bullet', text: 'next',       depth: 0 },
    ]);
  });

  it('returns the id of the last inserted block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '- a', pageId, parent: null, order: 0 });

    const lastId = insertBlocksAfter('1', [
      { content: 'b', relativeDepth: 0 },
      { content: 'c', relativeDepth: 0 },
    ]);

    expect(blockData.value[lastId]).toMatchObject({ kind: 'bullet', text: 'c' });
  });

  it('inserts between existing siblings, not after them', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '- a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '- b', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: '- z', pageId, parent: null, order: 2 });

    insertBlocksAfter('2', [{ content: 'inserted', relativeDepth: 0 }]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'a' },
      { kind: 'bullet', text: 'b' },
      { kind: 'bullet', text: 'inserted' },
      { kind: 'bullet', text: 'z' },
    ]);
  });

  it('depth-0 items land after the anchor\'s existing children in flat order', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '- anchor', pageId, parent: null,  order: 0 });
    saveBlock({ id: '2', content: '- child',  pageId, parent: '1',   order: 0 });
    saveBlock({ id: '3', content: '- next',   pageId, parent: null,  order: 1 });

    insertBlocksAfter('1', [{ content: 'inserted', relativeDepth: 0 }]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'anchor' },
      { kind: 'bullet', text: 'child' },
      { kind: 'bullet', text: 'inserted' },
      { kind: 'bullet', text: 'next' },
    ]);
  });
});

// --- Import / Export ---

// A page that exercises every inline feature and several levels of nesting.
// Used both to verify importPage structure and as the roundtrip corpus.
const COMPLEX_PAGE_MD = [
  '# Project Overview',
  '',
  '- **Goals** for this quarter: ship [[Outliner]] v1',
  '  - TODO Write feature specs',
  '  - DOING Implement *core* editing',
  '    - ~~old approach~~ replaced with ==highlights==',
  '    - Use `contentEditable` for performance',
  '  - DONE Set up repo',
  '- Team: #alice #bob and #charlie',
  '',
  '---',
  '',
  '## Meeting Notes',
  '',
  '- [ ] Follow up with [[Design Team]]',
  '- [x] Review [[API Spec]]',
  '- Discussed **three** options:',
  '  - Option A: fast but fragile',
  '  - Option B: slow but **robust**',
  '  - Option C: ==experimental== approach',
  '',
  '# Resources',
  '',
  '- See [[Architecture Doc]] for background',
  '- Run `npm install` then `npm run dev`',
].join('\n');

describe('exportPage', () => {
  it('serialises a flat list', () => {
    const pageId = getOrCreatePage('export-flat');
    saveBlock({ id: '1', content: 'alpha', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'beta',  pageId, parent: null, order: 1 });
    expect(exportPage(pageId)).toBe('- alpha\n- beta');
  });

  it('exports headings and --- without bullet prefix, with blank lines', () => {
    const pageId = getOrCreatePage('export-headings');
    saveBlock({ id: '1', content: '# Title',      pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'bullet',        pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: '---',           pageId, parent: null, order: 2 });
    saveBlock({ id: '4', content: '## Subtitle',   pageId, parent: null, order: 3 });
    expect(exportPage(pageId)).toBe('# Title\n\n- bullet\n\n---\n\n## Subtitle');
  });

  it('exports paragraph blocks without bullet prefix, with blank line separation', () => {
    const pageId = getOrCreatePage('export-para');
    saveBlock({ id: '1', content: 'intro text', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'bullet item', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'conclusion',  pageId, parent: null, order: 2, type: 'paragraph' });
    expect(exportPage(pageId)).toBe('intro text\n\n- bullet item\n\nconclusion');
  });

  it('indents children by two spaces per depth level', () => {
    const pageId = getOrCreatePage('export-nested');
    saveBlock({ id: '1', content: 'root',        pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child',       pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: 'grandchild',  pageId, parent: '2',  order: 0 });
    saveBlock({ id: '4', content: 'sibling',     pageId, parent: null, order: 1 });
    expect(exportPage(pageId)).toBe(
      '- root\n  - child\n    - grandchild\n- sibling',
    );
  });

  it('clamps orphan nesting to valid CommonMark depth', () => {
    // Simulate orphan: child at depth 1 but no parent at depth 0 before it
    const pageId = getOrCreatePage('export-orphan');
    // Block at depth 1 (child of a "phantom" parent) followed by a root block
    saveBlock({ id: '1', content: 'orphan-child', pageId, parent: null, order: 0 });
    // Manually create a child without a visible parent
    saveBlock({ id: '2', content: 'nested', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'deep', pageId, parent: '2', order: 0 });
    // Export: orphan-child is depth 0, nested is depth 1 (valid), deep is depth 2 (valid)
    expect(exportPage(pageId)).toBe(
      '- orphan-child\n  - nested\n    - deep',
    );
  });

  it('collapses orphan grandchild that skips a depth level', () => {
    const pageId = getOrCreatePage('export-skip');
    // root at depth 0, then directly a grandchild at depth 2 (no depth 1 between)
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });
    // Create grandchild by making a child, then giving the grandchild the child as parent
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'grandchild', pageId, parent: '2', order: 0 });
    saveBlock({ id: '4', content: 'orphan-deep', pageId, parent: null, order: 1 });
    // Create a block that would be at depth 2 with no depth 1 sibling before it
    saveBlock({ id: '5', content: 'nested-under-orphan', pageId, parent: '4', order: 0 });
    saveBlock({ id: '6', content: 'too-deep', pageId, parent: '5', order: 0 });
    // Export: block 4 is a new top-level bullet (depth 0 resets context)
    // block 5 can only be depth 1 (one deeper than 0), block 6 can be depth 2
    expect(exportPage(pageId)).toBe(
      '- root\n  - child\n    - grandchild\n- orphan-deep\n  - nested-under-orphan\n    - too-deep',
    );
  });
});

describe('validateTree', () => {
  it('does nothing to a well-formed tree', () => {
    const pageId = getOrCreatePage('vt-ok');
    saveBlock({ id: '1', content: 'root',   pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child',  pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: 'sibling', pageId, parent: null, order: 1 });
    expect(validateTree(pageId)).toBe(0);
  });

  it('reparents orphan blocks whose parent is missing', () => {
    const pageId = getOrCreatePage('vt-orphan');
    saveBlock({ id: '1', content: 'root',   pageId, parent: null, order: 0 });
    // Block 2 claims parent 'missing' which doesn't exist —
    // buildTree places it at root level, validateTree should confirm parent: null
    saveBlock({ id: '2', content: 'orphan', pageId, parent: 'missing', order: 1 });
    const repaired = validateTree(pageId);
    // The orphan should now have parent: null (at root)
    expect(blockData.value['2'].parent).toBeNull();
    expect(repaired).toBeGreaterThan(0);
  });

  it('repairs depth gaps (grandchild with no child between)', () => {
    const pageId = getOrCreatePage('vt-gap');
    saveBlock({ id: '1', content: 'root',       pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child',      pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: 'grandchild', pageId, parent: '2',  order: 0 });
    saveBlock({ id: '4', content: 'next-root',  pageId, parent: null, order: 1 });
    // Manually skip depth: block 5 claims parent '4' (depth 0 → depth 1),
    // and block 6 claims parent '5' (depth 1 → depth 2). That's valid.
    // But if we give block 5 parent '3' it would be at depth 3... validateTree
    // sees it after 'next-root' (depth 0), so it should be at most depth 1.
    saveBlock({ id: '5', content: 'ok-child', pageId, parent: '4', order: 0 });
    const before = validateTree(pageId);
    expect(before).toBe(0); // already valid
    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.depth)).toEqual([0, 1, 2, 0, 1]);
  });
});

describe('importPage', () => {
  it('creates blocks with correct content and nesting', () => {
    const pageId = getOrCreatePage('import-basic');
    importPage(pageId, '- root\n  - child\n    - grandchild\n- sibling');
    const flat = flattenTree(buildTree(pageId));
    // v2: bullet content carries the `- ` prefix.
    expect(flat.map(b => ({ kind: b.kind, text: b.text, depth: b.depth }))).toEqual([
      { kind: 'bullet', text: 'root',       depth: 0 },
      { kind: 'bullet', text: 'child',      depth: 1 },
      { kind: 'bullet', text: 'grandchild', depth: 2 },
      { kind: 'bullet', text: 'sibling',    depth: 0 },
    ]);
  });

  it('replaces all existing blocks on the page', () => {
    const pageId = getOrCreatePage('import-replace');
    saveBlock({ id: 'old', content: 'old content', pageId, parent: null, order: 0 });
    importPage(pageId, '- fresh');
    const flat = flattenTree(buildTree(pageId));
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ kind: 'bullet', text: 'fresh' });
  });

  it('rebuilds the complex page with correct structure', () => {
    const pageId = getOrCreatePage('import-complex');
    importPage(pageId, COMPLEX_PAGE_MD);
    const flat = flattenTree(buildTree(pageId));
    // Heading at depth 0, its bullets at depth 1, nested bullets deeper
    expect(flat[0]).toMatchObject({ kind: 'heading', text: 'Project Overview', level: 1, depth: 0 });
    expect(flat[1]).toMatchObject({ kind: 'bullet', text: '**Goals** for this quarter: ship [[Outliner]] v1', depth: 1 });
    expect(flat[2]).toMatchObject({ kind: 'bullet', text: 'Write feature specs', depth: 2 });
    expect(flat[4]).toMatchObject({ kind: 'bullet', text: '~~old approach~~ replaced with ==highlights==', depth: 3 });
    expect(flat[8]).toMatchObject({ kind: 'hrule', depth: 0 });
    expect(flat[9]).toMatchObject({ kind: 'heading', text: 'Meeting Notes', level: 2, depth: 1 });
    expect(flat[16]).toMatchObject({ kind: 'heading', text: 'Resources', level: 1, depth: 0 });
    expect(flat).toHaveLength(19);
  });
});

describe('roundtrip: export → import → export', () => {
  it('reproduces the complex page without loss', () => {
    const src = getOrCreatePage('rt-source');
    const dst = getOrCreatePage('rt-dest');
    importPage(src, COMPLEX_PAGE_MD);
    importPage(dst, exportPage(src));
    expect(exportPage(dst)).toBe(exportPage(src));
  });

  it('export(import(markdown)) === markdown', () => {
    const pageId = getOrCreatePage('rt-idempotent');
    importPage(pageId, COMPLEX_PAGE_MD);
    expect(exportPage(pageId)).toBe(COMPLEX_PAGE_MD);
  });
});

describe('exportAllPages', () => {
  it('returns an entry per page with slug-based filename', () => {
    const id1 = getOrCreatePage('My Notes');
    saveBlock({ id: 'b1', content: 'hello', pageId: id1, parent: null, order: 0 });
    const id2 = getOrCreatePage('2026-03-27');
    saveBlock({ id: 'b2', content: 'today', pageId: id2, parent: null, order: 0 });

    const entries = exportAllPages();
    const paths = entries.map(e => e.path);
    expect(paths).toContain('my-notes.md');
    expect(paths).toContain('2026-03-27.md');

    const notes = entries.find(e => e.path === 'my-notes.md')!;
    expect(notes.content).toBe('- hello');
  });
});

describe('tar roundtrip: buildTar → parseTar', () => {
  it('reconstructs the same files from a built tar', async () => {
    const input = [
      { path: 'pages/foo.md', content: '- hello\n- world' },
      { path: 'journals/2026-03-27.md', content: '# Today\n\n- stuff' },
    ];
    const blob = buildTar(input);
    const buf = await blob.arrayBuffer();
    const output = parseTar(buf);
    expect(output).toEqual(input);
  });
});

describe('importAllPages', () => {
  it('creates pages from tar entries and imports their content', () => {
    const files = [
      { path: 'pages/notes.md', content: '- alpha\n- beta' },
      { path: 'journals/2026-03-27.md', content: '- today' },
    ];
    importAllPages(files);

    // Regular page
    const notesPage = Object.values(pageData.value).find(p => p.title === 'notes');
    expect(notesPage).toBeDefined();
    const notesFlat = flattenTree(buildTree(notesPage!.id));
    expect(notesFlat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'alpha' },
      { kind: 'bullet', text: 'beta' },
    ]);

    // Journal page
    const journalPage = Object.values(pageData.value).find(p => p.title === '2026-03-27');
    expect(journalPage).toBeDefined();
    expect(isJournalSlug(journalPage!.title)).toBe(true);
    const journalFlat = flattenTree(buildTree(journalPage!.id));
    expect(journalFlat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'bullet', text: 'today' },
    ]);
  });

  it('full roundtrip: exportAllPages → buildTar → parseTar → importAllPages', async () => {
    // Set up source data
    const id1 = getOrCreatePage('Roundtrip Test');
    saveBlock({ id: 'r1', content: '# Title', pageId: id1, parent: null, order: 0 });
    saveBlock({ id: 'r2', content: 'bullet', pageId: id1, parent: 'r1', order: 0 });

    // Export → tar → parse
    const exported = exportAllPages();
    const blob = buildTar(exported);
    const parsed = parseTar(await blob.arrayBuffer());

    // Reset and re-import
    reset();
    const store = createMockStore();
    await init(store);
    importAllPages(parsed);

    // Verify
    const page = Object.values(pageData.value).find(p => p.title === 'roundtrip-test');
    expect(page).toBeDefined();
    const flat = flattenTree(buildTree(page!.id));
    expect(flat.map(b => ({ kind: b.kind, text: b.text }))).toEqual([
      { kind: 'heading', text: 'Title' },
      { kind: 'bullet', text: 'bullet' },
    ]);
    expect(flat[1].depth).toBe(1);
  });
});

// --- Wiki links ---

describe('parseWikiLinks', () => {
  it('parses links from text', () => {
    expect(parseWikiLinks('see [[Foo]] and [[Bar Baz]]')).toEqual([
      'see ',
      { page: 'Foo' },
      ' and ',
      { page: 'Bar Baz' },
    ]);
  });

  it('handles text without links', () => {
    expect(parseWikiLinks('plain text')).toEqual(['plain text']);
  });

  it('handles empty string', () => {
    expect(parseWikiLinks('')).toEqual([]);
  });

  it('handles link at start and end', () => {
    expect(parseWikiLinks('[[A]]')).toEqual([{ page: 'A' }]);
  });
});

describe('parseAnnotations', () => {
  it('strips [.kanban] and [.hl-N]', () => {
    expect(parseAnnotations('Tasks [.kanban]')).toEqual({ text: 'Tasks', kanban: true, hl: null });
    expect(parseAnnotations('Backlog [.hl-4]')).toEqual({ text: 'Backlog', kanban: false, hl: 4 });
    expect(parseAnnotations('Board [.kanban] [.hl-2]')).toEqual({ text: 'Board', kanban: true, hl: 2 });
    expect(parseAnnotations('No annotations')).toEqual({ text: 'No annotations', kanban: false, hl: null });
  });
});

describe('checkbox parsing', () => {
  it('parseTodoStatus detects unchecked checkbox', () => {
    expect(parseTodoStatus('[ ] buy milk')).toEqual({ status: 'todo', syntax: 'checkbox', text: 'buy milk' });
  });

  it('parseTodoStatus detects checked checkbox', () => {
    expect(parseTodoStatus('[x] buy milk')).toEqual({ status: 'done', syntax: 'checkbox', text: 'buy milk' });
  });

  it('parseTodoStatus detects uppercase X checkbox', () => {
    expect(parseTodoStatus('[X] buy milk')).toEqual({ status: 'done', syntax: 'checkbox', text: 'buy milk' });
  });

  it('cycleTodoStatus toggles unchecked checkbox to checked', () => {
    expect(cycleTodoStatus('[ ] buy milk')).toBe('[x] buy milk');
  });

  it('cycleTodoStatus toggles checked checkbox to unchecked', () => {
    expect(cycleTodoStatus('[x] buy milk')).toBe('[ ] buy milk');
  });

  it('cycleTodoStatus toggles uppercase X checkbox to unchecked', () => {
    expect(cycleTodoStatus('[X] buy milk')).toBe('[ ] buy milk');
  });
});

describe('table detection', () => {
  it('isTableRow detects pipe-delimited rows', () => {
    expect(isTableRow('| a | b | c |')).toBe(true);
    expect(isTableRow('| single |')).toBe(true);
    expect(isTableRow('not a table')).toBe(false);
    expect(isTableRow('|')).toBe(false);
    expect(isTableRow('||')).toBe(false);
  });

  it('isTableSeparator detects separator rows', () => {
    expect(isTableSeparator('|---|---|')).toBe(true);
    expect(isTableSeparator('| --- | --- |')).toBe(true);
    expect(isTableSeparator('|:---:|---:|')).toBe(true);
    expect(isTableSeparator('| a | b |')).toBe(false);
  });

  it('parseTableCells splits a row into cells', () => {
    expect(parseTableCells('| foo | bar | baz |')).toEqual(['foo', 'bar', 'baz']);
  });

  it('parseTableCells returns null for non-table content', () => {
    expect(parseTableCells('not a table')).toBeNull();
  });

  it('parseTableCells returns null for separator rows', () => {
    expect(parseTableCells('|---|---|')).toBeNull();
  });
});

describe('table data model', () => {
  it('createTable creates a table block with cell children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: 'before', pageId, parent: null, order: 0 });

    const tableId = createTable('anchor', [
      ['Name', 'Age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ]);

    expect(blockData.value[tableId].kind).toBe('grid');
    const grid = getTableGrid(tableId);
    expect(grid.length).toBe(3);
    expect(grid[0].cells.length).toBe(2);
    expect(grid[0].cells[0].text).toBe('Name');
    expect(grid[0].cells[1].text).toBe('Age');
    expect(grid[2].cells[0].text).toBe('Bob');
  });

  it('getTableGrid returns rows sorted by order and cells sorted by col', () => {
    const pageId = getOrCreatePage('p');
    const tableId = 'tbl';
    saveBlock({ id: tableId, content: '', pageId, parent: null, order: 0, type: 'table' });
    // Insert in reverse order
    saveBlock({ id: 'c22', content: 'D', pageId, parent: tableId, order: 1, col: 1 });
    saveBlock({ id: 'c11', content: 'A', pageId, parent: tableId, order: 0, col: 0 });
    saveBlock({ id: 'c21', content: 'C', pageId, parent: tableId, order: 1, col: 0 });
    saveBlock({ id: 'c12', content: 'B', pageId, parent: tableId, order: 0, col: 1 });

    const grid = getTableGrid(tableId);
    expect(grid.map(r => r.cells.map(c => c.text))).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });

  it('insertTableRow appends a row with correct column count', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['H1', 'H2', 'H3']]);

    const newCells = insertTableRow(tableId);
    expect(newCells.length).toBe(3);
    const grid = getTableGrid(tableId);
    expect(grid.length).toBe(2);
    expect(grid[1].cells.every(c => c.text === '')).toBe(true);
  });

  it('insertTableRow inserts between existing rows', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['C']]);

    const grid = getTableGrid(tableId);
    insertTableRow(tableId, grid[0].order);
    const updated = getTableGrid(tableId);
    expect(updated.length).toBe(3);
    expect(updated[0].cells[0].text).toBe('A');
    expect(updated[1].cells[0].text).toBe('');
    expect(updated[2].cells[0].text).toBe('C');
  });

  it('insertTableCol appends a column to every row', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B'], ['C', 'D']]);

    insertTableCol(tableId);
    const grid = getTableGrid(tableId);
    expect(grid[0].cells.length).toBe(3);
    expect(grid[1].cells.length).toBe(3);
    expect(grid[0].cells[2].text).toBe('');
  });

  it('insertTableCol inserts between existing columns', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'C'], ['D', 'F']]);

    const grid = getTableGrid(tableId);
    insertTableCol(tableId, grid[0].cells[0].col);
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.text)).toEqual(['A', '', 'C']);
    expect(updated[1].cells.map(c => c.text)).toEqual(['D', '', 'F']);
  });
  it('reorderTableRow moves a row before another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['B'], ['C']]);

    const grid = getTableGrid(tableId);
    // Move row C before row A
    reorderTableRow(tableId, grid[2].order, grid[0].order, 'before');
    const updated = getTableGrid(tableId);
    expect(updated.map(r => r.cells[0].text)).toEqual(['C', 'A', 'B']);
  });

  it('reorderTableRow moves a row after another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['B'], ['C']]);

    const grid = getTableGrid(tableId);
    // Move row A after row C
    reorderTableRow(tableId, grid[0].order, grid[2].order, 'after');
    const updated = getTableGrid(tableId);
    expect(updated.map(r => r.cells[0].text)).toEqual(['B', 'C', 'A']);
  });

  it('reorderTableCol moves a column before another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B', 'C'], ['D', 'E', 'F']]);

    const grid = getTableGrid(tableId);
    const colC = grid[0].cells[2].col!;
    const colA = grid[0].cells[0].col!;
    // Move col C before col A
    reorderTableCol(tableId, colC, colA, 'before');
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.text)).toEqual(['C', 'A', 'B']);
    expect(updated[1].cells.map(c => c.text)).toEqual(['F', 'D', 'E']);
  });

  it('reorderTableCol moves a column after another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B', 'C'], ['D', 'E', 'F']]);

    const grid = getTableGrid(tableId);
    const colA = grid[0].cells[0].col!;
    const colC = grid[0].cells[2].col!;
    // Move col A after col C
    reorderTableCol(tableId, colA, colC, 'after');
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.text)).toEqual(['B', 'C', 'A']);
    expect(updated[1].cells.map(c => c.text)).toEqual(['E', 'F', 'D']);
  });

  it('deleteTableRow removes all cells in a row', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B'], ['C', 'D'], ['E', 'F']]);

    const grid = getTableGrid(tableId);
    deleteTableRow(tableId, grid[1].order);
    const updated = getTableGrid(tableId);
    expect(updated.length).toBe(2);
    expect(updated[0].cells.map(c => c.text)).toEqual(['A', 'B']);
    expect(updated[1].cells.map(c => c.text)).toEqual(['E', 'F']);
  });

  it('deleteTableCol removes all cells in a column', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B', 'C'], ['D', 'E', 'F']]);

    const grid = getTableGrid(tableId);
    const colB = grid[0].cells[1].col!;
    deleteTableCol(tableId, colB);
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.text)).toEqual(['A', 'C']);
    expect(updated[1].cells.map(c => c.text)).toEqual(['D', 'F']);
  });

  it('deleting the last row removes the table block itself', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['only']]);

    deleteTableRow(tableId, 0);
    expect(blockData.value[tableId]).toBeUndefined();
  });
});

describe('table import/export', () => {
  it('parseMarkdownToItems detects table rows', () => {
    const items = parseMarkdownToItems('| A | B |\n|---|---|\n| C | D |');
    expect(items.length).toBe(2); // separator is dropped
    expect(items[0].type).toBe('table-row');
    expect(items[0].cells).toEqual(['A', 'B']);
    expect(items[1].cells).toEqual(['C', 'D']);
  });

  it('importPage creates table blocks from Markdown tables', () => {
    const pageId = getOrCreatePage('table-import');
    importPage(pageId, '| H1 | H2 |\n|---|---|\n| a | b |');
    const flat = flattenTree(buildTree(pageId));
    const table = flat.find(b => b.kind === 'grid');
    expect(table).toBeDefined();
    const grid = getTableGrid(table!.id);
    expect(grid.length).toBe(2);
    expect(grid[0].cells.map(c => c.text)).toEqual(['H1', 'H2']);
    expect(grid[1].cells.map(c => c.text)).toEqual(['a', 'b']);
  });

  it('exportPage serialises table blocks as Markdown tables', () => {
    const pageId = getOrCreatePage('table-export');
    saveBlock({ id: 'anchor', content: 'intro', pageId, parent: null, order: 0 });
    createTable('anchor', [['Name', 'Age'], ['Alice', '30']]);
    const md = exportPage(pageId);
    expect(md).toContain('| Name | Age |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Alice | 30 |');
  });
});


describe('parseHeading', () => {
  it('detects # through ###### and strips the prefix', () => {
    expect(parseHeading('# Title')).toEqual({ level: 1, text: 'Title' });
    expect(parseHeading('## Section')).toEqual({ level: 2, text: 'Section' });
    expect(parseHeading('###### Tiny')).toEqual({ level: 6, text: 'Tiny' });
  });

  it('returns level null for non-heading content', () => {
    expect(parseHeading('plain text')).toEqual({ level: null, text: 'plain text' });
  });

  it('does not match a # tag (no space after #)', () => {
    expect(parseHeading('#notaheading')).toEqual({ level: null, text: '#notaheading' });
  });

  it('preserves inline markdown in the heading text', () => {
    expect(parseHeading('## **bold** heading')).toEqual({ level: 2, text: '**bold** heading' });
  });
});

describe('parseTodoStatus', () => {
  it('parses TODO prefix', () => {
    expect(parseTodoStatus('TODO buy milk')).toEqual({ status: 'todo', syntax: 'keyword', text: 'buy milk' });
  });

  it('parses DOING prefix', () => {
    expect(parseTodoStatus('DOING write code')).toEqual({ status: 'doing', syntax: 'keyword', text: 'write code' });
  });

  it('parses DONE prefix', () => {
    expect(parseTodoStatus('DONE ship it')).toEqual({ status: 'done', syntax: 'keyword', text: 'ship it' });
  });

  it('parses NOW as doing', () => {
    expect(parseTodoStatus('NOW urgent task')).toEqual({ status: 'doing', syntax: 'keyword', text: 'urgent task' });
  });

  it('parses LATER prefix', () => {
    expect(parseTodoStatus('LATER someday')).toEqual({ status: 'later', syntax: 'keyword', text: 'someday' });
  });

  it('parses WAIT prefix', () => {
    expect(parseTodoStatus('WAIT on review')).toEqual({ status: 'wait', syntax: 'keyword', text: 'on review' });
  });

  it('parses CANCELLED prefix', () => {
    expect(parseTodoStatus('CANCELLED old idea')).toEqual({ status: 'cancelled', syntax: 'keyword', text: 'old idea' });
  });

  it('returns null for no prefix', () => {
    expect(parseTodoStatus('regular text')).toEqual({ status: null, syntax: null, text: 'regular text' });
  });
});

describe('cycleTodoStatus', () => {
  it('cycles none → TODO', () => {
    expect(cycleTodoStatus('buy milk')).toBe('TODO buy milk');
  });

  it('cycles TODO → DOING', () => {
    expect(cycleTodoStatus('TODO buy milk')).toBe('DOING buy milk');
  });

  it('cycles DOING → DONE', () => {
    expect(cycleTodoStatus('DOING buy milk')).toBe('DONE buy milk');
  });

  it('cycles DONE → CANCELLED', () => {
    expect(cycleTodoStatus('DONE buy milk')).toBe('CANCELLED buy milk');
  });

  it('cycles CANCELLED → TODO', () => {
    expect(cycleTodoStatus('CANCELLED buy milk')).toBe('TODO buy milk');
  });

  it('cycles LATER → DOING', () => {
    expect(cycleTodoStatus('LATER buy milk')).toBe('DOING buy milk');
  });

  it('cycles WAIT → DOING', () => {
    expect(cycleTodoStatus('WAIT buy milk')).toBe('DOING buy milk');
  });

  it('cycles NOW → DONE (via doing normalisation)', () => {
    expect(cycleTodoStatus('NOW urgent')).toBe('DONE urgent');
  });

  it('full keyword cycle stays in keyword syntax', () => {
    let content = 'buy milk';
    content = cycleTodoStatus(content); expect(content).toBe('TODO buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('DOING buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('DONE buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('CANCELLED buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('TODO buy milk');
  });

  it('full checkbox cycle stays in checkbox syntax', () => {
    let content = '[ ] buy milk';
    content = cycleTodoStatus(content); expect(content).toBe('[x] buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('[ ] buy milk');
    content = cycleTodoStatus(content); expect(content).toBe('[x] buy milk');
    // never produces keyword syntax
  });

  it('checkbox cycle never produces keyword syntax', () => {
    const steps = ['[ ] task', '[x] task'];
    for (const start of steps) {
      const result = cycleTodoStatus(start);
      expect(parseTodoStatus(result).syntax).toBe('checkbox');
    }
  });

  it('keyword cycle never produces checkbox syntax', () => {
    const steps = ['task', 'TODO task', 'DOING task', 'DONE task', 'CANCELLED task'];
    for (const start of steps) {
      const result = cycleTodoStatus(start);
      expect(parseTodoStatus(result).syntax).not.toBe('checkbox');
    }
  });
});

describe('getBacklinks', () => {
  it('finds blocks referencing a page via wiki link', () => {
    const targetId = getOrCreatePage('target');
    const sourceId = getOrCreatePage('source');
    const otherId = getOrCreatePage('other');
    saveBlock({ id: '1', content: 'links to [[target]]', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'no link', pageId: sourceId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'also [[target]]', pageId: otherId, parent: null, order: 0 });
    saveBlock({ id: '4', content: 'self [[target]]', pageId: targetId, parent: null, order: 0 });

    const links = getBacklinks(targetId);
    expect(links.length).toBe(2);
    expect(links.map(l => l.block.id).sort()).toEqual(['1', '3']);
  });

  it('finds blocks referencing a page via #tag', () => {
    const projectId = getOrCreatePage('project');
    const sourceId = getOrCreatePage('source');
    saveBlock({ id: '1', content: 'hello #project', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'no ref', pageId: sourceId, parent: null, order: 1 });

    const links = getBacklinks(projectId);
    expect(links.length).toBe(1);
    expect(links[0].block.id).toBe('1');
  });

  it('finds blocks referencing a page via #[[multi word]] tag', () => {
    const targetId = getOrCreatePage('My Project');
    const sourceId = getOrCreatePage('notes');
    saveBlock({ id: '1', content: 'see #[[My Project]] for details', pageId: sourceId, parent: null, order: 0 });

    const links = getBacklinks(targetId);
    expect(links.length).toBe(1);
    expect(links[0].block.id).toBe('1');
  });

  it('finds blocks referencing a page via hierarchical #tag with slashes', () => {
    const targetId = getOrCreatePage('project/frontend');
    const sourceId = getOrCreatePage('notes');
    saveBlock({ id: '1', content: 'see #project/frontend for details', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'no ref here', pageId: sourceId, parent: null, order: 1 });

    const links = getBacklinks(targetId);
    expect(links.length).toBe(1);
    expect(links[0].block.id).toBe('1');
  });

  it('includes children of referencing blocks', () => {
    const targetId = getOrCreatePage('target');
    const sourceId = getOrCreatePage('source');
    saveBlock({ id: '1', content: 'mentions [[target]]', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: '1a', content: 'child detail', pageId: sourceId, parent: '1', order: 0 });
    saveBlock({ id: '1b', content: 'another child', pageId: sourceId, parent: '1', order: 1 });

    const links = getBacklinks(targetId);
    expect(links.length).toBe(1);
    expect(links[0].block.id).toBe('1');
    expect(links[0].children.length).toBe(2);
    expect(links[0].children.map(c => c.id).sort()).toEqual(['1a', '1b']);
    expect(links[0].children[0].depth).toBe(1);
  });

  it('returns empty for no backlinks', () => {
    const targetId = getOrCreatePage('target');
    const sourceId = getOrCreatePage('source');
    saveBlock({ id: '1', content: 'nothing here', pageId: sourceId, parent: null, order: 0 });
    expect(getBacklinks(targetId)).toEqual([]);
  });
});

// --- Navigation ---

describe('navigateTo', () => {
  it('creates page and first block if page does not exist', () => {
    navigateTo('new-page');
    const pageId = currentPage.value!;
    expect(pageId).toBeTruthy();
    const page = pageList.value.find(p => p.id === pageId)!;
    expect(page).toBeDefined();
    expect(page.title).toBe('new-page');
    const blocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toMatchObject({ kind: 'paragraph', text: '' });
    expect(activeBlockId.value).toBe(blocks[0].id);
  });

  it('does not create block if page already has blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'existing', pageId, parent: null, order: 0 });
    navigateTo('p');
    expect(currentPage.value).toBe(pageId);
    const blocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
    expect(blocks.length).toBe(1);
  });

  it('navigateById sets currentPage to the given page ID', () => {
    const pageId = getOrCreatePage('mypage');
    saveBlock({ id: '1', content: 'x', pageId, parent: null, order: 0 });
    navigateById(pageId);
    expect(currentPage.value).toBe(pageId);
  });

  it('new page from navigateTo is tentative (not persisted)', async () => {
    const store = createMockStore();
    await init(store);

    navigateTo('ghost-page');
    const pageId = currentPage.value!;
    expect(pageId).toBeTruthy();
    expect(isTentativePage(pageId)).toBe(true);

    // Should be in pageData (visible in UI)
    expect(pageData.value[pageId]).toBeDefined();
    // But NOT in the store
    const storeVal = await store.Get({ key: encode('page/' + pageId) });
    expect(storeVal.value).toBeNull();
    // Block should also not be in the store
    const blocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
    expect(blocks.length).toBe(1);
    const blockVal = await store.Get({ key: encode('block/' + blocks[0].id) });
    expect(blockVal.value).toBeNull();
  });

  it('tentative page is persisted when block gets content', async () => {
    const store = createMockStore();
    await init(store);

    navigateTo('will-have-content');
    const pageId = currentPage.value!;
    expect(isTentativePage(pageId)).toBe(true);

    // Simulate typing — save block with content
    const blocks = Object.values(blockData.value).filter(b => b.pageId === pageId);
    saveBlock({ ...blocks[0], content: 'hello world' });

    // Page should now be persisted
    expect(isTentativePage(pageId)).toBe(false);
    const storeVal = await store.Get({ key: encode('page/' + pageId) });
    expect(storeVal.value).not.toBeNull();
    const blockVal = await store.Get({ key: encode('block/' + blocks[0].id) });
    expect(blockVal.value).not.toBeNull();
  });

  it('tentative page is discarded when navigating away without content', async () => {
    const store = createMockStore();
    await init(store);

    navigateTo('temp-page');
    const tempId = currentPage.value!;
    expect(isTentativePage(tempId)).toBe(true);

    // Navigate away without typing
    const otherId = getOrCreatePage('real-page');
    saveBlock({ id: 'r1', content: 'real', pageId: otherId, parent: null, order: 0 });
    navigateTo('real-page');

    // Tentative page should be gone
    expect(pageData.value[tempId]).toBeUndefined();
    const blocks = Object.values(blockData.value).filter(b => b.pageId === tempId);
    expect(blocks.length).toBe(0);
  });

  it('existing page with content is not tentative', () => {
    const pageId = getOrCreatePage('solid');
    saveBlock({ id: '1', content: 'has content', pageId, parent: null, order: 0 });
    navigateTo('solid');
    expect(isTentativePage(pageId)).toBe(false);
  });
});

describe('findPageBySlug', () => {
  it('returns the page matching the slug', () => {
    const pageId = getOrCreatePage('My Page');
    const page = findPageBySlug('my-page');
    expect(page).toBeDefined();
    expect(page!.id).toBe(pageId);
  });

  it('returns undefined when no page has that slug', () => {
    expect(findPageBySlug('does-not-exist')).toBeUndefined();
  });

  it('finds journal pages by their date slug', () => {
    const pageId = getOrCreatePage('2026-03-27');
    const page = findPageBySlug('2026-03-27');
    expect(page).toBeDefined();
    expect(page!.id).toBe(pageId);
  });
});

// --- Page list ---

describe('pageList', () => {
  it('lists all created pages', () => {
    getOrCreatePage('Alpha');
    getOrCreatePage('Beta');
    const pages = pageList.value;
    expect(pages.map(p => p.title)).toContain('Alpha');
    expect(pages.map(p => p.title)).toContain('Beta');
    expect(pages.length).toBe(2);
  });

  it('sorts journals before regular pages, journals newest first', () => {
    getOrCreatePage('2026-03-25');
    getOrCreatePage('2026-03-27');
    getOrCreatePage('Notes');
    const pages = pageList.value;
    expect(pages[0].title).toBe('2026-03-27');
    expect(pages[1].title).toBe('2026-03-25');
    expect(pages[2].title).toBe('Notes');
  });

  it('journal pages are identified by title pattern', () => {
    navigateTo('2026-03-27');
    const page = pageList.value.find(p => p.title === '2026-03-27')!;
    expect(isJournalSlug(page.title)).toBe(true);
  });

  it('regular pages are not journals', () => {
    getOrCreatePage('My Notes');
    const page = pageList.value.find(p => p.title === 'My Notes')!;
    expect(isJournalSlug(page.title)).toBe(false);
  });
});

// --- Journal helpers ---

describe('journal helpers', () => {
  it('isJournalSlug recognizes date slugs', () => {
    expect(isJournalSlug('2026-03-27')).toBe(true);
    expect(isJournalSlug('My Page')).toBe(false);
    expect(isJournalSlug('2026-3-7')).toBe(false);
  });

  it('formatJournalTitle formats dates', () => {
    const title = formatJournalTitle('2026-03-27');
    expect(title).toContain('March');
    expect(title).toContain('27');
    expect(title).toContain('2026');
  });

  it('pageTitle returns formatted title for journal pages', () => {
    navigateTo('2026-03-27');
    const pageId = currentPage.value!;
    expect(pageTitle(pageId)).toContain('March');
  });

  it('pageTitle returns page title for regular pages', () => {
    navigateTo('My Page');
    const pageId = currentPage.value!;
    expect(pageTitle(pageId)).toBe('My Page');
  });
});

// --- Collapse ---

describe('collapse', () => {
  it('hasChildren returns true when block has children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    expect(hasChildren('1')).toBe(true);
    expect(hasChildren('2')).toBe(false);
  });

  it('toggleCollapse toggles local collapsed state', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    expect(isCollapsed('1')).toBe(false);
    toggleCollapse('1');
    expect(isCollapsed('1')).toBe(true);
    toggleCollapse('1');
    expect(isCollapsed('1')).toBe(false);
  });

  it('flattenTree hides children of collapsed blocks', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'root2', pageId, parent: null, order: 1 });
    toggleCollapse('1');

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.id)).toEqual(['1', '3']);
  });

  it('flattenTree shows children when not collapsed', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'root2', pageId, parent: null, order: 1 });

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.id)).toEqual(['1', '2', '3']);
  });

  it('deeply nested collapse only hides direct subtree', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'grandchild', pageId, parent: '2', order: 0 });
    saveBlock({ id: '4', content: 'child2', pageId, parent: '1', order: 1 });
    toggleCollapse('2');

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.id)).toEqual(['1', '2', '4']);
  });

  it('heading blocks with children can be collapsed', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item A',     pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: 'item B',     pageId, parent: '1',  order: 1 });
    saveBlock({ id: '4', content: 'after',      pageId, parent: null, order: 1 });

    expect(hasChildren('1')).toBe(true);

    toggleCollapse('1');
    const collapsed = flattenTree(buildTree(pageId));
    expect(collapsed.map(b => b.id)).toEqual(['1', '4']);

    toggleCollapse('1');
    const expanded = flattenTree(buildTree(pageId));
    expect(expanded.map(b => b.id)).toEqual(['1', '2', '3', '4']);
  });

  it('heading collapse exports without the collapsed children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item A',     pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: '## Sub',     pageId, parent: '1',  order: 1, type: 'paragraph' });
    saveBlock({ id: '4', content: 'item B',     pageId, parent: '3',  order: 0 });

    // Export includes all content (collapse is a UI-only state, export always flattens)
    const md = exportPage(pageId);
    expect(md).toBe('# Section\n\n- item A\n\n## Sub\n\n- item B');
  });
});

// --- Drag and drop ---

describe('moveBlock', () => {
  it('moves block after target as sibling', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'c', pageId, parent: null, order: 2 });

    moveBlock('3', '1', 'after');
    const b3 = blockData.value['3'];
    expect(b3.parent).toBeNull();
    expect(b3.order).toBeGreaterThan(blockData.value['1'].order);
    expect(b3.order).toBeLessThan(blockData.value['2'].order);
  });

  it('moves block before target', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'c', pageId, parent: null, order: 2 });

    moveBlock('3', '1', 'before');
    expect(blockData.value['3'].order).toBeLessThan(blockData.value['1'].order);
  });

  it('nests block as child of target', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });

    moveBlock('2', '1', 'nested');
    expect(blockData.value['2'].parent).toBe('1');
  });

  it('prevents dropping block onto its own descendant', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });

    moveBlock('1', '2', 'nested');
    expect(blockData.value['1'].parent).toBeNull();
  });

  it('prevents dropping block onto itself', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    const orderBefore = blockData.value['1'].order;
    moveBlock('1', '1', 'after');
    expect(blockData.value['1'].order).toBe(orderBefore);
  });

  it('moves subtree with parent block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'child of 2', pageId, parent: '2', order: 0 });

    moveBlock('2', '1', 'before');
    expect(blockData.value['3'].parent).toBe('2');
    expect(blockData.value['2'].order).toBeLessThan(blockData.value['1'].order);
  });

  it('nests as first child when the target already has children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'existing child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'to nest', pageId, parent: null, order: 1 });

    moveBlock('3', '1', 'nested');

    expect(blockData.value['3'].parent).toBe('1');
    expect(blockData.value['3'].order).toBeLessThan(blockData.value['2'].order);
  });

  it('does not nest under a paragraph block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'para', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item', pageId, parent: null, order: 1 });

    moveBlock('2', '1', 'nested');

    expect(blockData.value['2'].parent).toBeNull();
  });

  it('nests under a heading block via drag', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item', pageId, parent: null, order: 1 });

    moveBlock('2', '1', 'nested');

    expect(blockData.value['2'].parent).toBe('1');
  });

  it('moves a table block before a sibling', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'Item', pageId, parent: null, order: 0 });
    const tableId = createTable('1', [['A', 'B'], ['C', 'D']]);

    // Table is after Item; move it before
    moveBlock(tableId, '1', 'before');

    expect(blockData.value[tableId].order).toBeLessThan(blockData.value['1'].order);
    expect(blockData.value[tableId].parent).toBeNull();
    // Cells should stay parented to the table
    const grid = getTableGrid(tableId);
    expect(grid.length).toBe(2);
    expect(grid[0].cells[0].text).toBe('A');
  });

  it('moves a table block nested under another block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'Parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'Sibling', pageId, parent: null, order: 1 });
    const tableId = createTable('2', [['X']]);

    moveBlock(tableId, '1', 'nested');

    expect(blockData.value[tableId].parent).toBe('1');
    const grid = getTableGrid(tableId);
    expect(grid.length).toBe(1);
    expect(grid[0].cells[0].text).toBe('X');
  });

  it('moves a bullet after a table block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'Item', pageId, parent: null, order: 0 });
    const tableId = createTable('1', [['A']]);

    moveBlock('1', tableId, 'after');

    expect(blockData.value['1'].order).toBeGreaterThan(blockData.value[tableId].order);
  });

  it('reorders heading before sibling, captures trailing non-heading as child', () => {
    // # Heading 1
    //   Paragraph         (child of H1)
    //   ## Heading 2      (child of H1)
    //     Another para    (child of H2)
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Heading 1',       pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'Paragraph',          pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: '## Heading 2',       pageId, parent: '1',  order: 1, type: 'paragraph' });
    saveBlock({ id: '4', content: 'Another paragraph',  pageId, parent: '3',  order: 0 });

    // Drag ## Heading 2 BEFORE Paragraph (both children of # Heading 1)
    moveBlock('3', '2', 'before');

    // ## Heading 2 is now before Paragraph under # Heading 1
    expect(blockData.value['3'].parent).toBe('1');
    expect(blockData.value['3'].order).toBeLessThan(blockData.value['2'].order);
    // Paragraph should have been captured as a child of ## Heading 2
    // (non-heading after a heading at the same level)
    expect(blockData.value['2'].parent).toBe('3');
  });

  it('cross-page move updates pageId on all descendants', () => {
    const pageA = getOrCreatePage('Page A');
    const pageB = getOrCreatePage('Page B');

    // Page A has a parent block with two levels of children
    saveBlock({ id: 'p1', content: 'parent', pageId: pageA, parent: null, order: 0 });
    saveBlock({ id: 'c1', content: 'child', pageId: pageA, parent: 'p1', order: 0 });
    saveBlock({ id: 'gc1', content: 'grandchild', pageId: pageA, parent: 'c1', order: 0 });

    // Page B has a target block
    saveBlock({ id: 't1', content: 'target', pageId: pageB, parent: null, order: 0 });

    // Move p1 (with children) to page B, nested under t1
    moveBlock('p1', 't1', 'nested');

    // The moved block should be on page B
    expect(blockData.value['p1'].pageId).toBe(pageB);
    // All descendants should also have their pageId updated
    expect(blockData.value['c1'].pageId).toBe(pageB);
    expect(blockData.value['gc1'].pageId).toBe(pageB);
  });
});

describe('fixHeadingSections', () => {
  it('reparents non-headings that follow a heading', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section',  pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'orphan item', pageId, parent: null, order: 1 });

    fixHeadingSections(pageId, null);

    expect(blockData.value['2'].parent).toBe('1');
  });

  it('does nothing when no headings are present', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });

    fixHeadingSections(pageId, null);

    expect(blockData.value['1'].parent).toBeNull();
    expect(blockData.value['2'].parent).toBeNull();
  });

  it('non-headings before the first heading stay as siblings', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'before',     pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '# Heading',  pageId, parent: null, order: 1, type: 'paragraph' });
    saveBlock({ id: '3', content: 'after',       pageId, parent: null, order: 2 });

    fixHeadingSections(pageId, null);

    // 'before' is before the heading → stays as sibling
    expect(blockData.value['1'].parent).toBeNull();
    // 'after' is after the heading → captured as child
    expect(blockData.value['3'].parent).toBe('2');
  });

  it('multiple headings each capture their own section', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# A',   pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item1', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: '# B',   pageId, parent: null, order: 2, type: 'paragraph' });
    saveBlock({ id: '4', content: 'item2', pageId, parent: null, order: 3 });

    fixHeadingSections(pageId, null);

    expect(blockData.value['2'].parent).toBe('1'); // item1 → child of # A
    expect(blockData.value['4'].parent).toBe('3'); // item2 → child of # B
  });
});

describe('moveBlock + fixHeadingSections integration', () => {
  it('heading moved away releases source level', () => {
    // # Heading (root)
    //   item A   (child of heading)
    //   item B   (child of heading)
    // Move # Heading into another parent → source level (root) has only
    // item A and item B, no heading → they stay as root siblings.
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Heading', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item A',    pageId, parent: '1',  order: 0 });
    saveBlock({ id: '3', content: 'item B',    pageId, parent: '1',  order: 1 });
    saveBlock({ id: '4', content: 'target',    pageId, parent: null, order: 1 });

    // Move heading nested under target (heading can nest under a bullet)
    moveBlock('1', '4', 'nested');

    // Heading's former children (item A, item B) should have been
    // orphaned when heading moved. They still have parent '1' which
    // is now under '4'. That's correct — they moved with the heading.
    expect(blockData.value['1'].parent).toBe('4');
    expect(blockData.value['2'].parent).toBe('1');
    expect(blockData.value['3'].parent).toBe('1');
  });

  it('heading dropped after non-heading captures it', () => {
    // Two root bullets, then drop a heading between them
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'item A',    pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'item B',    pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: '# Section', pageId, parent: null, order: 2, type: 'paragraph' });

    // Move heading AFTER item A (before item B)
    moveBlock('3', '1', 'after');

    // item A is before the heading → stays as root sibling
    expect(blockData.value['1'].parent).toBeNull();
    // heading is at root
    expect(blockData.value['3'].parent).toBeNull();
    // item B was after the heading → captured as child
    expect(blockData.value['2'].parent).toBe('3');
  });
});

describe('undo / redo', () => {
  /** Create a page and set it as current (undo is per-page). */
  function setup() {
    const pageId = getOrCreatePage('p');
    currentPage.value = pageId;
    return pageId;
  }

  it('undoes a single saveBlock', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'original', pageId, parent: null, order: 0 });
    saveBlock({ ...blockData.value['1'], content: 'edited' });

    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'edited' });
    undo();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'original' });
  });

  it('redoes after undo', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'original', pageId, parent: null, order: 0 });
    saveBlock({ ...blockData.value['1'], content: 'edited' });

    undo();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'original' });
    redo();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'edited' });
  });

  it('undoes a grouped operation', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });

    // Simulate Enter: split into two blocks
    beginUndo('split');
    saveBlock({ ...blockData.value['1'], content: 'hello' });
    saveBlock({ id: '2', content: '- world', pageId, parent: null, order: 1 });
    commitUndo();

    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hello' });
    expect(blockData.value['2']).toBeDefined();

    undo();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'hello world' });
    expect(blockData.value['2']).toBeUndefined();
  });

  it('undoes deleteBlock (restores deleted blocks)', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });

    beginUndo('delete');
    deleteBlock('1');
    commitUndo();

    expect(blockData.value['1']).toBeUndefined();
    expect(blockData.value['2']).toBeUndefined();

    undo();
    expect(blockData.value['1']).toBeDefined();
    expect(blockData.value['2']).toBeDefined();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'parent' });
    expect(blockData.value['2']).toMatchObject({ kind: 'bullet', text: 'child' });
    expect(blockData.value['2'].parent).toBe('1');
  });

  it('redo after undo of delete', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'item', pageId, parent: null, order: 0 });

    beginUndo('delete');
    deleteBlock('1');
    commitUndo();

    undo();
    expect(blockData.value['1']).toBeDefined();

    redo();
    expect(blockData.value['1']).toBeUndefined();
  });

  it('new edit clears redo stack', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ ...blockData.value['1'], content: 'b' });

    undo();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'a' });

    // New edit should clear redo
    saveBlock({ ...blockData.value['1'], content: 'c' });
    redo(); // should do nothing
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'c' });
  });

  it('undoes moveBlock', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'A', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'B', pageId, parent: null, order: 1 });

    beginUndo('move');
    moveBlock('2', '1', 'before');
    commitUndo();

    expect(blockData.value['2'].order).toBeLessThan(blockData.value['1'].order);

    undo();
    expect(blockData.value['2'].order).toBeGreaterThan(blockData.value['1'].order);
  });
});

// --- Batch accumulation ---

describe('batch accumulation', () => {
  function createSpyStore() {
    const inner = createMockStore();
    const calls: { method: string; count?: number }[] = [];
    const spy: Store & { calls: typeof calls } = {
      calls,
      List: (p) => inner.List(p),
      Get: (p) => inner.Get(p),
      Put: (p) => { calls.push({ method: 'Put' }); return inner.Put(p); },
      Delete: (p) => { calls.push({ method: 'Delete' }); return inner.Delete(p); },
      Batch: (p) => { calls.push({ method: 'Batch', count: p.ops.length }); return inner.Batch(p); },
      subscribe: (s, p, cb) => inner.subscribe(s, p, cb),
    };
    return spy;
  }

  it('undo group flushes as a single Batch', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    const pageId = getOrCreatePage('test');
    saveBlock({ id: 'a', content: 'hello', pageId, parent: null, order: 0 });
    spy.calls.length = 0; // clear setup calls

    beginUndo('split');
    saveBlock({ ...blockData.value['a'], content: 'hel' });
    createBlockAfter('a', '- lo');
    commitUndo();

    // Should be exactly one Batch call, no individual Put/Delete
    const batches = spy.calls.filter(c => c.method === 'Batch');
    const puts = spy.calls.filter(c => c.method === 'Put');
    const deletes = spy.calls.filter(c => c.method === 'Delete');

    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBeGreaterThanOrEqual(2); // at least 2 block puts
    expect(puts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('operations outside undo group write immediately', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    const pageId = getOrCreatePage('test');
    spy.calls.length = 0;

    saveBlock({ id: 'x', content: 'direct', pageId, parent: null, order: 0 });

    const puts = spy.calls.filter(c => c.method === 'Put');
    const batches = spy.calls.filter(c => c.method === 'Batch');

    expect(puts).toHaveLength(1);
    expect(batches).toHaveLength(0);
  });

  it('deletePage uses a single Batch when inside undo group', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    const pageId = getOrCreatePage('doomed');
    saveBlock({ id: 'd1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: 'd2', content: 'b', pageId, parent: null, order: 1 });
    spy.calls.length = 0;

    beginUndo('delete page');
    deletePage(pageId);
    commitUndo();

    const batches = spy.calls.filter(c => c.method === 'Batch');
    const deletes = spy.calls.filter(c => c.method === 'Delete');

    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBeGreaterThanOrEqual(3); // page + 2 blocks
    expect(deletes).toHaveLength(0);
  });

  it('undo flushes as a single Batch', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    const pageId = getOrCreatePage('test');
    currentPage.value = pageId;
    saveBlock({ id: 'u1', content: 'hello', pageId, parent: null, order: 0 });

    // Split block via undo group (creates 2 patches)
    beginUndo('split');
    saveBlock({ ...blockData.value['u1'], content: 'hel' });
    createBlockAfter('u1', '- lo');
    commitUndo();

    spy.calls.length = 0;
    undo();

    const batches = spy.calls.filter(c => c.method === 'Batch');
    const puts = spy.calls.filter(c => c.method === 'Put');
    const deletes = spy.calls.filter(c => c.method === 'Delete');

    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBeGreaterThanOrEqual(2); // restore original + delete new
    expect(puts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('redo flushes as a single Batch', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    const pageId = getOrCreatePage('test');
    currentPage.value = pageId;
    saveBlock({ id: 'r1', content: 'hello', pageId, parent: null, order: 0 });

    beginUndo('split');
    saveBlock({ ...blockData.value['r1'], content: 'hel' });
    createBlockAfter('r1', '- lo');
    commitUndo();

    undo();
    spy.calls.length = 0;
    redo();

    const batches = spy.calls.filter(c => c.method === 'Batch');
    const puts = spy.calls.filter(c => c.method === 'Put');
    const deletes = spy.calls.filter(c => c.method === 'Delete');

    expect(batches).toHaveLength(1);
    expect(batches[0].count).toBeGreaterThanOrEqual(2);
    expect(puts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it('materializePage puts land in the undo group Batch', async () => {
    reset();
    const spy = createSpyStore();
    await init(spy);

    // Create a tentative page via navigation
    navigateTo('Tentative Test');
    const pageId = currentPage.value!;
    const seedId = Object.keys(blockData.value).find(
      id => blockData.value[id].pageId === pageId,
    )!;

    spy.calls.length = 0;

    // Saving content inside an undo group triggers materializePage
    beginUndo('add content');
    saveBlock({ ...blockData.value[seedId], content: 'hello world' });
    commitUndo();

    const batches = spy.calls.filter(c => c.method === 'Batch');
    const puts = spy.calls.filter(c => c.method === 'Put');

    expect(batches).toHaveLength(1);
    // Should contain at least: the page put (from materialize) + the block put
    expect(batches[0].count).toBeGreaterThanOrEqual(2);
    expect(puts).toHaveLength(0);
  });
});

// --- Carry forward ---

describe('carryForward', () => {
  let sourceId: string;
  let targetId: string;

  beforeEach(() => {
    sourceId = getOrCreatePage('2026-04-07');
    targetId = getOrCreatePage('2026-04-08');
  });

  it('carries forward a single incomplete todo', () => {
    saveBlock({ id: 's1', content: '- [ ] Fix bug', pageId: sourceId, parent: null, order: 0 });

    carryForward('s1', targetId);

    // Source block gets link, no longer a todo
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Fix bug' });
    // New block created on target page with the todo content
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(1);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Fix bug' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
  });

  it('carries forward a keyword todo (TODO, DOING)', () => {
    saveBlock({ id: 's1', content: '- TODO Write tests', pageId: sourceId, parent: null, order: 0 });

    carryForward('s1', targetId);

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Write tests' });
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(1);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Write tests' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'keyword' });
  });

  it('skips complete children, carries incomplete children', () => {
    saveBlock({ id: 's1', content: '- [ ] Project X', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [x] Research', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[ ] Prototype', pageId: sourceId, parent: 's1', order: 1 });

    carryForward('s1', targetId);

    // Source: root and incomplete child get links, complete child untouched
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Project X' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Research' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Prototype' });

    // Target: root + incomplete child, no complete child
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(2);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Project X' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'Prototype' });
    expect(targetBlocks[1].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(targetBlocks[1].parent).toBe(targetBlocks[0].id);
  });

  it('prunes entire subtree of a complete block', () => {
    saveBlock({ id: 's1', content: '[x] Done task', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [ ] Leftover subtask', pageId: sourceId, parent: 's1', order: 0 });

    // Carry forward on a complete block should be a no-op
    carryForward('s1', targetId);

    // Source unchanged
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'Done task' });
    expect(blockData.value['s1'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Leftover subtask' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    // Nothing on target
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(0);
  });

  it('carries forward non-todo children as context', () => {
    saveBlock({ id: 's1', content: '- [ ] Fix bug', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- Repro steps: open settings', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '- [ ] Write fix', pageId: sourceId, parent: 's1', order: 1 });

    carryForward('s1', targetId);

    // Source: todos get links, non-todo child is deleted (moved)
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Fix bug' });
    expect(blockData.value['s2']).toBeUndefined(); // moved to target
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Write fix' });

    // Target: root + context + incomplete child
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(3);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Fix bug' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'Repro steps: open settings' });
    expect(targetBlocks[2]).toMatchObject({ kind: 'bullet', text: 'Write fix' });
    expect(targetBlocks[2].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    // All children of the root
    expect(targetBlocks[1].parent).toBe(targetBlocks[0].id);
    expect(targetBlocks[2].parent).toBe(targetBlocks[0].id);
  });

  it('handles deeply nested incomplete tasks', () => {
    saveBlock({ id: 's1', content: '[ ] Project', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '[ ] Phase 1', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[x] Mockup', pageId: sourceId, parent: 's2', order: 0 });
    saveBlock({ id: 's4', content: '[ ] Implement', pageId: sourceId, parent: 's2', order: 1 });

    carryForward('s1', targetId);

    // Target: Project > Phase 1 > Implement (Mockup pruned)
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(3);
    const names = targetBlocks.map(b => b.text).sort();
    expect(names).toContain('Project');
    expect(names).toContain('Phase 1');
    expect(names).toContain('Implement');
    // Mockup should NOT be on target
    expect(names).not.toContain('Mockup');
  });

  it('preserves nesting structure on target page', () => {
    saveBlock({ id: 's1', content: '[ ] Root', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '[ ] Child', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[ ] Grandchild', pageId: sourceId, parent: 's2', order: 0 });

    carryForward('s1', targetId);

    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(3);

    const root = targetBlocks.find(b => b.text === 'Root')!;
    const child = targetBlocks.find(b => b.text === 'Child')!;
    const grandchild = targetBlocks.find(b => b.text === 'Grandchild')!;

    expect(root.parent).toBeNull();
    expect(child.parent).toBe(root.id);
    expect(grandchild.parent).toBe(child.id);
  });

  it('does not double-carry a block already marked with a link', () => {
    saveBlock({ id: 's1', content: '- [[2026-04-07]] Fix bug', pageId: sourceId, parent: null, order: 0 });

    carryForward('s1', targetId);

    // Should be a no-op — block is not a todo
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(0);
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-07]] Fix bug' });
  });

  it('carries forward into a page that already has blocks', () => {
    saveBlock({ id: 't1', content: '[ ] Existing task', pageId: targetId, parent: null, order: 0 });
    saveBlock({ id: 's1', content: '- [ ] New task', pageId: sourceId, parent: null, order: 0 });

    carryForward('s1', targetId);

    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(2);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Existing task' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    // New task should be after existing
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'New task' });
    expect(targetBlocks[1].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
  });

  it('whole operation is one undo group', () => {
    currentPage.value = sourceId;
    saveBlock({ id: 's1', content: '[ ] Task', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [ ] Subtask', pageId: sourceId, parent: 's1', order: 0 });

    carryForward('s1', targetId);

    // Verify blocks were carried
    const targetBefore = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBefore).toHaveLength(2);

    // Undo should reverse the entire operation
    undo();

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'Task' });
    expect(blockData.value['s1'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Subtask' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    const targetAfter = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetAfter).toHaveLength(0);
  });

  it('carries forward a non-todo parent that contains incomplete todos', () => {
    saveBlock({ id: 's1', content: 'Project X', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [ ] Task A', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '- [x] Task B', pageId: sourceId, parent: 's1', order: 1 });

    carryForward('s1', targetId);

    // Source: root gets link marker, complete child untouched, incomplete child gets link
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Project X' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Task A' });
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: 'Task B' });
    expect(blockData.value['s3'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });

    // Target: root + incomplete child (complete child pruned)
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(2);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Project X' });
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'Task A' });
    expect(targetBlocks[1].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(targetBlocks[1].parent).toBe(targetBlocks[0].id);
  });

  it('skips a non-todo parent with no incomplete todo descendants', () => {
    saveBlock({ id: 's1', content: 'Project X', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '[x] Done', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '- Just a note', pageId: sourceId, parent: 's1', order: 1 });

    carryForward('s1', targetId);

    // No-op: no incomplete todos anywhere in subtree
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'Project X' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Done' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: 'Just a note' });
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(0);
  });

  it('carries forward non-todo parent with deeply nested incomplete todo', () => {
    saveBlock({ id: 's1', content: 'Project', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: 'Phase 1', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[ ] Deep task', pageId: sourceId, parent: 's2', order: 0 });

    carryForward('s1', targetId);

    // Source: all three get markers (root and Phase 1 are non-todo, deep task is todo)
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Project' });
    expect(blockData.value['s2']).toBeUndefined(); // non-todo child moved
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Deep task' });

    // Target: full structure preserved
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(3);
    const root = targetBlocks.find(b => b.text === 'Project')!;
    const phase = targetBlocks.find(b => b.text === 'Phase 1')!;
    const task = targetBlocks.find(b => b.text === 'Deep task')!;
    expect(root.parent).toBeNull();
    expect(phase.parent).toBe(root.id);
    expect(task.parent).toBe(phase.id);
  });
});

describe('carryForwardAll', () => {
  it('carries forward all incomplete root todos from a page', () => {
    const sourceId = getOrCreatePage('2026-04-07');
    const targetId = getOrCreatePage('2026-04-08');

    saveBlock({ id: 's1', content: '- [ ] Task A', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [x] Done B', pageId: sourceId, parent: null, order: 1 });
    saveBlock({ id: 's3', content: '[ ] Task C', pageId: sourceId, parent: null, order: 2 });
    saveBlock({ id: 's4', content: '- Plain text', pageId: sourceId, parent: null, order: 3 });

    carryForwardAll(sourceId, targetId);

    // Source: incomplete todos get links, complete and plain untouched
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Task A' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Done B' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Task C' });
    expect(blockData.value['s4']).toMatchObject({ kind: 'bullet', text: 'Plain text' });

    // Target: only the two incomplete todos
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(2);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'Task A' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'Task C' });
    expect(targetBlocks[1].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
  });

  it('is a no-op when no incomplete todos exist', () => {
    const sourceId = getOrCreatePage('2026-04-07');
    const targetId = getOrCreatePage('2026-04-08');

    saveBlock({ id: 's1', content: '[x] Done', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- Just text', pageId: sourceId, parent: null, order: 1 });

    carryForwardAll(sourceId, targetId);

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'Done' });
    expect(blockData.value['s1'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'Just text' });
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(0);
  });

  it('whole page carry forward is one undo group', () => {
    const sourceId = getOrCreatePage('2026-04-07');
    const targetId = getOrCreatePage('2026-04-08');
    currentPage.value = sourceId;

    saveBlock({ id: 's1', content: '[ ] A', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- [ ] B', pageId: sourceId, parent: null, order: 1 });

    carryForwardAll(sourceId, targetId);

    expect(Object.values(blockData.value).filter(b => b.pageId === targetId)).toHaveLength(2);

    undo();

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'A' });
    expect(blockData.value['s1'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: 'B' });
    expect(blockData.value['s2'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    expect(Object.values(blockData.value).filter(b => b.pageId === targetId)).toHaveLength(0);
  });

  it('carries forward non-todo parent roots with todo descendants', () => {
    const sourceId = getOrCreatePage('2026-04-07');
    const targetId = getOrCreatePage('2026-04-08');

    saveBlock({ id: 's1', content: '[ ] Flat todo', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: 'Project X', pageId: sourceId, parent: null, order: 1 });
    saveBlock({ id: 's3', content: '[ ] Nested todo', pageId: sourceId, parent: 's2', order: 0 });

    carryForwardAll(sourceId, targetId);

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Flat todo' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Project X' });
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Nested todo' });

    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(3);

    const flatTodo = targetBlocks.find(b => b.text === 'Flat todo')!;
    const project = targetBlocks.find(b => b.text === 'Project X')!;
    const nested = targetBlocks.find(b => b.text === 'Nested todo')!;

    expect(flatTodo.parent).toBeNull();
    expect(project.parent).toBeNull();
    expect(nested.parent).toBe(project.id);
    // Flat todo should come before project (preserves source order)
    expect(flatTodo.order).toBeLessThan(project.order);
  });
});

// --- Carry forward edge cases ---

describe('carryForward edge cases', () => {
  let sourceId: string;
  let targetId: string;

  beforeEach(() => {
    sourceId = getOrCreatePage('2026-04-07');
    targetId = getOrCreatePage('2026-04-08');
  });

  it('is a no-op when carrying forward to the same page', () => {
    saveBlock({ id: 's1', content: '[ ] Task', pageId: sourceId, parent: null, order: 0 });

    carryForward('s1', sourceId);

    // Block should be unchanged — no link to itself, no duplicates
    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: 'Task' });
    expect(blockData.value['s1'].todo).toMatchObject({ status: 'todo', syntax: 'checkbox' });
    const allOnSource = Object.values(blockData.value).filter(b => b.pageId === sourceId);
    expect(allOnSource).toHaveLength(1);
  });

  it('carries forward DOING and WAIT statuses', () => {
    saveBlock({ id: 's1', content: '- DOING In progress', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: '- WAIT Blocked', pageId: sourceId, parent: null, order: 1 });

    carryForward('s1', targetId);
    carryForward('s2', targetId);

    expect(blockData.value['s1']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] In progress' });
    expect(blockData.value['s2']).toMatchObject({ kind: 'bullet', text: '[[2026-04-08]] Blocked' });

    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(2);
    expect(targetBlocks[0]).toMatchObject({ kind: 'bullet', text: 'In progress' });
    expect(targetBlocks[0].todo).toMatchObject({ status: 'doing', syntax: 'keyword' });
    expect(targetBlocks[1]).toMatchObject({ kind: 'bullet', text: 'Blocked' });
    expect(targetBlocks[1].todo).toMatchObject({ status: 'wait', syntax: 'keyword' });
  });

  it('handles interleaved complete, non-todo, and incomplete children', () => {
    saveBlock({ id: 's1', content: '[ ] Task', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: 'notes A', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[x] Done step', pageId: sourceId, parent: 's1', order: 1 });
    saveBlock({ id: 's4', content: 'notes B', pageId: sourceId, parent: 's1', order: 2 });
    saveBlock({ id: 's5', content: '[ ] Pending', pageId: sourceId, parent: 's1', order: 3 });

    carryForward('s1', targetId);

    // Source: complete child stays, non-todo children moved, todos get links
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: 'Done step' });
    expect(blockData.value['s3'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s2']).toBeUndefined(); // moved
    expect(blockData.value['s4']).toBeUndefined(); // moved

    // Target: task + notes A + notes B + pending (done step pruned)
    const targetBlocks = Object.values(blockData.value)
      .filter(b => b.pageId === targetId)
      .sort((a, b) => a.order - b.order);
    expect(targetBlocks).toHaveLength(4);
    const texts = targetBlocks.map(b => b.text);
    expect(texts).toContain('Task');
    expect(texts).toContain('notes A');
    expect(texts).toContain('notes B');
    expect(texts).toContain('Pending');
    expect(texts).not.toContain('Done step');
  });

  it('reparents complete children when non-todo intermediate is deleted', () => {
    saveBlock({ id: 's1', content: '[ ] Root', pageId: sourceId, parent: null, order: 0 });
    saveBlock({ id: 's2', content: 'Phase 1', pageId: sourceId, parent: 's1', order: 0 });
    saveBlock({ id: 's3', content: '[x] Done thing', pageId: sourceId, parent: 's2', order: 0 });
    saveBlock({ id: 's4', content: '[ ] Pending thing', pageId: sourceId, parent: 's2', order: 1 });

    carryForward('s1', targetId);

    // Phase 1 (non-todo) was deleted from source
    expect(blockData.value['s2']).toBeUndefined();
    // [x] Done thing should be reparented to s1 (Root) on source
    expect(blockData.value['s3']).toMatchObject({ kind: 'bullet', text: 'Done thing' });
    expect(blockData.value['s3'].todo).toMatchObject({ status: 'done', syntax: 'checkbox' });
    expect(blockData.value['s3'].parent).toBe('s1');

    // Target should have Root > Phase 1 > Pending thing
    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(3);
    const root = targetBlocks.find(b => b.text === 'Root')!;
    const phase = targetBlocks.find(b => b.text === 'Phase 1')!;
    const pending = targetBlocks.find(b => b.text === 'Pending thing')!;
    expect(phase.parent).toBe(root.id);
    expect(pending.parent).toBe(phase.id);
  });

  it('preserves block kind on copy (content stays bare for paragraph-style todos)', () => {
    saveBlock({ id: 's1', content: '[ ] Task', pageId: sourceId, parent: null, order: 0, type: 'paragraph' });

    carryForward('s1', targetId);

    const targetBlocks = Object.values(blockData.value).filter(b => b.pageId === targetId);
    expect(targetBlocks).toHaveLength(1);
    // In v2 there's no `type` field; kind comes from content prefix.
    // A bare-todo paragraph stays bare on copy.
    expect(targetBlocks[0].text).toBe('[ ] Task');
    expect(targetBlocks[0].kind).toBe('paragraph');
  });
});

// --- Deterministic page IDs ---

describe('deterministic page IDs', () => {
  it('getOrCreatePage produces the same ID for the same title', () => {
    const id1 = getOrCreatePage('My Page');
    // Reset and re-init to simulate a second device
    reset();
    const store = createMockStore();
    // Don't init from store (empty) — just call getOrCreatePage again
    const id2 = getOrCreatePage('My Page');
    expect(id2).toBe(id1);
  });

  it('journal pages get deterministic IDs based on slug + folder', () => {
    const id1 = getOrCreatePage('2026-04-16');
    reset();
    const id2 = getOrCreatePage('2026-04-16');
    expect(id2).toBe(id1);
  });

});

// --- Page dedup ---

describe('page dedup on init', () => {
  it('merges duplicate pages, keeping earliest createdAt', async () => {
    const store = createMockStore();
    // Pre-seed two pages with the same title but different UUIDs
    const page1 = { title: 'My Page', slug: 'my-page', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    const page2 = { title: 'My Page', slug: 'my-page', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
    await store.Put({ key: encode('page/uuid-aaa'), value: encode(JSON.stringify(page1)) });
    await store.Put({ key: encode('page/uuid-bbb'), value: encode(JSON.stringify(page2)) });
    // Add blocks under each
    await store.Put({ key: encode('block/b1'), value: encode(JSON.stringify({ content: '- block1', pageId: 'uuid-aaa', parent: null, order: 0 })) });
    await store.Put({ key: encode('block/b2'), value: encode(JSON.stringify({ content: '- block2', pageId: 'uuid-bbb', parent: null, order: 0 })) });

    reset();
    await init(store);

    // Only one page should survive
    const pages = Object.values(pageData.value);
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe('uuid-aaa'); // earliest createdAt wins
    // Both blocks should now belong to the surviving page
    expect(blockData.value['b1'].pageId).toBe('uuid-aaa');
    expect(blockData.value['b2'].pageId).toBe('uuid-aaa');
  });

  it('does not merge pages with different titles', async () => {
    const store = createMockStore();
    await store.Put({ key: encode('page/p1'), value: encode(JSON.stringify({ title: 'Alpha', slug: 'alpha', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })) });
    await store.Put({ key: encode('page/p2'), value: encode(JSON.stringify({ title: 'Beta', slug: 'beta', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })) });

    reset();
    await init(store);

    expect(Object.keys(pageData.value)).toHaveLength(2);
  });

  it('dedup is case-insensitive', async () => {
    const store = createMockStore();
    await store.Put({ key: encode('page/p1'), value: encode(JSON.stringify({ title: 'Notes', slug: 'notes', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })) });
    await store.Put({ key: encode('page/p2'), value: encode(JSON.stringify({ title: 'notes', slug: 'notes', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' })) });

    reset();
    await init(store);

    expect(Object.keys(pageData.value)).toHaveLength(1);
  });
});

describe('page dedup on watch', () => {
  it('merges a duplicate page arriving via sync', async () => {
    const store = createMockStore();
    await init(store);

    const pageId = getOrCreatePage('My Page');
    saveBlock({ id: 'b1', content: '- hello', pageId, parent: null, order: 0 });

    // Simulate another device creating the same page with a different UUID
    const dupPage = { title: 'My Page', slug: 'my-page', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    // Write a block under the duplicate before the page arrives
    const dupBlock = { content: '- from other device', pageId: 'remote-uuid', parent: null, order: 0 };
    await store.Put({ key: encode('block/b2'), value: encode(JSON.stringify(dupBlock)) });
    // Now the duplicate page arrives via sync (triggers watch handler)
    await store.Put({ key: encode('page/remote-uuid'), value: encode(JSON.stringify(dupPage)) });

    // Should have merged: only one page, duplicate deleted
    const pages = Object.values(pageData.value);
    const myPages = pages.filter(p => p.title.toLowerCase() === 'my page');
    expect(myPages).toHaveLength(1);
    // The remote block should have been reparented
    expect(blockData.value['b2'].pageId).toBe(myPages[0].id);
  });
});
