import type { BlockNode } from './types';
import { isCollapsed } from './db';

export function DebugPanel({ header, children }: { header: string; children: any }) {
  return (
    <div class="debug-panel">
      <div class="debug-panel-header">{header}</div>
      {children}
    </div>
  );
}

export function ASTContent({ tree }: { tree: BlockNode[] }) {
  function renderNode(node: BlockNode, prefix: string, isLast: boolean): any {
    const connector = isLast ? '└─ ' : '├─ ';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    const type = node.type === 'table' ? 'table' : node.type === 'paragraph' ? 'para' : 'bullet';
    const snippet = node.content.length > 30 ? node.content.slice(0, 30) + '…' : node.content;
    const meta = [
      isCollapsed(node.id) ? 'collapsed' : '',
    ].filter(Boolean).join(', ');

    return (
      <>
        <span class="ast-line">
          <span class="ast-prefix">{prefix}{connector}</span>
          <span class={`ast-type ast-type-${type}`}>{type}</span>
          {snippet && <span class="ast-content"> "{snippet}"</span>}
          {meta && <span class="ast-meta"> [{meta}]</span>}
        </span>{'\n'}
        {node.children.map((child, i) =>
          renderNode(child, childPrefix, i === node.children.length - 1)
        )}
      </>
    );
  }

  return (
    <pre class="markdown-panel-content ast-tree">
      <span class="ast-line"><span class="ast-type ast-type-page">page</span></span>{'\n'}
      {tree.map((node, i) => renderNode(node, '', i === tree.length - 1))}
    </pre>
  );
}
