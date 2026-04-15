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

/** AST view shows the *stored* structure only: the raw content string plus
 *  the typed fields (`layout`, `col`, collapsed). Any notion of
 *  "bullet" / "heading" is derived from the content prefix and lives in the
 *  renderer, not the store — so it doesn't appear here. */
export function ASTContent({ tree }: { tree: BlockNode[] }) {
  function renderNode(node: BlockNode, prefix: string, isLast: boolean): any {
    const connector = isLast ? '└─ ' : '├─ ';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    const snippet = node.content.length > 40 ? node.content.slice(0, 40) + '…' : node.content;
    const fields: string[] = [];
    if (node.layout) fields.push(`layout=${node.layout}`);
    if (node.col !== undefined) fields.push(`col=${node.col}`);
    if (isCollapsed(node.id)) fields.push('collapsed');

    return (
      <>
        <span class="ast-line">
          <span class="ast-prefix">{prefix}{connector}</span>
          <span class="ast-content">"{snippet}"</span>
          {fields.length > 0 && <span class="ast-meta"> [{fields.join(', ')}]</span>}
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
