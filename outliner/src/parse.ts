// Pure text parsing functions. No signal or store dependencies.

// --- Wiki links ---

export function parseWikiLinks(text: string): Array<string | { page: string }> {
  const parts: Array<string | { page: string }> = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ page: match[1] });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// --- Table row parsing ---

/** Check if block content is a table separator row (|---|---|). */
export function isTableSeparator(text: string): boolean {
  return /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(text.trim());
}

/** Check if block content is a table row (| ... | ... |). */
export function isTableRow(text: string): boolean {
  const t = text.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}

/** Parse a table row into its cell contents. Returns null if not a table row. */
export function parseTableCells(text: string): string[] | null {
  if (!isTableRow(text) || isTableSeparator(text)) return null;
  return text.trim().slice(1, -1).split('|').map(c => c.trim());
}

// --- Headings & annotations ---

/** Extract a Markdown heading prefix (# through ######) from block content.
 *  Returns the heading level (1-6) and the text after the prefix, or level null
 *  if the content does not start with a heading marker. */
export function parseHeading(content: string): { level: number | null; text: string } {
  const m = content.match(/^(#{1,6}) (.+)/);
  if (!m) return { level: null, text: content };
  return { level: m[1].length, text: m[2] };
}

/** Strip block annotations like [.kanban] and [.hl-N] from text. */
export function parseAnnotations(text: string): { text: string; kanban: boolean; hl: number | null } {
  let kanban = false;
  let hl: number | null = null;
  const cleaned = text
    .replace(/\[\.kanban\]/g, () => { kanban = true; return ''; })
    .replace(/\[\.hl-(\d+)\]/g, (_, n) => { hl = parseInt(n); return ''; })
    .trim();
  return { text: cleaned, kanban, hl };
}

// --- Todo status ---

/** Extract task status from block content prefix.
 *  Supports orgmode keywords (TODO, DOING, etc.) and markdown checkboxes ([ ], [x]). */
const TODO_KEYWORDS = ['TODO', 'DOING', 'NOW', 'LATER', 'WAIT', 'DONE', 'CANCELLED'];
const TODO_REGEX = new RegExp(`^(${TODO_KEYWORDS.join('|')}) `);

export function parseTodoStatus(content: string): { status: string | null; syntax: 'checkbox' | 'keyword' | null; text: string } {
  const kw = content.match(TODO_REGEX);
  if (kw) {
    const raw = kw[1].toLowerCase();
    return { status: raw === 'now' ? 'doing' : raw, syntax: 'keyword', text: content.slice(kw[0].length) };
  }
  if (/^\[ \] /.test(content)) return { status: 'todo', syntax: 'checkbox', text: content.slice(4) };
  if (/^\[[xX]\] /.test(content)) return { status: 'done', syntax: 'checkbox', text: content.slice(4) };
  return { status: null, syntax: null, text: content };
}

/** Cycle task status.
 *  Checkbox syntax stays as checkboxes: [ ] ↔ [x].
 *  Keyword syntax cycles: none → TODO → DOING → DONE → CANCELLED → TODO.
 *  Handles a leading `- ` bullet marker: preserved through the cycle so
 *  `"- [ ] task"` ↔ `"- [x] task"`. */
export function cycleTodoStatus(content: string): string {
  const bullet = content.startsWith('- ') ? '- ' : '';
  const rest = content.slice(bullet.length);
  const { status, syntax, text } = parseTodoStatus(rest);
  if (syntax === 'checkbox') {
    return `${bullet}${status === 'done' ? '[ ]' : '[x]'} ${text}`;
  }
  const next: Record<string, string> = {
    todo: 'DOING', doing: 'DONE', done: 'CANCELLED', cancelled: 'TODO',
    later: 'DOING', wait: 'DOING',
  };
  if (!status) return `${bullet}TODO ${rest}`;
  return `${bullet}${next[status] ?? 'TODO'} ${text}`;
}

// --- Block classification ---

/** The kind of a content block, derived from its content prefix. Structural
 *  blocks (grid containers, grid cells) aren't classified here — the caller
 *  inspects `block.layout` / `block.col` for those concerns. */
export type BlockClassification =
  | { kind: 'bullet';  text: string; todo?: { status: string; syntax: 'checkbox' | 'keyword' } }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'hrule' }
  | { kind: 'paragraph'; text: string };

/** Classify a block's content. Pure function of the content string;
 *  returns the block's apparent kind and any parsed sub-fields (heading
 *  level, todo status). Structural context (e.g. grid-cell membership)
 *  is not this function's concern — callers decide that structurally. */
export function classifyBlock(content: string): BlockClassification {
  // Heading wins over everything: `# ` through `###### `.
  const h = parseHeading(content);
  if (h.level != null) return { kind: 'heading', level: h.level, text: h.text };

  // Horizontal rule: `---` on its own.
  if (content.trim() === '---') return { kind: 'hrule' };

  // Bullet: `- ` prefix. An empty bullet (`"- "` with nothing after) also
  // matches via `startsWith`.
  if (content.startsWith('- ')) {
    const rest = content.slice(2);
    const td = parseTodoStatus(rest);
    if (td.status && td.syntax) {
      return {
        kind: 'bullet',
        text: td.text,
        todo: { status: td.status, syntax: td.syntax },
      };
    }
    return { kind: 'bullet', text: rest };
  }

  return { kind: 'paragraph', text: content };
}

// --- Journal date helpers ---

export function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isJournalSlug(slug: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(slug);
}

export function formatJournalTitle(slug: string): string {
  const d = new Date(slug + 'T00:00:00');
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
