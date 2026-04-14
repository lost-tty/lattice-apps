import { useRef, useState } from 'preact/hooks';
import { ActionMenu, useLongPress, type ActionItem, type ActionMenuState } from '@ui';
import { IconArrowRight } from './Icons';
import { pageData, pageTitle, navigateById, getOrCreatePage } from './db';
import { todaySlug } from './parse';
import { carryForwardAll, hasIncompleteTodos } from './blockOps';

export function PageTitleBlock({
  pageId,
  titleClickable,
  hasIncompleteTodosOnPage,
}: {
  pageId: string;
  titleClickable?: boolean;
  hasIncompleteTodosOnPage: boolean;
}) {
  const [menu, setMenu] = useState<ActionMenuState | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const today = todaySlug();
  const isToday = pageData.value[pageId]?.title === today;
  const title = pageTitle(pageId);

  function buildItems(): ActionItem[] {
    const items: ActionItem[] = [];
    if (hasIncompleteTodosOnPage && !isToday) {
      items.push({
        label: 'Carry forward all to today',
        icon: <IconArrowRight />,
        onAction: () => {
          const targetPageId = getOrCreatePage(todaySlug(), 'journals');
          carryForwardAll(pageId, targetPageId);
        },
      });
    }
    return items;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const items = buildItems();
    if (items.length > 0) setMenu({ x: e.clientX, y: e.clientY, items });
  }

  useLongPress(titleRef, ({ clientX, clientY }) => {
    const items = buildItems();
    if (items.length > 0) setMenu({ x: clientX, y: clientY, items });
  });

  return (
    <div
      class="block page-title-block"
      style="--depth: 0"
      onContextMenu={(e: Event) => handleContextMenu(e as MouseEvent)}
    >
      <span class="gutter" />
      <div
        ref={titleRef}
        class="block-content heading-1"
        onClick={titleClickable ? () => navigateById(pageId) : undefined}
      >
        <span class={titleClickable ? 'journal-day-title' : ''}>{title}</span>
      </div>
      <ActionMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
