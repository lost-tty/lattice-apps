import { Content } from './renderContent';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { navigateById, pageTitle } from './db';


export function BacklinksPanel({ backlinks }: { backlinks: { block: Block; children: FlatBlock[] }[] }) {
  return (
    <div class="backlinks">
      <h3>Linked References</h3>
      {backlinks.map(({ block, children }) => (
        <div key={block.id} class="backlink" onClick={() => navigateById(block.pageId)}>
          <span class="backlink-page">{pageTitle(block.pageId)}</span>
          <span class="backlink-content"><Content text={block.content} /></span>
          {children.length > 0 && (
            <div class="backlink-children">
              {children.map(child => (
                <div
                  key={child.id}
                  class="backlink-child"
                  style={`padding-left: ${child.depth * 1}rem`}
                >
                  <Content text={child.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
