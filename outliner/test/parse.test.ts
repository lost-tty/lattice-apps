import { describe, it, expect } from 'vitest';
import { classifyBlock } from '../src/parse';

describe('classifyBlock', () => {
  it('classifies a bullet', () => {
    expect(classifyBlock('- foo')).toEqual({ kind: 'bullet', text: 'foo' });
  });

  it('classifies an empty bullet', () => {
    expect(classifyBlock('- ')).toEqual({ kind: 'bullet', text: '' });
  });

  it('classifies a bullet with checkbox todo', () => {
    expect(classifyBlock('- [ ] task')).toEqual({
      kind: 'bullet', text: 'task',
      todo: { status: 'todo', syntax: 'checkbox' },
    });
  });

  it('classifies a bullet with completed checkbox', () => {
    expect(classifyBlock('- [x] task')).toEqual({
      kind: 'bullet', text: 'task',
      todo: { status: 'done', syntax: 'checkbox' },
    });
  });

  it('classifies a bullet with keyword todo', () => {
    expect(classifyBlock('- TODO task')).toEqual({
      kind: 'bullet', text: 'task',
      todo: { status: 'todo', syntax: 'keyword' },
    });
    expect(classifyBlock('- DONE task')).toEqual({
      kind: 'bullet', text: 'task',
      todo: { status: 'done', syntax: 'keyword' },
    });
  });

  it('classifies a heading', () => {
    expect(classifyBlock('# Title')).toEqual({ kind: 'heading', level: 1, text: 'Title' });
    expect(classifyBlock('### Three')).toEqual({ kind: 'heading', level: 3, text: 'Three' });
  });

  it('classifies a heading even when it also could be a bullet-prefix', () => {
    // The heading rule wins over bullet. A line like "# H" is a heading.
    expect(classifyBlock('# H').kind).toBe('heading');
  });

  it('classifies an hrule', () => {
    expect(classifyBlock('---')).toEqual({ kind: 'hrule' });
  });

  it('classifies a paragraph', () => {
    expect(classifyBlock('plain text')).toEqual({ kind: 'paragraph', text: 'plain text' });
  });

  it('classifies empty string as paragraph', () => {
    expect(classifyBlock('')).toEqual({ kind: 'paragraph', text: '' });
  });

  it('does not treat a bare todo marker as bullet/todo (must be inside a bullet)', () => {
    expect(classifyBlock('[ ] task')).toEqual({ kind: 'paragraph', text: '[ ] task' });
  });

  it('does not treat a lone dash as a bullet', () => {
    expect(classifyBlock('-').kind).toBe('paragraph');
  });
});
