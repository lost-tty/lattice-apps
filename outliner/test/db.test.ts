import { describe, it, expect, beforeEach } from 'vitest';
import { createMockStore } from '../src/mock-sdk';
import { buildTar, parseTar } from '../src/tar';
import {
  init, reset, pageData, blockData,
  savePage, getOrCreatePage, deletePage,
  saveBlock, deleteBlock,
  buildTree, flattenTree, getSiblings,
  createBlockAfter, createChildBlock, indentBlock, outdentBlock, removeBlock, joinBlockWithPrevious,
  parseMarkdownToItems, insertBlocksAfter,
  fixHeadingSections,
  exportPage, exportAllPages, importPage, importAllPages,
  hasChildren, toggleCollapse, isCollapsed, collapsedBlocks, moveBlock, validateTree,
  parseWikiLinks, renderContent, isTableRow, isTableSeparator, parseTableCells, parseHeading, parseTodoStatus, cycleTodoStatus,
  getTableGrid, createTable, insertTableRow, insertTableCol, reorderTableRow, reorderTableCol, deleteTableRow, deleteTableCol,
  getBacklinks,
  navigateTo, navigateById, findPageBySlug, currentPage, activeBlockId,
  isJournalSlug, formatJournalTitle, pageTitle, pageList, isTentativePage,
  beginUndo, commitUndo, undo, redo,
  parseAnnotations,
} from '../src/db';

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
      value: encode(JSON.stringify({ content: 'hello', pageId: 'pg1', parent: null, order: 0 })),
    });
    await init(store);

    expect(pageData.value['pg1']).toBeDefined();
    expect(pageData.value['pg1'].title).toBe('test');
    expect(blockData.value['abc']).toBeDefined();
    expect(blockData.value['abc'].content).toBe('hello');
    expect(blockData.value['abc'].pageId).toBe('pg1');
  });

  it('saveBlock updates signal and store', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hi', pageId, parent: null, order: 0 });
    expect(blockData.value['1'].content).toBe('hi');
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

    const newId = createBlockAfter('1', 'between');
    const block = blockData.value[newId];
    expect(block.content).toBe('between');
    expect(block.order).toBeGreaterThan(0);
    expect(block.order).toBeLessThan(1);
    expect(block.parent).toBeNull();
    expect(block.pageId).toBe(pageId);
  });

  it('creates a block at the end', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'only', pageId, parent: null, order: 0 });

    const newId = createBlockAfter('1', 'after');
    expect(blockData.value[newId].order).toBeGreaterThan(0);
  });

  it('preserves parent context', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });

    const newId = createBlockAfter('2', 'new child');
    expect(blockData.value[newId].parent).toBe('1');
  });

  it('simulated Enter: split block and activeBlockId points to new block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });

    // Simulate Enter at offset 5: "hello" stays, " world" goes to new block
    const before = 'hello';
    const after = ' world';
    saveBlock({ ...blockData.value['1'], content: before });
    const newId = createBlockAfter('1', after);
    activeBlockId.value = newId;

    expect(blockData.value['1'].content).toBe('hello');
    expect(blockData.value[newId].content).toBe(' world');
    expect(activeBlockId.value).toBe(newId);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.content)).toEqual(['hello', ' world']);
  });
});

