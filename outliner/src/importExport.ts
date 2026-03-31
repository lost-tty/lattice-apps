// Markdown import, export, and paste operations.

import type { Block } from './types';
import {
  blockData, pageList, saveBlock, deleteBlock,
  buildTree, flattenTree, getOrCreatePage, validateTree,
  getSiblings, nextOrder, orderBetween, maybeRebalance,
} from './db';
import { isTableRow, isTableSeparator } from './parse';
import { getTableGrid } from './table';

// --- Paste helpers ---

/** Parse pasted text into a flat list of content+depth items.
 *  Handles CommonMark-style bullet lists with continuation lines,
 *  headings, tables, and plain paragraphs.
 *  Blank lines act as paragraph separators (never produce empty blocks).
 *  Depths are normalised so the shallowest line = 0. */
export type ParsedItem = {
  content: string;
  relativeDepth: number;
  type: 'bullet' | 'paragraph' | 'table-row';
  cells?: string[];   // populated for table-row items
};

export function parseMarkdownToItems(text: string): ParsedItem[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];

  const result: Array<{ content: string; depth: number; type: 'bullet' | 'paragraph' | 'table-row'; cells?: string[] }> = [];
  // -1 = no heading seen yet; unindented bullets start at depth 0
  let headingDepth = -1;
  // Sorted unique indent values seen in the current heading section
  let bulletIndents: number[] = [];
  // Track the last bullet for continuation lines
  let lastBulletDepth = -1;
  let lastBulletContentCol = 0;  // column where content starts (indent + "- ".length)
  let afterBlankLine = false;

  for (const line of lines) {
    // Blank lines: never produce blocks, but mark a paragraph break
    if (line.trim() === '') {
      afterBlankLine = true;
      continue;
    }

    // Horizontal rule: --- resets all nesting context
    if (line.trim() === '---') {
      headingDepth = -1;
      bulletIndents = [];
      lastBulletDepth = -1;
      afterBlankLine = false;
      result.push({ content: '---', type: 'paragraph', depth: 0 });
      continue;
    }

    // Table row: | ... | (skip separator rows like |---|---|)
    if (isTableRow(line.trim())) {
      if (isTableSeparator(line.trim())) continue; // drop separator — it's structural, not content
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
      result.push({ content: line.trim(), type: 'table-row', cells, depth: headingDepth + 1 });
      afterBlankLine = false;
      continue;
    }

    // Heading: # through ######
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      headingDepth = hm[1].length - 1;   // # → 0, ## → 1, ### → 2 …
      bulletIndents = [];                 // fresh indent context for this section
      lastBulletDepth = -1;
      afterBlankLine = false;
      result.push({ content: line.trim(), type: 'paragraph', depth: headingDepth });
      continue;
    }

    // Bullet: -, *, or + with optional leading whitespace
    const bm = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bm) {
      const indent = bm[1].length;
      if (!bulletIndents.includes(indent)) {
        bulletIndents.push(indent);
        bulletIndents.sort((a, b) => a - b);
      }
      const indentRank = bulletIndents.indexOf(indent);
      const depth = headingDepth + 1 + indentRank;
      lastBulletDepth = depth;
      lastBulletContentCol = indent + 2;  // "- " is 2 chars
      afterBlankLine = false;
      result.push({ content: bm[2], type: 'bullet', depth });
      continue;
    }

    // Plain text — joins with the previous block (no blank line) or starts a
    // new paragraph (after a blank line).  Only structural markers (- # --- |)
    // can start new blocks; plain text never splits on newlines alone.
    if (!afterBlankLine && result.length > 0) {
      // Continuation: append to the previous block's content
      result[result.length - 1].content += '\n' + line.trim();
      continue;
    }

    // After a blank line: indented text stays in the bullet context
    if (lastBulletDepth >= 0) {
      const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (lineIndent >= lastBulletContentCol) {
        result.push({ content: line.trim(), type: 'paragraph', depth: lastBulletDepth + 1 });
        afterBlankLine = false;
        continue;
      }
    }

    // Standalone paragraph — breaks out of any bullet context
    lastBulletDepth = -1;
    afterBlankLine = false;
    result.push({ content: line.trim(), type: 'paragraph', depth: headingDepth + 1 });
  }

  if (result.length === 0) return [];
  const minDepth = Math.min(...result.map(r => r.depth));
  return result.map(r => ({
    content: r.content,
    relativeDepth: r.depth - minDepth,
    type: r.type,
    ...(r.cells ? { cells: r.cells } : {}),
  }));
}

