/** DOM measurement for placing/dragging a boundary handle against the live overlay's
 * rendered text — ported from the DAMN-2 mockup's `domPositionForOffset`/`xAtOffset`.
 * Real-browser-only (jsdom's layout geometry is all zeros); callers treat a `null`
 * result as "can't position this right now," never as an error. */

function domPositionForOffset(root: Node, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  let remaining = offset;
  let last: Text | null = null;
  while (node) {
    last = node;
    if (remaining <= node.length) return { node, offset: Math.max(0, remaining) };
    remaining -= node.length;
    node = walker.nextNode() as Text | null;
  }
  return last ? { node: last, offset: last.length } : null;
}

export function xAtOffset(lineEl: Element, offset: number): number | null {
  const pos = domPositionForOffset(lineEl, offset);
  if (!pos) return null;
  try {
    const range = document.createRange();
    range.setStart(pos.node, pos.offset);
    range.collapse(true);
    return range.getBoundingClientRect().left;
  } catch {
    // No real layout available (e.g. jsdom has no Range.getBoundingClientRect at
    // all) — callers already treat null as "can't position this right now."
    return null;
  }
}
