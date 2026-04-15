import type { FlatBlock } from './db';
import type { Block } from './types';
import { Toolbar } from '@ui';
import {
  activeBlockId, blockData,
  buildTree, flattenTree, saveBlock,
  getBacklinks, navigateById,
} from './db';
import { beginUndo, commitUndo } from './undo';
import { parseHeading, parseAnnotations } from './parse';
import { createBlockAfter, hasIncompleteTodos } from './blockOps';
import { getTableGrid } from './table';
import { exportPage } from './importExport';
import { activateBlock, collectDescendantIds, debugPanels } from './editorState';
import { buildPageToolbarGroups, debugPanelFor } from './pageActions';
import { BlockItem } from './BlockItem';
import { TableBlock } from './TableBlock';
import { KanbanBoard } from './KanbanBoard';
import { BacklinksPanel } from './BacklinksPanel';
import { DebugPanel, ASTContent } from './DebugPanel';
import { PageTitleBlock } from './PageTitleBlock';

// --- Block list rendering ---

function renderBlockList(flat: FlatBlock[]) {
  const cellIds = new Set<string>();
  const kanbanIds = new Set<string>();

  // Collect IDs to skip: grid cells (rendered by TableBlock), and descendants
  // of kanban headings (rendered by KanbanBoard).
  for (const node of flat) {
    if (node.layout === 'grid') {
      const grid = getTableGrid(node.id);
      for (const row of grid) for (const cell of row.cells) cellIds.add(cell.id);
    }
    const heading = parseHeading(node.content);
    if (heading.level && parseAnnotations(heading.text).kanban) {
      for (const id of collectDescendantIds(node)) kanbanIds.add(id);
    }
  }

  const elements: any[] = [];
  for (const node of flat) {
    if (cellIds.has(node.id) || kanbanIds.has(node.id)) continue;
    if (node.layout === 'grid') {
      elements.push(<TableBlock key={node.id} node={node} />);
      continue;
    }
    const heading = parseHeading(node.content);
    if (heading.level && parseAnnotations(heading.text).kanban) {
      elements.push(<BlockItem key={node.id} node={node} />);
      elements.push(<KanbanBoard key={`kanban-${node.id}`} node={node} />);
      continue;
    }
    elements.push(<BlockItem key={node.id} node={node} />);
  }
  return elements;
}

// --- Page section (shared between single page and journal views) ---

export function PageSection({ pageId, titleClickable }: { pageId: string; titleClickable?: boolean }) {
  const tree = buildTree(pageId);
  const flat = flattenTree(tree);
  const backlinks = getBacklinks(pageId);
  const hasPageIncompleteTodos = flat.some(b => hasIncompleteTodos(b.id));

  // Both the inline toolbar (here) and the mobile topbar toolbar (rendered
  // by App) call the same builder; debug-panel state lives on the
  // `debugPanels` signal so toggling from either surface updates both.
  // Reading `debugPanelFor` subscribes this component to the signal so
  // toggles re-render the inline toolbar without extra plumbing.
  const debugPanel = debugPanelFor(pageId);
  const toolbarGroups = buildPageToolbarGroups(pageId);

  return (
    <div class="page-section">
      <div class="page-section-main">
        <Toolbar groups={toolbarGroups} class="page-toolbar" />
        {debugPanel === 'markdown' && <DebugPanel header="Markdown"><pre class="markdown-panel-content">{exportPage(pageId)}</pre></DebugPanel>}
        {debugPanel === 'ast' && <DebugPanel header="AST"><ASTContent tree={tree} /></DebugPanel>}
        <PageTitleBlock
          pageId={pageId}
          titleClickable={titleClickable}
          hasIncompleteTodosOnPage={hasPageIncompleteTodos}
        />
        <div class="block-tree">
          {renderBlockList(flat)}
          <div
            class="block-tree-tail"
            onClick={() => {
              const currentFlat = flattenTree(buildTree(pageId));
              if (currentFlat.length === 0) return;

              // Walk up from the last block past table cells and kanban descendants
              // to find the container block (table or kanban heading) we need to insert after
              let last = currentFlat[currentFlat.length - 1];
              let anchor = blockData.value[last.id];

              // Walk up to grid container
              if (anchor?.parent && blockData.value[anchor.parent]?.layout === 'grid') {
                anchor = blockData.value[anchor.parent];
              }

              // Walk up to kanban heading (card → column heading → kanban heading)
              function isKanbanHeading(b: Block | undefined): boolean {
                if (!b) return false;
                const h = parseHeading(b.content);
                return !!h.level && parseAnnotations(h.text).kanban;
              }
              while (anchor?.parent) {
                const parent = blockData.value[anchor.parent];
                if (isKanbanHeading(parent)) { anchor = parent; break; }
                // Column heading (child of kanban heading)
                if (parent?.parent && isKanbanHeading(blockData.value[parent.parent])) {
                  anchor = blockData.value[parent.parent]; break;
                }
                break;
              }

              if (!anchor) return;

              // If the anchor is empty and editable, just focus it
              const isSpecial = anchor.layout === 'grid' || isKanbanHeading(anchor);
              if (anchor.content.trim() === '' && !isSpecial) {
                activateBlock(anchor.id, 'end');
                return;
              }

              // Create a sibling after the anchor. For kanban/grid special
              // cases we sibling-match the anchor; otherwise a normal
              // empty bullet via createBlockAfter.
              beginUndo('new block');
              if (isSpecial) {
                const id = crypto.randomUUID();
                const siblings = Object.values(blockData.value)
                  .filter(b => b.pageId === pageId && b.parent === anchor!.parent);
                const maxOrder = siblings.reduce((m, b) => Math.max(m, b.order), 0);
                // Match the heading level so it becomes a proper sibling; if
                // the anchor isn't a heading, start a plain bullet.
                const { level } = parseHeading(anchor.content);
                const content = level ? '#'.repeat(level) + ' ' : '- ';
                saveBlock({ id, content, pageId, parent: anchor.parent, order: maxOrder + 1 });
                commitUndo();
                activateBlock(id, 'end');
              } else {
                const newId = createBlockAfter(anchor.id);
                commitUndo();
                activateBlock(newId, 'end');
              }
            }}
          />
        </div>
        {backlinks.length > 0 && <BacklinksPanel backlinks={backlinks} />}
      </div>
    </div>
  );
}
