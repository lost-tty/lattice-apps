import { useState } from 'preact/hooks';
import { Content } from './renderContent';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { navigateById, pageTitle, blockText } from './db';
import { IconChevronRight } from './Icons';


export function BacklinksPanel({ backlinks, defaultCollapsed }: { backlinks: { block: Block; children: FlatBlock[] }[]; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  return (
    <div class="backlinks">
      <h3 class="backlinks-toggle" onClick={() => setCollapsed(c => !c)}>
        <span class={`backlinks-arrow${collapsed ? '' : ' open'}`}><IconChevronRight /></span>
        Linked References
        <span class="backlinks-count">{backlinks.length}</span>
      </h3>
      {!collapsed && backlinks.map(({ block, children }) => (
        <div key={block.id} class="backlink" onClick={() => navigateById(block.pageId)}>
          <span class="backlink-page">{pageTitle(block.pageId)}</span>
          <span class="backlink-content"><Content text={blockText(block)} /></span>
          {children.length > 0 && (
            <div class="backlink-children">
              {children.map(child => (
                <div
                  key={child.id}
                  class="backlink-child"
                  style={`padding-left: ${child.depth * 1}rem`}
                >
                  <Content text={blockText(child)} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
