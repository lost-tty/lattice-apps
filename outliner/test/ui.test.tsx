// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import {
  ActionMenu,
  SwipeRow,
  Toolbar,
  useLongPress,
  type ToolbarGroup,
  type ActionMenuState,
} from '@ui';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

/** Give preact a tick so useEffect hooks attach their listeners. */
const flush = () => new Promise(r => setTimeout(r, 10));

// --- ActionMenu ---

describe('ActionMenu', () => {
  it('renders nothing when menu is null', () => {
    render(<ActionMenu menu={null} onClose={() => {}} />, container);
    expect(container.querySelector('.action-menu')).toBeNull();
  });

  it('renders items when open and invokes onAction + onClose on click', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const menu: ActionMenuState = {
      x: 10, y: 20,
      items: [{ label: 'Do it', onAction }],
    };
    render(<ActionMenu menu={menu} onClose={onClose} />, container);
    const btn = container.querySelector<HTMLButtonElement>('.action-menu-item');
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const menu: ActionMenuState = {
      x: 0, y: 0, items: [{ label: 'x', onAction: () => {} }],
    };
    render(<ActionMenu menu={menu} onClose={onClose} />, container);
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// --- Toolbar ---

describe('Toolbar', () => {
  it('renders separators between groups but not inside them', () => {
    const groups: ToolbarGroup[] = [
      [{ label: 'A', onAction: () => {} }, { label: 'B', onAction: () => {} }],
      [{ label: 'C', onAction: () => {} }],
    ];
    render(<Toolbar groups={groups} />, container);
    const buttons = container.querySelectorAll('.toolbar-btn');
    const separators = container.querySelectorAll('.toolbar-sep');
    expect(buttons).toHaveLength(3);
    expect(separators).toHaveLength(1);
  });

  it('sets aria-pressed only when active is defined', () => {
    const groups: ToolbarGroup[] = [[
      { label: 'Toggle', active: true, onAction: () => {} },
      { label: 'Plain', onAction: () => {} },
    ]];
    render(<Toolbar groups={groups} />, container);
    const [toggle, plain] = container.querySelectorAll<HTMLButtonElement>('.toolbar-btn');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(plain.hasAttribute('aria-pressed')).toBe(false);
  });

  it('respects disabled and does not fire onAction', () => {
    const onAction = vi.fn();
    const groups: ToolbarGroup[] = [[
      { label: 'Nope', disabled: true, onAction },
    ]];
    render(<Toolbar groups={groups} />, container);
    const btn = container.querySelector<HTMLButtonElement>('.toolbar-btn');
    expect(btn?.disabled).toBe(true);
    btn!.click();
    expect(onAction).not.toHaveBeenCalled();
  });
});

// --- useLongPress ---

function LongPressProbe({ onLong, options }: {
  onLong: () => void;
  options?: { ms?: number; allowContentEditable?: boolean };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLongPress(ref, onLong, options);
  return <div ref={ref} data-testid="probe" style="width: 40px; height: 40px" />;
}

function touch(el: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend', x = 0, y = 0) {
  // happy-dom's TouchEvent construction is limited; synthesize the shape.
  const ev = new Event(type, { bubbles: true }) as any;
  ev.touches = [{ clientX: x, clientY: y }];
  el.dispatchEvent(ev);
}

describe('useLongPress', () => {
  it('fires the handler after `ms` when the finger stays still', async () => {
    const onLong = vi.fn();
    render(<LongPressProbe onLong={onLong} options={{ ms: 40 }} />, container);
    await flush();
    const el = container.querySelector<HTMLElement>('[data-testid=probe]')!;
    touch(el, 'touchstart', 10, 10);
    await new Promise(r => setTimeout(r, 80));
    expect(onLong).toHaveBeenCalledOnce();
  });

  it('cancels when the finger moves past `tolerance`', async () => {
    const onLong = vi.fn();
    render(<LongPressProbe onLong={onLong} options={{ ms: 40 }} />, container);
    await flush();
    const el = container.querySelector<HTMLElement>('[data-testid=probe]')!;
    touch(el, 'touchstart', 10, 10);
    touch(el, 'touchmove', 40, 40); // large move, past default tolerance
    await new Promise(r => setTimeout(r, 80));
    expect(onLong).not.toHaveBeenCalled();
  });

  it('skips contenteditable targets by default', async () => {
    const onLong = vi.fn();
    render(<LongPressProbe onLong={onLong} options={{ ms: 40 }} />, container);
    await flush();
    const el = container.querySelector<HTMLElement>('[data-testid=probe]')!;
    const inner = document.createElement('span');
    inner.setAttribute('contenteditable', 'true');
    el.appendChild(inner);
    const ev = new Event('touchstart', { bubbles: true }) as any;
    ev.touches = [{ clientX: 0, clientY: 0 }];
    inner.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 80));
    expect(onLong).not.toHaveBeenCalled();
  });

  it('fires on contenteditable when allowContentEditable is true', async () => {
    const onLong = vi.fn();
    render(
      <LongPressProbe onLong={onLong} options={{ ms: 40, allowContentEditable: true }} />,
      container,
    );
    await flush();
    const el = container.querySelector<HTMLElement>('[data-testid=probe]')!;
    const inner = document.createElement('span');
    inner.setAttribute('contenteditable', 'true');
    el.appendChild(inner);
    const ev = new Event('touchstart', { bubbles: true }) as any;
    ev.touches = [{ clientX: 0, clientY: 0 }];
    inner.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 80));
    expect(onLong).toHaveBeenCalledOnce();
  });
});

