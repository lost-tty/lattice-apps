import type { BlockNode } from './types';
import { isCollapsed, blockToMarkdown, pageData } from './db';

export function DebugPanel({ header, children }: { header: string; children: any }) {
  return (
    <div class="debug-panel">
      <div class="debug-panel-header">{header}</div>
      {children}
    </div>
  );
}

/** AST view shows the *stored* structure (raw content + typed fields like
 *  `layout`, `col`, collapsed) alongside the *derived* block kind from
 *  classifyBlock — the same classification the renderer uses. Useful for
 *  spot-checking that the content prefix produces the expected kind. */
export function ASTContent({ tree, pageId }: { tree: BlockNode[]; pageId: string }) {
  function kindOf(node: BlockNode): { label: string; cls: string } {
    if (node.kind === 'grid')    return { label: 'table', cls: 'ast-type-table' };
    if (node.kind === 'heading') return { label: `h${node.level}`, cls: 'ast-type-heading' };
    if (node.kind === 'bullet')  return { label: node.todo ? `bullet:${node.todo.status}` : 'bullet', cls: 'ast-type-bullet' };
    if (node.kind === 'hrule')   return { label: 'hrule', cls: 'ast-type-hrule' };
    return { label: 'para', cls: 'ast-type-para' };
  }

  function renderNode(node: BlockNode, prefix: string, isLast: boolean): any {
    const connector = isLast ? '└─ ' : '├─ ';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    const md = blockToMarkdown(node);
    const snippet = md.length > 24 ? md.slice(0, 24) + '…' : md;
    const fields: string[] = [];
    if (node.col !== undefined) fields.push(`col=${node.col}`);
    if (isCollapsed(node.id)) fields.push('collapsed');
    const { label, cls } = kindOf(node);

    return (
      <>
        <span class="ast-line">
          <span class="ast-prefix">{prefix}{connector}</span>
          <span class={`ast-type ${cls}`}>{label}</span>
          {' '}
          <span class="ast-content">"{snippet}"</span>
          {fields.length > 0 && <span class="ast-meta"> [{fields.join(', ')}]</span>}
        </span>{'\n'}
        {node.children.map((child, i) =>
          renderNode(child, childPrefix, i === node.children.length - 1)
        )}
      </>
    );
  }

  const page = pageData.value[pageId];

  return (
    <pre class="markdown-panel-content ast-tree">
      <span class="ast-line"><span class="ast-type ast-type-page">page</span></span>{'\n'}
      {page && <>
        <span class="ast-line"><span class="ast-meta">  id: {page.id}</span></span>{'\n'}
        <span class="ast-line"><span class="ast-meta">  title: "{page.title}"</span></span>{'\n'}
        <span class="ast-line"><span class="ast-meta">  slug: "{page.slug}"</span></span>{'\n'}
        <span class="ast-line"><span class="ast-meta">  created: {page.createdAt}</span></span>{'\n'}
      </>}
      {tree.map((node, i) => renderNode(node, '', i === tree.length - 1))}
    </pre>
  );
}