describe('createChildBlock', () => {
  it('creates a block as the last child of the parent', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'existing', pageId, parent: '1', order: 0 });

    const newId = createChildBlock('1', 'new child');
    const block = blockData.value[newId];
    expect(block.parent).toBe('1');
    expect(block.content).toBe('new child');
    expect(block.order).toBeGreaterThan(blockData.value['2'].order);
  });

  it('creates first child when parent has no children', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });

    const newId = createChildBlock('1', 'first');
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
    expect(blockData.value['1'].content).toBe('helloworld');
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(5);
  });

  it('preserves existing trailing space', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello ', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'world', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('2', 'world');
    expect(result).not.toBeNull();
    expect(result!.prevId).toBe('1');
    expect(blockData.value['1'].content).toBe('hello world');
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(6);
  });

  it('returns null for the first block on the page', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'only block', pageId, parent: null, order: 0 });

    const result = joinBlockWithPrevious('1', 'only block');
    expect(result).toBeNull();
    expect(blockData.value['1'].content).toBe('only block');
  });

  it('works across nesting levels (previous in flat tree order)', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'parent', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'child', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'next', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('3', 'next');
    expect(result!.prevId).toBe('2');
    expect(blockData.value['2'].content).toBe('childnext');
    expect(blockData.value['3']).toBeUndefined();
  });

  it('joins empty block with previous block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: '', pageId, parent: null, order: 1 });

    const result = joinBlockWithPrevious('2', '');
    expect(result).not.toBeNull();
    expect(result!.prevId).toBe('1');
    expect(blockData.value['1'].content).toBe('hello');
    expect(blockData.value['2']).toBeUndefined();
    expect(result!.cursorPos).toBe(5);
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
    // Continuation lines join with their bullet block
    expect(flat.map(b => ({ content: b.content, depth: b.depth }))).toEqual([
      { content: 'parent\ncontinuation\nmore', depth: 0 },
      { content: 'child\nchild cont',          depth: 1 },
    ]);
    // Re-export should produce valid CommonMark with indented continuations
    const md = exportPage(pageId);
    expect(md).toBe('- parent\n  continuation\n  more\n  - child\n    child cont');
  });
});

