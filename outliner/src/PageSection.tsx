import { useState } from 'preact/hooks';
import type { FlatBlock } from './db';
import type { Block } from './types';
import { IconCopy, IconDownload, IconCode, IconTree, IconUndo, IconRedo } from './Icons';
import {
  activeBlockId, blockData,
  buildTree, flattenTree, saveBlock,
  getBacklinks, pageTitle, navigateById,
} from './db';
import { beginUndo, commitUndo, canUndo, canRedo, undo, redo } from './undo';
import { parseHeading, parseAnnotations } from './parse';
import { createBlockAfter } from './blockOps';
import { getTableGrid } from './table';
import { exportPage } from './importExport';
import { activateBlock, collectDescendantIds } from './editorState';
import { BlockItem } from './BlockItem';
import { TableBlock } from './TableBlock';
import { KanbanBoard } from './KanbanBoard';
import { BacklinksPanel } from './BacklinksPanel';
import { DebugPanel, ASTContent } from './DebugPanel';

// --- Block list rendering ---

function renderBlockList(flat: FlatBlock[]) {
  const cellIds = new Set<string>();
  const kanbanIds = new Set<string>();

  // Collect IDs to skip
  for (const node of flat) {
    if (node.type === 'table') {
      const grid = getTableGrid(node.id);
      for (const row of grid) for (const cell of row.cells) cellIds.add(cell.id);
    }
    if (node.type === 'paragraph') {
      const heading = parseHeading(node.content);
      if (heading.level && parseAnnotations(heading.text).kanban) {
        for (const id of collectDescendantIds(node)) kanbanIds.add(id);
      }
    }
  }

  const elements: any[] = [];
  for (const node of flat) {
    if (cellIds.has(node.id) || kanbanIds.has(node.id)) continue;
    if (node.type === 'table') {
      elements.push(<TableBlock key={node.id} node={node} />);
    } else if (node.type === 'paragraph') {
      const heading = parseHeading(node.content);
      if (heading.level && parseAnnotations(heading.text).kanban) {
        elements.push(<BlockItem key={node.id} node={node} />);
        elements.push(<KanbanBoard key={`kanban-${node.id}`} node={node} />);
        continue;
      }
      elements.push(<BlockItem key={node.id} node={node} />);
    } else {
      elements.push(<BlockItem key={node.id} node={node} />);
    }
  }
  return elements;
}

// --- Page section (shared between single page and journal views) ---

export function PageSection({ pageId, titleClickable }: { pageId: string; titleClickable?: boolean }) {
  const tree = buildTree(pageId);
  const flat = flattenTree(tree);
  const backlinks = getBacklinks(pageId);
  const [debugPanel, setDebugPanel] = useState<'off' | 'markdown' | 'ast'>('off');

  function togglePanel(panel: 'markdown' | 'ast') {
    setDebugPanel(prev => prev === panel ? 'off' : panel);
  }

  function handleCopyMarkdown() {
    const md = exportPage(pageId);
    navigator.clipboard.writeText(md);
  }

  function handleDownloadMarkdown() {
    const md = exportPage(pageId);
    const title = pageTitle(pageId);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class={`page-section ${debugPanel !== 'off' ? 'with-debug' : ''}`}>
      <div class="page-section-main">
        <div class="page-toolbar">
          <button class="toolbar-btn" disabled={!canUndo()} onClick={() => undo()} title="Undo (⌘Z)"><IconUndo /></button>
          <button class="toolbar-btn" disabled={!canRedo()} onClick={() => redo()} title="Redo (⌘⇧Z)"><IconRedo /></button>
          <div class="toolbar-sep" />
          <button class={`toolbar-btn${debugPanel === 'markdown' ? ' active' : ''}`} onClick={() => togglePanel('markdown')} title="Debug Markdown"><IconCode /></button>
          <button class={`toolbar-btn${debugPanel === 'ast' ? ' active' : ''}`} onClick={() => togglePanel('ast')} title="Debug AST"><IconTree /></button>
          <div class="toolbar-sep" />
          <button class="toolbar-btn" onClick={handleCopyMarkdown} title="Copy as Markdown"><IconCopy /></button>
          <button class="toolbar-btn" onClick={handleDownloadMarkdown} title="Download page as Markdown"><IconDownload /></button>
        </div>
        <h1
          class={`page-title${titleClickable ? ' journal-day-title' : ''}`}
          onClick={titleClickable ? () => navigateById(pageId) : undefined}
        >
          {pageTitle(pageId)}
        </h1>
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

              // Walk up to table
              if (anchor?.parent && blockData.value[anchor.parent]?.type === 'table') {
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
              const isSpecial = anchor.type === 'table' || isKanbanHeading(anchor);
              if (anchor.content.trim() === '' && !isSpecial) {
                activateBlock(anchor.id, 'end');
                return;
              }

              // Create a sibling paragraph after the anchor
              beginUndo('new block');
              if (isSpecial) {
                const id = crypto.randomUUID();
                const siblings = Object.values(blockData.value)
                  .filter(b => b.pageId === pageId && b.parent === anchor!.parent);
                const maxOrder = siblings.reduce((m, b) => Math.max(m, b.order), 0);
                // Match the heading level so it becomes a proper sibling
                const { level } = parseHeading(anchor.content);
                const content = level ? '#'.repeat(level) + ' ' : '';
                saveBlock({ id, content, pageId, parent: anchor.parent, order: maxOrder + 1, type: 'paragraph' });
                commitUndo();
                activateBlock(id, 'end');
              } else {
                const newId = createBlockAfter(anchor.id, '', 'paragraph');
                commitUndo();
                activateBlock(newId, 'end');
              }
            }}
          />
        </div>
        {backlinks.length > 0 && <BacklinksPanel backlinks={backlinks} />}
      </div>
      {debugPanel === 'markdown' && <DebugPanel header="Markdown"><pre class="markdown-panel-content">{exportPage(pageId)}</pre></DebugPanel>}
      {debugPanel === 'ast' && <DebugPanel header="AST"><ASTContent tree={tree} /></DebugPanel>}
    </div>
  );
}
