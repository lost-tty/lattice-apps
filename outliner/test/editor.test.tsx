// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { createMockStore } from '../src/mock-sdk';
import {
  init, reset, getOrCreatePage, saveBlock, blockData,
  activeBlockId, currentPage, createBlockAfter, joinBlockWithPrevious,
} from '../src/db';
import { Editor } from '../src/Editor';

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
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });
    currentPage.value = pageId;
    activeBlockId.value = '1';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();
    // Bullet blocks show "- " prefix in edit mode
    expect(editDiv.textContent).toBe('- hello world');

    // Simulate Enter: save before, create new block, switch active
    editDiv.textContent = '- hello';
    saveBlock({ ...blockData.value['1'], content: 'hello' });
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
    saveBlock({ id: '1', content: 'hello', pageId, parent: null, order: 0 });
    saveBlock({ id: '2', content: 'world', pageId, parent: null, order: 1 });
    currentPage.value = pageId;
    activeBlockId.value = '2';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();
    expect(editDiv.textContent).toBe('- world');

    // Simulate what backspace at position 0 does:
    // 1. saveFromEditor (save current block)
    // 2. joinBlockWithPrevious (merge into block '1')
    // 3. set cursorPlacement and activeBlockId to block '1'
    saveBlock({ ...blockData.value['2'], content: 'world' });
    const joined = joinBlockWithPrevious('2');
    expect(joined).not.toBeNull();
    expect(joined!.prevId).toBe('1');
    activeBlockId.value = '1';

    // In a real browser, blur fires on block '2's div during Preact's commit
    editDiv.dispatchEvent(new Event('blur'));

    await flush();

    // Block '1' should now be active and show the MERGED content, not the old "hello"
    const mergedDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(mergedDiv).not.toBeNull();
    expect(blockData.value['1'].content).toBe('helloworld');
    expect(mergedDiv.textContent).toBe('- helloworld');
    expect(document.activeElement).toBe(mergedDiv);
  });

  it('new block receives focus after Enter split', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: 'hello world', pageId, parent: null, order: 0 });
    currentPage.value = pageId;
    activeBlockId.value = '1';

    render(<Editor />, container);
    await flush();

    const editDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(editDiv).not.toBeNull();

    // Simulate Enter at offset 7 (after "- hello")
    editDiv.textContent = '- hello';
    saveBlock({ ...blockData.value['1'], content: 'hello' });
    const newId = createBlockAfter('1', ' world');
    activeBlockId.value = newId;

    // Simulate blur firing during Preact commit (before effects run)
    editDiv.dispatchEvent(new Event('blur'));

    await flush();

    const newEditDiv = document.querySelector('.block-content.editing') as HTMLElement;
    expect(newEditDiv).not.toBeNull();
    // New bullet block shows "- " prefix + content
    expect(newEditDiv.textContent).toBe('-  world');
    expect(document.activeElement).toBe(newEditDiv);
  });
});

describe('Heading visual depth', () => {
  it('heading children render at the same visual depth as the heading', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'item A', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'item B', pageId, parent: '1', order: 1 });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // Heading at depth 0, children at tree depth 1 but visual depth 0
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('0');
  });

  it('nested bullets under a heading child retain relative indentation', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Section', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: 'parent', pageId, parent: '1', order: 0 });
    saveBlock({ id: '3', content: 'child', pageId, parent: '2', order: 0 });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // Heading depth 0 (visual 0), bullet depth 1 (visual 0), sub-bullet depth 2 (visual 1)
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('1');
  });

  it('nested headings each absorb a depth level', async () => {
    const pageId = getOrCreatePage('p');
    saveBlock({ id: '1', content: '# Top', pageId, parent: null, order: 0, type: 'paragraph' });
    saveBlock({ id: '2', content: '## Sub', pageId, parent: '1', order: 0, type: 'paragraph' });
    saveBlock({ id: '3', content: 'item', pageId, parent: '2', order: 0 });
    currentPage.value = pageId;

    render(<Editor />, container);
    await flush();

    const blocks = container.querySelectorAll('.block');
    const depth = (el: Element) => (el as HTMLElement).style.getPropertyValue('--depth').trim();
    // # Top: depth 0, visual 0
    // ## Sub: depth 1, visual 0 (one heading ancestor absorbed)
    // item: depth 2, visual 0 (two heading ancestors absorbed)
    expect(depth(blocks[0])).toBe('0');
    expect(depth(blocks[1])).toBe('0');
    expect(depth(blocks[2])).toBe('0');
  });
});
