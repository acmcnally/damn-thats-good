import { type RefObject, useLayoutEffect } from 'react';

/** Grows a textarea to fit its content — no internal scrollbar, ever (owner
 * feedback on the mockup: a small fixed-height box that scrolls hides the
 * ingredient/step list from a glance). Reset to 'auto' first so shrinking (e.g.
 * after deleting a line) is measured correctly. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
