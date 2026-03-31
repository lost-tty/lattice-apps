/** Get the cursor's character offset within a contentEditable element.
 *  Handles both cases: focusNode is the text node (offset = char index)
 *  or focusNode is the element (offset = child index → convert). */
export function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.focusNode) return 0;
  if (sel.focusNode === el) {
    // focusOffset is a child index — sum text lengths up to it
    let offset = 0;
    for (let i = 0; i < sel.focusOffset && i < el.childNodes.length; i++) {
      offset += el.childNodes[i].textContent?.length ?? 0;
    }
    return offset;
  }
  return sel.focusOffset;
}

/** Place the caret inside a contentEditable element.
 *  `position` is relative to the content (after prefix).
 *  Always targets the text node (not the element) so that
 *  sel.focusOffset is a character offset, not a child index. */
export function setCursor(el: HTMLElement, position: 'start' | 'end' | number, prefixLen: number) {
  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== 3) return; // need a text node
  const len = textNode.textContent?.length ?? 0;
  const sel = window.getSelection()!;
  const range = document.createRange();
  let offset: number;
  if (typeof position === 'number') {
    offset = Math.min(position + prefixLen, len);
  } else if (position === 'start') {
    offset = prefixLen;
  } else {
    offset = len;
  }
  range.setStart(textNode, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