describe('insertBlocksAfter', () => {
  it('inserts flat items as siblings after the anchor', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'z', pageId, parent: null, order: 1 });

    insertBlocksAfter('1', [
      { content: 'b', relativeDepth: 0 },
      { content: 'c', relativeDepth: 0 },
    ]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.content)).toEqual(['a', 'b', 'c', 'z']);
  });

  it('inserts nested items at the correct depth', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'root', pageId, parent: null, order: 0 });

    insertBlocksAfter('1', [
      { content: 'sibling',     relativeDepth: 0 },
      { content: 'child',       relativeDepth: 1 },
      { content: 'grandchild',  relativeDepth: 2 },
      { content: 'next',        relativeDepth: 0 },
    ]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => ({ content: b.content, depth: b.depth }))).toEqual([
      { content: 'root',       depth: 0 },
      { content: 'sibling',    depth: 0 },
      { content: 'child',      depth: 1 },
      { content: 'grandchild', depth: 2 },
      { content: 'next',       depth: 0 },
    ]);
  });

  it('returns the id of the last inserted block', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });

    const lastId = insertBlocksAfter('1', [
      { content: 'b', relativeDepth: 0 },
      { content: 'c', relativeDepth: 0 },
    ]);

    expect(blockData.value[lastId].content).toBe('c');
  });

  it('inserts between existing siblings, not after them', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'a', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'b', pageId, parent: null, order: 1 });
    saveBlock({ id: '3', content: 'z', pageId, parent: null, order: 2 });

    insertBlocksAfter('2', [{ content: 'inserted', relativeDepth: 0 }]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.content)).toEqual(['a', 'b', 'inserted', 'z']);
  });

  it('depth-0 items land after the anchor\'s existing children in flat order', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'anchor', pageId, parent: null,  order: 0 });
    saveBlock({ id: '2', content: 'child',  pageId, parent: '1',   order: 0 });
    saveBlock({ id: '3', content: 'next',   pageId, parent: null,  order: 1 });

    insertBlocksAfter('1', [{ content: 'inserted', relativeDepth: 0 }]);

    const flat = flattenTree(buildTree(pageId));
    expect(flat.map(b => b.content)).toEqual(['anchor', 'child', 'inserted', 'next']);
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
    expect(flat.map(b => ({ content: b.content, depth: b.depth }))).toEqual([
      { content: 'root',       depth: 0 },
      { content: 'child',      depth: 1 },
      { content: 'grandchild', depth: 2 },
      { content: 'sibling',    depth: 0 },
    ]);
  });

  it('replaces all existing blocks on the page', () => {
    const pageId = getOrCreatePage('import-replace');
    saveBlock({ id: 'old', content: 'old content', pageId, parent: null, order: 0 });
    importPage(pageId, '- fresh');
    const flat = flattenTree(buildTree(pageId));
    expect(flat).toHaveLength(1);
    expect(flat[0].content).toBe('fresh');
  });

  it('rebuilds the complex page with correct structure', () => {
    const pageId = getOrCreatePage('import-complex');
    importPage(pageId, COMPLEX_PAGE_MD);
    const flat = flattenTree(buildTree(pageId));
    // Heading at depth 0, its bullets at depth 1, nested bullets deeper
    expect(flat[0]).toMatchObject({ content: '# Project Overview', depth: 0 });
    expect(flat[1]).toMatchObject({ content: '**Goals** for this quarter: ship [[Outliner]] v1', depth: 1 });
    expect(flat[2]).toMatchObject({ content: 'TODO Write feature specs', depth: 2 });
    expect(flat[4]).toMatchObject({ content: '~~old approach~~ replaced with ==highlights==', depth: 3 });
    expect(flat[8]).toMatchObject({ content: '---', depth: 0 });
    expect(flat[9]).toMatchObject({ content: '## Meeting Notes', depth: 1 });
    expect(flat[16]).toMatchObject({ content: '# Resources', depth: 0 });
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
  it('returns an entry per page with correct folder and slug-based filename', () => {
    const id1 = getOrCreatePage('My Notes');
    saveBlock({ id: 'b1', content: 'hello', pageId: id1, parent: null, order: 0 });
    const id2 = getOrCreatePage('2026-03-27');
    saveBlock({ id: 'b2', content: 'today', pageId: id2, parent: null, order: 0 });

    const entries = exportAllPages();
    const paths = entries.map(e => e.path);
    expect(paths).toContain('pages/my-notes.md');
    expect(paths).toContain('journals/2026-03-27.md');

    const notes = entries.find(e => e.path === 'pages/my-notes.md')!;
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
    expect(notesFlat.map(b => b.content)).toEqual(['alpha', 'beta']);

    // Journal page
    const journalPage = Object.values(pageData.value).find(p => p.title === '2026-03-27');
    expect(journalPage).toBeDefined();
    expect(journalPage!.folder).toBe('journals');
    const journalFlat = flattenTree(buildTree(journalPage!.id));
    expect(journalFlat.map(b => b.content)).toEqual(['today']);
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
    expect(flat.map(b => b.content)).toEqual(['# Title', 'bullet']);
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

// Simulates what BlockItem does when rendering an inactive block:
// parseTodoStatus strips the prefix, then renderContent formats the text.
// Verifies the text appears exactly once (guards against double-render bugs).
describe('block display pipeline', () => {
  it('plain text appears exactly once in rendered output', () => {
    const content = 'Hello world';
    const { status, text } = parseTodoStatus(content);
    const html = renderContent(text) || '<br>';
    expect(status).toBeNull();
    expect((html.match(/Hello world/g) ?? []).length).toBe(1);
  });

  it('TODO prefix is stripped and body appears exactly once', () => {
    const content = 'TODO buy milk';
    const { status, text } = parseTodoStatus(content);
    const html = renderContent(text) || '<br>';
    expect(status).toBe('todo');
    expect(html).not.toContain('TODO');
    expect((html.match(/buy milk/g) ?? []).length).toBe(1);
  });

  it('wiki link text appears exactly once as visible content', () => {
    const content = 'see [[Research]]';
    const { text } = parseTodoStatus(content);
    const html = renderContent(text);
    // The page name also appears in data-page="Research" — that's by design.
    // Check that it appears exactly once as visible text (between tags).
    expect((html.match(/>Research</g) ?? []).length).toBe(1);
  });
});

describe('renderContent', () => {
  it('renders wiki links', () => {
    const html = renderContent('see [[Foo]]');
    expect(html).toContain('class="wiki-link"');
    expect(html).toContain('data-page="Foo"');
    expect(html).toContain('>Foo<');
  });

  it('renders bold', () => {
    expect(renderContent('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders italic', () => {
    expect(renderContent('*italic*')).toContain('<em>italic</em>');
  });

  it('renders code without inner formatting', () => {
    const html = renderContent('`**not bold**`');
    expect(html).toContain('<code>**not bold**</code>');
    expect(html).not.toContain('<strong>');
  });

  it('renders strikethrough', () => {
    expect(renderContent('~~deleted~~')).toContain('<s>deleted</s>');
  });

  it('parseAnnotations strips [.kanban] and [.hl-N]', () => {
    expect(parseAnnotations('Tasks [.kanban]')).toEqual({ text: 'Tasks', kanban: true, hl: null });
    expect(parseAnnotations('Backlog [.hl-4]')).toEqual({ text: 'Backlog', kanban: false, hl: 4 });
    expect(parseAnnotations('Board [.kanban] [.hl-2]')).toEqual({ text: 'Board', kanban: true, hl: 2 });
    expect(parseAnnotations('No annotations')).toEqual({ text: 'No annotations', kanban: false, hl: null });
  });

  it('renders highlight', () => {
    expect(renderContent('==important==')).toContain('<mark>important</mark>');
  });

  it('renders colored highlight', () => {
    expect(renderContent('==text==[.hl-3]')).toContain('<mark class="hl-3">text</mark>');
  });

  it('renders colored highlight without affecting surrounding text', () => {
    const html = renderContent('before ==text==[.hl-1] after');
    expect(html).toContain('before ');
    expect(html).toContain('<mark class="hl-1">text</mark>');
    expect(html).toContain(' after');
  });

  it('renders hyperlinks', () => {
    const html = renderContent('see [Docs](https://example.com)');
    expect(html).toContain('class="hyperlink"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>Docs<');
    expect(html).toContain('target="_blank"');
  });

  it('auto-links bare URLs', () => {
    const html = renderContent('visit https://example.com for info');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>https://example.com<');
  });

  it('does not double-link URLs inside [text](url) syntax', () => {
    const html = renderContent('[click here](https://example.com)');
    // Should produce exactly one <a> tag, not nested
    const count = (html.match(/<a /g) ?? []).length;
    expect(count).toBe(1);
    expect(html).toContain('>click here<');
  });

  it('does not double-link when URL is the link text', () => {
    const html = renderContent('[https://example.com](https://example.com)');
    const count = (html.match(/<a /g) ?? []).length;
    expect(count).toBe(1);
    expect(html).toContain('>https://example.com<');
  });

  it('does not confuse wiki links with hyperlinks', () => {
    const html = renderContent('[[Page]] and [link](http://x.com)');
    expect(html).toContain('class="wiki-link"');
    expect(html).toContain('class="hyperlink"');
    expect(html).toContain('data-page="Page"');
    expect(html).toContain('href="http://x.com"');
  });

  it('renders single-word tags', () => {
    const html = renderContent('hello #world');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-page="world"');
  });

  it('renders multi-word tags with #[[...]] syntax', () => {
    const html = renderContent('tagged #[[my project]]');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-page="my project"');
    expect(html).toContain('#my project');
    expect(html).not.toContain('[[');
  });

  it('renders both tag syntaxes on the same line', () => {
    const html = renderContent('#simple and #[[multi word]]');
    const tags = (html.match(/class="tag"/g) ?? []).length;
    expect(tags).toBe(2);
  });

  it('does not parse tags when not followed by whitespace or end', () => {
    const html = renderContent('email user#name or #good tag');
    const tags = (html.match(/class="tag"/g) ?? []).length;
    expect(tags).toBe(1);
    expect(html).toContain('data-page="good"');
    expect(html).not.toContain('data-page="name"');
  });

  it('parses tag at end of string', () => {
    const html = renderContent('end tag #done');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-page="done"');
  });

  it('parses hierarchical tags with slashes', () => {
    const html = renderContent('tagged #project/frontend here');
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-page="project/frontend"');
    expect(html).toContain('#project/frontend');
  });

  it('parses hierarchical tag at end of string', () => {
    const html = renderContent('see #foo/bar/baz');
    expect(html).toContain('data-page="foo/bar/baz"');
  });

  it('escapes HTML', () => {
    const html = renderContent('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles mixed formatting', () => {
    const html = renderContent('**bold** and *italic* with [[link]]');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('class="wiki-link"');
  });

  it('parseTodoStatus detects unchecked checkbox', () => {
    expect(parseTodoStatus('[ ] buy milk')).toEqual({ status: 'todo', text: 'buy milk' });
  });

  it('parseTodoStatus detects checked checkbox', () => {
    expect(parseTodoStatus('[x] buy milk')).toEqual({ status: 'done', text: 'buy milk' });
  });

  it('parseTodoStatus detects uppercase X checkbox', () => {
    expect(parseTodoStatus('[X] buy milk')).toEqual({ status: 'done', text: 'buy milk' });
  });

  it('cycleTodoStatus cycles checkbox to DOING', () => {
    expect(cycleTodoStatus('[ ] buy milk')).toBe('DOING buy milk');
  });

  it('cycleTodoStatus cycles checked checkbox to CANCELLED', () => {
    expect(cycleTodoStatus('[x] buy milk')).toBe('CANCELLED buy milk');
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

    expect(blockData.value[tableId].type).toBe('table');
    const grid = getTableGrid(tableId);
    expect(grid.length).toBe(3);
    expect(grid[0].cells.length).toBe(2);
    expect(grid[0].cells[0].content).toBe('Name');
    expect(grid[0].cells[1].content).toBe('Age');
    expect(grid[2].cells[0].content).toBe('Bob');
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
    expect(grid.map(r => r.cells.map(c => c.content))).toEqual([
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
    expect(grid[1].cells.every(c => c.content === '')).toBe(true);
  });

  it('insertTableRow inserts between existing rows', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['C']]);

    const grid = getTableGrid(tableId);
    insertTableRow(tableId, grid[0].order);
    const updated = getTableGrid(tableId);
    expect(updated.length).toBe(3);
    expect(updated[0].cells[0].content).toBe('A');
    expect(updated[1].cells[0].content).toBe('');
    expect(updated[2].cells[0].content).toBe('C');
  });

  it('insertTableCol appends a column to every row', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B'], ['C', 'D']]);

    insertTableCol(tableId);
    const grid = getTableGrid(tableId);
    expect(grid[0].cells.length).toBe(3);
    expect(grid[1].cells.length).toBe(3);
    expect(grid[0].cells[2].content).toBe('');
  });

  it('insertTableCol inserts between existing columns', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'C'], ['D', 'F']]);

    const grid = getTableGrid(tableId);
    insertTableCol(tableId, grid[0].cells[0].col);
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.content)).toEqual(['A', '', 'C']);
    expect(updated[1].cells.map(c => c.content)).toEqual(['D', '', 'F']);
  });
  it('reorderTableRow moves a row before another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['B'], ['C']]);

    const grid = getTableGrid(tableId);
    // Move row C before row A
    reorderTableRow(tableId, grid[2].order, grid[0].order, 'before');
    const updated = getTableGrid(tableId);
    expect(updated.map(r => r.cells[0].content)).toEqual(['C', 'A', 'B']);
  });

  it('reorderTableRow moves a row after another', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A'], ['B'], ['C']]);

    const grid = getTableGrid(tableId);
    // Move row A after row C
    reorderTableRow(tableId, grid[0].order, grid[2].order, 'after');
    const updated = getTableGrid(tableId);
    expect(updated.map(r => r.cells[0].content)).toEqual(['B', 'C', 'A']);
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
    expect(updated[0].cells.map(c => c.content)).toEqual(['C', 'A', 'B']);
    expect(updated[1].cells.map(c => c.content)).toEqual(['F', 'D', 'E']);
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
    expect(updated[0].cells.map(c => c.content)).toEqual(['B', 'C', 'A']);
    expect(updated[1].cells.map(c => c.content)).toEqual(['E', 'F', 'D']);
  });

  it('deleteTableRow removes all cells in a row', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B'], ['C', 'D'], ['E', 'F']]);

    const grid = getTableGrid(tableId);
    deleteTableRow(tableId, grid[1].order);
    const updated = getTableGrid(tableId);
    expect(updated.length).toBe(2);
    expect(updated[0].cells.map(c => c.content)).toEqual(['A', 'B']);
    expect(updated[1].cells.map(c => c.content)).toEqual(['E', 'F']);
  });

  it('deleteTableCol removes all cells in a column', () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: 'anchor', content: '', pageId, parent: null, order: 0 });
    const tableId = createTable('anchor', [['A', 'B', 'C'], ['D', 'E', 'F']]);

    const grid = getTableGrid(tableId);
    const colB = grid[0].cells[1].col!;
    deleteTableCol(tableId, colB);
    const updated = getTableGrid(tableId);
    expect(updated[0].cells.map(c => c.content)).toEqual(['A', 'C']);
    expect(updated[1].cells.map(c => c.content)).toEqual(['D', 'F']);
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
    const table = flat.find(b => b.type === 'table');
    expect(table).toBeDefined();
    const grid = getTableGrid(table!.id);
    expect(grid.length).toBe(2);
    expect(grid[0].cells.map(c => c.content)).toEqual(['H1', 'H2']);
    expect(grid[1].cells.map(c => c.content)).toEqual(['a', 'b']);
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
    expect(parseTodoStatus('TODO buy milk')).toEqual({ status: 'todo', text: 'buy milk' });
  });

  it('parses DOING prefix', () => {
    expect(parseTodoStatus('DOING write code')).toEqual({ status: 'doing', text: 'write code' });
  });

  it('parses DONE prefix', () => {
    expect(parseTodoStatus('DONE ship it')).toEqual({ status: 'done', text: 'ship it' });
  });

  it('parses NOW as doing', () => {
    expect(parseTodoStatus('NOW urgent task')).toEqual({ status: 'doing', text: 'urgent task' });
  });

  it('parses LATER prefix', () => {
    expect(parseTodoStatus('LATER someday')).toEqual({ status: 'later', text: 'someday' });
  });

  it('parses WAIT prefix', () => {
    expect(parseTodoStatus('WAIT on review')).toEqual({ status: 'wait', text: 'on review' });
  });

  it('parses CANCELLED prefix', () => {
    expect(parseTodoStatus('CANCELLED old idea')).toEqual({ status: 'cancelled', text: 'old idea' });
  });

  it('returns null for no prefix', () => {
    expect(parseTodoStatus('regular text')).toEqual({ status: null, text: 'regular text' });
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

  it('cycles CANCELLED → none', () => {
    expect(cycleTodoStatus('CANCELLED buy milk')).toBe('buy milk');
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
    expect(blocks[0].content).toBe('');
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

  it('puts journal pages in the journals folder', () => {
    navigateTo('2026-03-27');
    const page = pageList.value.find(p => p.title === '2026-03-27')!;
    expect(page.folder).toBe('journals');
  });

  it('leaves regular pages with no folder', () => {
    getOrCreatePage('My Notes');
    const page = pageList.value.find(p => p.title === 'My Notes')!;
    expect(page.folder).toBeUndefined();
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
    expect(grid[0].cells[0].content).toBe('A');
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
    expect(grid[0].cells[0].content).toBe('X');
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

    expect(blockData.value['1'].content).toBe('edited');
    undo();
    expect(blockData.value['1'].content).toBe('original');
  });

  it('redoes after undo', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'original', pageId, parent: null, order: 0 });
    saveBlock({ ...blockData.value['1'], content: 'edited' });

    undo();
    expect(blockData.value['1'].content).toBe('original');
    redo();
    expect(blockData.value['1'].content).toBe('edited');
  });

  it('undoes a grouped operation', () => {
    const pageId = setup();
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });

    // Simulate Enter: split into two blocks
    beginUndo('split');
    saveBlock({ ...blockData.value['1'], content: 'hello' });
    saveBlock({ id: '2', content: ' world', pageId, parent: null, order: 1 });
    commitUndo();

    expect(blockData.value['1'].content).toBe('hello');
    expect(blockData.value['2']).toBeDefined();

    undo();
    expect(blockData.value['1'].content).toBe('hello world');
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
    expect(blockData.value['1'].content).toBe('parent');
    expect(blockData.value['2'].content).toBe('child');
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
    expect(blockData.value['1'].content).toBe('a');

    // New edit should clear redo
    saveBlock({ ...blockData.value['1'], content: 'c' });
    redo(); // should do nothing
    expect(blockData.value['1'].content).toBe('c');
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
