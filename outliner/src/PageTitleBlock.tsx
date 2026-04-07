import { useState } from 'preact/hooks';
import { ContextMenu, type MenuState } from './ContextMenu';
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
  const [menu, setMenu] = useState<MenuState>(null);

  const today = todaySlug();
  const isToday = pageData.value[pageId]?.title === today;
  const title = pageTitle(pageId);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const items: Array<{ label: string; action: () => void }> = [];

    if (hasIncompleteTodosOnPage && !isToday) {
      items.push({
        label: 'carry forward all to today',
        action: () => {
          const targetPageId = getOrCreatePage(todaySlug(), 'journals');
          carryForwardAll(pageId, targetPageId);
        },
      });
    }

    if (items.length > 0) setMenu({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <div
      class="block page-title-block"
      style="--depth: 0"
      onContextMenu={(e: Event) => handleContextMenu(e as MouseEvent)}
    >
      <span class="gutter" />
      <div
        class="block-content heading-1"
        onClick={titleClickable ? () => navigateById(pageId) : undefined}
      >
        <span class={titleClickable ? 'journal-day-title' : ''}>{title}</span>
      </div>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