/** Insert a list of blocks immediately after `afterId`, preserving relative
 *  nesting.  relativeDepth 0 = sibling of afterId; 1 = child of the nearest
 *  depth-0 block; etc.  Returns the ID of the last inserted block.
 *  Consecutive table-row items are merged into a single table block with cell children. */
export function insertBlocksAfter(
  afterId: string,
  items: Array<{ content: string; relativeDepth: number; type?: 'bullet' | 'paragraph' | 'table-row'; cells?: string[] }>,
): string {
  if (items.length === 0) return afterId;
  const anchor = blockData.value[afterId];
  if (!anchor) return afterId;

  const pageId = anchor.pageId;
  const siblings = getSiblings(afterId);
  const anchorIdx = siblings.findIndex(b => b.id === afterId);
  const anchorNextOrder = siblings[anchorIdx + 1]?.order; // upper bound for depth-0 slots

  // prevAtDepth[d] = {id, order} of the most recently inserted block at relative depth d.
  // Seed depth-0 with the anchor so the first depth-0 item slots in after it.
  const prevAtDepth: Record<number, { id: string; order: number }> = {
    0: { id: afterId, order: anchor.order },
  };

  let lastId = afterId;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Group consecutive table rows into a single table block
    if (item.type === 'table-row' && item.cells) {
      const rows: string[][] = [];
      let j = i;
      while (j < items.length && items[j].type === 'table-row' && items[j].cells) {
        rows.push(items[j].cells!);
        j++;
      }
      // Insert table block at the current depth
      const d = item.relativeDepth;
      const tableId = crypto.randomUUID();
      if (d === 0) {
        const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
        saveBlock({ id: tableId, content: '', pageId, parent: anchor.parent, order, type: 'table' });
        prevAtDepth[0] = { id: tableId, order };
      } else {
        const parentEntry = prevAtDepth[d - 1];
        if (!parentEntry) { i = j - 1; continue; }
        const children = Object.values(blockData.value)
          .filter(b => b.pageId === pageId && b.parent === parentEntry.id);
        const order = nextOrder(children);
        saveBlock({ id: tableId, content: '', pageId, parent: parentEntry.id, order, type: 'table' });
        prevAtDepth[d] = { id: tableId, order };
      }
      // Create cell blocks
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const cellId = crypto.randomUUID();
          saveBlock({ id: cellId, content: rows[r][c], pageId, parent: tableId, order: r, col: c });
        }
      }
      lastId = tableId;
      i = j - 1; // skip consumed rows
      continue;
    }

    const d = item.relativeDepth;
    const id = crypto.randomUUID();

    const type = item.type ?? 'bullet';

    if (d === 0) {
      const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
      saveBlock({ id, content: item.content, pageId, parent: anchor.parent, order, type });
      prevAtDepth[0] = { id, order };
    } else {
      const parentEntry = prevAtDepth[d - 1];
      if (!parentEntry) continue; // malformed relative depth — skip
      const children = Object.values(blockData.value)
        .filter(b => b.pageId === pageId && b.parent === parentEntry.id);
      const order = nextOrder(children);
      saveBlock({ id, content: item.content, pageId, parent: parentEntry.id, order, type });
      prevAtDepth[d] = { id, order };
    }

    // Invalidate deeper tracking when stepping back to a shallower level
    for (const k in prevAtDepth) if (Number(k) > d) delete prevAtDepth[Number(k)];

    lastId = id;
  }

  maybeRebalance(pageId, anchor.parent);
  return lastId;
}

// --- Import / Export ---