// --- SwipeRow ---

function swipe(el: HTMLElement, deltas: [number, number][]) {
  let x = 100;
  const dispatch = (type: string, clientX: number) => {
    const ev = new Event(type, { bubbles: true }) as any;
    ev.touches = [{ clientX, clientY: 0 }];
    el.dispatchEvent(ev);
  };
  dispatch('touchstart', x);
  for (const [dx] of deltas) {
    x += dx;
    dispatch('touchmove', x);
  }
  dispatch('touchend', x);
}

describe('SwipeRow', () => {
  it('renders action buttons from the actions prop', () => {
    render(
      <SwipeRow actions={[
        { label: 'Delete', danger: true, onAction: () => {} },
        { label: 'Archive', onAction: () => {} },
      ]}>
        <div class="row-child">row</div>
      </SwipeRow>,
      container,
    );
    const actions = container.querySelectorAll<HTMLButtonElement>('.swipe-row-action');
    expect(actions).toHaveLength(2);
    expect(actions[0].getAttribute('aria-label')).toBe('Delete');
    expect(actions[0].classList.contains('swipe-row-action-danger')).toBe(true);
    expect(actions[1].classList.contains('swipe-row-action-danger')).toBe(false);
  });

  it('snaps open past half and closed otherwise based on drag distance', async () => {
    render(
      <SwipeRow actions={[{ label: 'Delete', danger: true, onAction: () => {} }]}>
        <div>row</div>
      </SwipeRow>,
      container,
    );
    const row = container.querySelector<HTMLElement>('.swipe-row')!;
    const content = container.querySelector<HTMLElement>('.swipe-row-content')!;

    // Small drag (below half) → snaps back closed.
    swipe(content, [[-20, 0]]);
    await flush();
    expect(row.classList.contains('swipe-row-open')).toBe(false);

    // Large drag (past half of 1 * 72 = 36 threshold) → snaps open.
    swipe(content, [[-60, 0]]);
    await flush();
    expect(row.classList.contains('swipe-row-open')).toBe(true);
  });

  it('invokes onAction and closes when an action is clicked', async () => {
    const onAction = vi.fn();
    render(
      <SwipeRow actions={[{ label: 'Delete', danger: true, onAction }]}>
        <div>row</div>
      </SwipeRow>,
      container,
    );
    const row = container.querySelector<HTMLElement>('.swipe-row')!;
    const content = container.querySelector<HTMLElement>('.swipe-row-content')!;
    swipe(content, [[-60, 0]]);
    await flush();
    expect(row.classList.contains('swipe-row-open')).toBe(true);
    container.querySelector<HTMLButtonElement>('.swipe-row-action')!.click();
    expect(onAction).toHaveBeenCalledOnce();
    await flush();
    expect(row.classList.contains('swipe-row-open')).toBe(false);
  });
});
