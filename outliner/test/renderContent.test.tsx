// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { Content } from '../src/renderContent';
import { parseTodoStatus } from '../src/parse';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

function html(text: string): string {
  render(<Content text={text} />, container);
  return container.innerHTML;
}

// ---------------------------------------------------------------------------
// Block display pipeline
// ---------------------------------------------------------------------------

describe('block display pipeline', () => {
  it('plain text appears exactly once in rendered output', () => {
    const { status, text } = parseTodoStatus('Hello world');
    expect(status).toBeNull();
    expect((html(text).match(/Hello world/g) ?? []).length).toBe(1);
  });

  it('TODO prefix is stripped and body appears exactly once', () => {
    const { status, text } = parseTodoStatus('TODO buy milk');
    expect(status).toBe('todo');
    const out = html(text);
    expect(out).not.toContain('TODO');
    expect((out.match(/buy milk/g) ?? []).length).toBe(1);
  });

  it('wiki link text appears exactly once as visible content', () => {
    const { text } = parseTodoStatus('see [[Research]]');
    expect((html(text).match(/>Research</g) ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// renderContent
// ---------------------------------------------------------------------------

describe('renderContent', () => {
  it('renders wiki links', () => {
    const out = html('see [[Foo]]');
    expect(out).toContain('class="wiki-link"');
    expect(out).toContain('data-page="Foo"');
    expect(out).toContain('>Foo<');
  });

  it('renders bold', () => {
    expect(html('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders italic', () => {
    expect(html('*italic*')).toContain('<em>italic</em>');
  });

  it('renders code without inner formatting', () => {
    const out = html('`**not bold**`');
    expect(out).toContain('<code>**not bold**</code>');
    expect(out).not.toContain('<strong>');
  });

  it('renders strikethrough', () => {
    expect(html('~~deleted~~')).toContain('<s>deleted</s>');
  });

  it('renders inline math $...$', () => {
    const out = html('Energy is $E=mc^2$ right?');
    expect(out).toContain('<math');
    expect(out).toContain('Energy is');
    expect(out).toContain('right?');
  });

  it('renders display math $$...$$', () => {
    const out = html('$$\\frac{a}{b}$$');
    expect(out).toContain('<math');
    expect(out).toContain('display="block"');
  });

  it('does not render math inside code spans', () => {
    const out = html('`$x^2$`');
    expect(out).toContain('<code>');
    expect(out).not.toContain('<math');
  });

  it('renders highlight', () => {
    expect(html('==important==')).toContain('<mark>important</mark>');
  });

  it('renders colored highlight', () => {
    expect(html('==text==[.hl-3]')).toContain('<mark class="hl-3">text</mark>');
  });

  it('renders colored highlight without affecting surrounding text', () => {
    const out = html('before ==text==[.hl-1] after');
    expect(out).toContain('before');
    expect(out).toContain('<mark class="hl-1">text</mark>');
    expect(out).toContain('after');
  });

  it('renders hyperlinks', () => {
    const out = html('see [Docs](https://example.com)');
    expect(out).toContain('class="hyperlink"');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>Docs<');
    expect(out).toContain('target="_blank"');
  });

  it('auto-links bare URLs', () => {
    const out = html('visit https://example.com for info');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>https://example.com<');
  });

  it('does not double-link URLs inside [text](url) syntax', () => {
    const out = html('[click here](https://example.com)');
    expect((out.match(/<a /g) ?? []).length).toBe(1);
    expect(out).toContain('>click here<');
  });

  it('does not double-link when URL is the link text', () => {
    const out = html('[https://example.com](https://example.com)');
    expect((out.match(/<a /g) ?? []).length).toBe(1);
  });

  it('does not confuse wiki links with hyperlinks', () => {
    const out = html('[[Page]] and [link](http://x.com)');
    expect(out).toContain('class="wiki-link"');
    expect(out).toContain('class="hyperlink"');
    expect(out).toContain('data-page="Page"');
    expect(out).toContain('href="http://x.com"');
  });

  it('renders single-word tags', () => {
    const out = html('hello #world');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="world"');
  });

  it('renders multi-word tags with #[[...]] syntax', () => {
    const out = html('tagged #[[my project]]');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="my project"');
    expect(out).toContain('#my project');
    expect(out).not.toContain('[[');
  });

  it('renders both tag syntaxes on the same line', () => {
    expect((html('#simple and #[[multi word]]').match(/class="tag"/g) ?? []).length).toBe(2);
  });

  it('does not parse tags when not followed by whitespace or end', () => {
    const out = html('email user#name or #good tag');
    expect((out.match(/class="tag"/g) ?? []).length).toBe(1);
    expect(out).toContain('data-page="good"');
    expect(out).not.toContain('data-page="name"');
  });

  it('parses tag at end of string', () => {
    const out = html('end tag #done');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="done"');
  });

  it('parses hierarchical tags with slashes', () => {
    const out = html('tagged #project/frontend here');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="project/frontend"');
    expect(out).toContain('#project/frontend');
  });

  it('parses hierarchical tag at end of string', () => {
    expect(html('see #foo/bar/baz')).toContain('data-page="foo/bar/baz"');
  });

  it('renders a tag with trailing non-breaking space as sole block content', () => {
    // Browsers convert trailing spaces to \u00a0 in contenteditable
    const out = html('#tag\u00a0');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="tag"');
  });

  it('renders a tag with leading non-breaking space as sole block content', () => {
    const out = html('\u00a0#tag');
    expect(out).toContain('class="tag"');
    expect(out).toContain('data-page="tag"');
  });

  it('escapes HTML', () => {
    const out = html('<script>alert("xss")</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('handles mixed formatting', () => {
    const out = html('**bold** and *italic* with [[link]]');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('class="wiki-link"');
  });
});
