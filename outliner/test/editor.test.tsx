// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { createMockStore } from '../src/mock-sdk';
import {
  init, reset, getOrCreatePage, saveBlock, setBlockMarkdown, blockData,
  activeBlockId, currentPage,
} from '../src/db';
import { parseStoredBlock } from '../src/parse';
import { createBlockAfter, joinBlockWithPrevious } from '../src/blockOps';
import { continuationContent } from '../src/editorState';
import { Editor } from '../src/Editor';
import type { Block } from '../src/types';

function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 10));
}

let container: HTMLElement;

beforeEach(async () => {
  reset();
  const store = createMockStore();
  await init(store);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('Editor focus', () => {
  it('handleBlur does not trigger redundant saves after Enter', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'bullet', text: "hello world" });
    currentPage.value = pageId;
    activeBlockId.value = '1';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();
    expect(editDiv.textContent).toBe('- hello world');

    // Simulate Enter: save before, create new block, switch active
    editDiv.textContent = '- hello';
    saveBlock(setBlockMarkdown(blockData.value['1'], "- hello"));
    const newId = createBlockAfter('1', ' world');
    activeBlockId.value = newId;

    // Record blockData reference BEFORE blur fires.
    const dataBefore = blockData.value;

    // In a real browser, blur fires synchronously during Preact's commit as
    // the old contentEditable is unmounted. Simulate it here BEFORE flushing
    // so it interleaves with the render cycle.
    editDiv.dispatchEvent(new Event('blur'));

    await flush();

    // handleBlur should NOT have triggered a redundant saveBlock.
    expect(blockData.value).toBe(dataBefore);
  });

  it('merged block shows joined content after backspace join', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'bullet', text: "hello" });
    saveBlock({ id: '2', pageId: pageId, parent: null, order: 1, kind: 'bullet', text: "world" });
    currentPage.value = pageId;
    activeBlockId.value = '2';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();
    expect(editDiv.textContent).toBe('- world');

    saveBlock(setBlockMarkdown(blockData.value['2'], "- world"));
    const joined = joinBlockWithPrevious('2', 'world');
    expect(joined).not.toBeNull();
    expect(joined!.prevId).toBe('1');
    activeBlockId.value = '1';

    editDiv.dispatchEvent(new Event('blur'));

    await flush();

    const mergedDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(mergedDiv).not.toBeNull();
    expect(blockData.value['1']).toMatchObject({ kind: 'bullet', text: 'helloworld' });
    expect(mergedDiv.textContent).toBe('- helloworld');
    expect(document.activeElement).toBe(mergedDiv);
  });

  it('new block receives focus after Enter split', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'bullet', text: "hello world" });
    currentPage.value = pageId;
    activeBlockId.value = '1';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();

    // Simulate Enter at offset 7 (after "- hello"): new block gets bullet + space + "world".
    editDiv.textContent = '- hello';
    saveBlock(setBlockMarkdown(blockData.value['1'], "- hello"));
    const newId = createBlockAfter('1', '-  world');
    activeBlockId.value = newId;

    editDiv.dispatchEvent(new Event('blur'));

    await flush();

    const newEditDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(newEditDiv).not.toBeNull();
    expect(newEditDiv.textContent).toBe('-  world');
    expect(document.activeElement).toBe(newEditDiv);
  });
});

describe('continuationContent', () => {
  const b = (content: string): Block =>
    parseStoredBlock({ content, pageId: 'p', parent: null, order: 0 }, '1');

  it('plain bullet → empty bullet', () => {
    expect(continuationContent(b('- foo'))).toBe('- ');
  });

  it('empty bullet stays empty bullet', () => {
    expect(continuationContent(b('- '))).toBe('- ');
  });

  it('unchecked checkbox carries forward', () => {
    expect(continuationContent(b('- [ ] task'))).toBe('- [ ] ');
  });

  it('checked checkbox continues as unchecked', () => {
    expect(continuationContent(b('- [x] task'))).toBe('- [ ] ');
  });

  it('TODO keyword carries forward', () => {
    expect(continuationContent(b('- TODO task'))).toBe('- TODO ');
  });

  it('DOING keyword carries forward', () => {
    expect(continuationContent(b('- DOING task'))).toBe('- DOING ');
  });

  it('LATER keyword carries forward', () => {
    expect(continuationContent(b('- LATER task'))).toBe('- LATER ');
  });

  it('WAIT keyword carries forward', () => {
    expect(continuationContent(b('- WAIT task'))).toBe('- WAIT ');
  });

  it('NOW normalizes to DOING on continuation', () => {
    expect(continuationContent(b('- NOW task'))).toBe('- DOING ');
  });

  it('DONE drops back to plain bullet', () => {
    expect(continuationContent(b('- DONE task'))).toBe('- ');
  });

  it('CANCELLED drops back to plain bullet', () => {
    expect(continuationContent(b('- CANCELLED task'))).toBe('- ');
  });

  it('heading produces empty content', () => {
    expect(continuationContent(b('# Section'))).toBe('');
  });

  it('paragraph produces empty content', () => {
    expect(continuationContent(b('plain prose'))).toBe('');
  });

  it('hrule produces empty content', () => {
    expect(continuationContent(b('---'))).toBe('');
  });
});

describe('Continuation template', () => {
  it('checkbox block generates "- [ ] " template on Enter at end', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'bullet', text: "Item", todo: { status: 'todo', syntax: 'checkbox' } });
    currentPage.value = pageId;
    activeBlockId.value = '1';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();
    expect(editDiv.textContent).toBe('- [ ] Item');

    // Simulate Enter at end: keep current block, create new with continuation template
    const newContent = continuationContent(blockData.value['1']);
    const newId = createBlockAfter('1', newContent);
    activeBlockId.value = newId;

    editDiv.dispatchEvent(new Event('blur'));
    await flush();

    const newEditDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(newEditDiv).not.toBeNull();
    expect(newEditDiv.textContent).toBe('- [ ] ');
  });
});

describe('Heading visual depth', () => {
  it('heading children render at the same visual depth as the heading', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'heading', text: "Section", level: 1 });
    saveBlock({ id: '2', pageId: pageId, parent: '1', order: 0, kind: 'bullet', text: "item A" });
    saveBlock({ id: '3', pageId: pageId, parent: '1', order: 1, kind: 'bullet', text: "item B" });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block:not(.page-title-block)');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // Heading at depth 0, children at tree depth 1 but visual depth 0
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('0');
  });

  it('nested bullets under a heading child retain relative indentation', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'heading', text: "Section", level: 1 });
    saveBlock({ id: '2', pageId: pageId, parent: '1', order: 0, kind: 'bullet', text: "parent" });
    saveBlock({ id: '3', pageId: pageId, parent: '2', order: 0, kind: 'bullet', text: "child" });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block:not(.page-title-block)');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // Heading depth 0 (visual 0), bullet depth 1 (visual 0), sub-bullet depth 2 (visual 1)
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('1');
  });

  it('nested headings each absorb a depth level', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', pageId: pageId, parent: null, order: 0, kind: 'heading', text: "Top", level: 1 });
    saveBlock({ id: '2', pageId: pageId, parent: '1', order: 0, kind: 'heading', text: "Sub", level: 2 });
    saveBlock({ id: '3', pageId: pageId, parent: '2', order: 0, kind: 'bullet', text: "item" });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block:not(.page-title-block)');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // # Top: depth 0, visual 0
    // ## Sub: depth 1, visual 0 (one heading ancestor absorbed)
    // item: depth 2, visual 0 (two heading ancestors absorbed)
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('0');
  });
});