/** Serialise a page as an indented Markdown bullet list. */
export function exportPage(pageId: string): string {
  const flat = flattenTree(buildTree(pageId));
  let headingDepth = 0;
  const isStructural = (c: string) => /^#{1,6} /.test(c) || c === '---';
  const tableCellIds = new Set<string>();
  const lines: string[] = [];
  let prevKind: 'bullet' | 'paragraph' | 'structural' | 'table' | null = null;
  let maxBulletDepth = -1;

  for (let i = 0; i < flat.length; i++) {
    const b = flat[i];

    if (tableCellIds.has(b.id)) continue;

    if (b.type === 'table') {
      if (prevKind && prevKind !== 'structural') lines.push('');
      const grid = getTableGrid(b.id);
      for (const cell of grid.flatMap(r => r.cells)) tableCellIds.add(cell.id);
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        lines.push('| ' + row.cells.map(c => c.content).join(' | ') + ' |');
        if (r === 0) {
          lines.push('| ' + row.cells.map(() => '---').join(' | ') + ' |');
        }
      }
      prevKind = 'table';
      maxBulletDepth = -1;
      continue;
    }

    if (isStructural(b.content)) {
      if (lines.length > 0) lines.push('');
      headingDepth = b.depth + 1;
      lines.push(b.content);
      const next = flat[i + 1];
      if (next && !tableCellIds.has(next.id) && !isStructural(next.content)) {
        lines.push('');
      }
      prevKind = 'structural';
      maxBulletDepth = -1;
      continue;
    }

    if (b.type === 'paragraph') {
      if (b.content === '') {
        if (prevKind) lines.push('');
        prevKind = null;
        continue;
      }
      if (prevKind === 'bullet' || prevKind === 'paragraph' || prevKind === 'table') {
        lines.push('');
      }
      const indent = '  '.repeat(Math.max(0, b.depth - headingDepth));
      for (const cl of b.content.split('\n')) {
        lines.push(`${indent}${cl}`);
      }
      prevKind = 'paragraph';
      maxBulletDepth = -1;
    } else {
      if (prevKind === 'paragraph' || prevKind === 'table') {
        lines.push('');
      }
      const rawDepth = b.depth - headingDepth;
      const bulletDepth = Math.min(rawDepth, maxBulletDepth + 1);
      maxBulletDepth = bulletDepth;
      const prefix = '  '.repeat(Math.max(0, bulletDepth));
      const contentLines = b.content.split('\n');
      lines.push(`${prefix}- ${contentLines[0]}`);
      for (let j = 1; j < contentLines.length; j++) {
        lines.push(`${prefix}  ${contentLines[j]}`);
      }
      prevKind = 'bullet';
    }
  }
  return lines.join('\n');
}

/** Export all pages as an array of {path, content} entries suitable for zipping. */
export function exportAllPages(): Array<{ path: string; content: string }> {
  return pageList.value.map(page => {
    const folder = page.folder === 'journals' ? 'journals' : 'pages';
    const filename = `${page.slug}.md`;
    return { path: `${folder}/${filename}`, content: exportPage(page.id) };
  });
}

/** Import a set of {path, content} entries (as produced by parseTar / exportAllPages). */
export function importAllPages(files: Array<{ path: string; content: string }>): void {
  for (const file of files) {
    const parts = file.path.split('/');
    const basename = parts[parts.length - 1].replace(/\.md$/, '');
    const folder = parts.length > 1 && parts[0] === 'journals' ? 'journals' : undefined;
    const pageId = getOrCreatePage(basename, folder);
    importPage(pageId, file.content);
  }
}

/** Replace all blocks on a page with the content of an indented Markdown
 *  bullet list produced by exportPage. */
export function importPage(pageId: string, markdown: string): void {
  // Delete existing content
  Object.values(blockData.value)
    .filter(b => b.pageId === pageId && b.parent === null)
    .forEach(b => deleteBlock(b.id));

  const items = parseMarkdownToItems(markdown);

  const lastIdAtDepth: string[] = [];
  const orderAtDepth: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const { content, relativeDepth: depth, type, cells } = items[i];

    // Group consecutive table rows into a table block
    if (type === 'table-row' && cells) {
      const rows: string[][] = [];
      let j = i;
      while (j < items.length && items[j].type === 'table-row' && items[j].cells) {
        rows.push(items[j].cells!);
        j++;
      }
      const parent = depth > 0 ? (lastIdAtDepth[depth - 1] ?? null) : null;
      if (orderAtDepth[depth] === undefined) orderAtDepth[depth] = 0;
      const tableId = crypto.randomUUID();
      saveBlock({ id: tableId, content: '', pageId, parent, order: orderAtDepth[depth], type: 'table' });
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const cellId = crypto.randomUUID();
          saveBlock({ id: cellId, content: rows[r][c], pageId, parent: tableId, order: r, col: c });
        }
      }
      lastIdAtDepth[depth] = tableId;
      lastIdAtDepth.length = depth + 1;
      orderAtDepth[depth]++;
      orderAtDepth.length = depth + 1;
      i = j - 1;
      continue;
    }

    const parent = depth > 0 ? (lastIdAtDepth[depth - 1] ?? null) : null;
    if (orderAtDepth[depth] === undefined) orderAtDepth[depth] = 0;
    const id = crypto.randomUUID();
    saveBlock({ id, content, pageId, parent, order: orderAtDepth[depth], type: type ?? 'bullet' });
    lastIdAtDepth[depth] = id;
    lastIdAtDepth.length = depth + 1;
    orderAtDepth[depth]++;
    orderAtDepth.length = depth + 1;
  }

  // Safety net: repair any orphan parent references
  validateTree(pageId);
}
