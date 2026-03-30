import { Fragment } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import temml from 'temml';

// ---------------------------------------------------------------------------
// Math helper
// ---------------------------------------------------------------------------

function renderMath(tex: string, display: boolean): VNode {
  let html: string;
  try {
    html = temml.renderToString(tex, { displayMode: display });
  } catch {
    const safe = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = `<code class="math-error">${safe}</code>`;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

type Key = () => number;
type Nodes = VNode | VNode[];
type Rule = { re: RegExp; node: (m: RegExpExecArray, k: Key) => Nodes };

// Rules are tried left-to-right at each position; first (earliest) match wins.
// When two rules match at the same index, the earlier rule in this list wins.
const RULES: Rule[] = [
  { re: /\$\$(.+?)\$\$/,
    node: (m, k) => <Fragment key={k()}>{renderMath(m[1], true)}</Fragment> },

  { re: /\$(.+?)\$/,
    node: (m, k) => <Fragment key={k()}>{renderMath(m[1], false)}</Fragment> },

  { re: /`([^`]+)`/,
    node: (m, k) => <code key={k()}>{m[1]}</code> },

  // #[[multi word tag]] — (^|space) prefix is captured so it can be re-emitted as text
  { re: /(^|[ \t])#\[\[([^\]]+)\]\]/,
    node: (m, k) => [
      ...(m[1] ? [<Fragment key={k()}>{m[1]}</Fragment>] : []),
      <span key={k()} class="tag" data-page={m[2]}>#{m[2]}</span>,
    ] },

  { re: /\[\[([^\]]+)\]\]/,
    node: (m, k) => <span key={k()} class="wiki-link" data-page={m[1]}>{m[1]}</span> },

  { re: /\[([^\]]+)\]\(([^)]+)\)/,
    node: (m, k) => <a key={k()} class="hyperlink" href={m[2]} target="_blank" rel="noopener">{m[1]}</a> },

  // #simple-tag — same prefix handling
  { re: /(^|[ \t])#(\w[\w\-/]*)(?=[ \t]|$)/,
    node: (m, k) => [
      ...(m[1] ? [<Fragment key={k()}>{m[1]}</Fragment>] : []),
      <span key={k()} class="tag" data-page={m[2]}>#{m[2]}</span>,
    ] },

  { re: /\*\*(.+?)\*\*/,
    node: (m, k) => <strong key={k()}>{m[1]}</strong> },

  // *italic* must come after **bold** so a tie at the same index resolves to bold
  { re: /\*(.+?)\*/,
    node: (m, k) => <em key={k()}>{m[1]}</em> },

  { re: /~~(.+?)~~/,
    node: (m, k) => <s key={k()}>{m[1]}</s> },

  { re: /==(.+?)==(?:\[\.hl-(\d+)\])?/,
    node: (m, k) => m[2]
      ? <mark key={k()} class={`hl-${m[2]}`}>{m[1]}</mark>
      : <mark key={k()}>{m[1]}</mark> },

  // bare URL — same prefix handling; (^|space|open-paren)
  { re: /(^|[ \t(])(https?:\/\/[^\s)<]+)/,
    node: (m, k) => [
      ...(m[1] ? [<Fragment key={k()}>{m[1]}</Fragment>] : []),
      <a key={k()} class="hyperlink" href={m[2]} target="_blank" rel="noopener">{m[2]}</a>,
    ] },
];

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderContent(text: string): VNode[] {
  const nodes: VNode[] = [];
  let rest = text;
  let n = 0;
  const key = () => n++;

  while (rest.length > 0) {
    // Find the rule whose match starts earliest in `rest`.
    let best: { rule: Rule; m: RegExpExecArray } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { rule, m };
    }

    if (!best) {
      nodes.push(<Fragment key={key()}>{rest}</Fragment>);
      break;
    }

    if (best.m.index > 0) nodes.push(<Fragment key={key()}>{rest.slice(0, best.m.index)}</Fragment>);

    const result = best.rule.node(best.m, key);
    if (Array.isArray(result)) nodes.push(...result);
    else nodes.push(result);

    rest = rest.slice(best.m.index + best.m[0].length);
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Component wrapper
// ---------------------------------------------------------------------------

/** Renders inline markdown as JSX. Shows `fallback` when text is empty. */
export function Content({ text, fallback }: { text: string; fallback?: ComponentChildren }) {
  const nodes = renderContent(text);
  if (nodes.length === 0) return <>{fallback}</>;
  return <>{nodes}</>;
}
