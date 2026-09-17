/**
 * Live inline tokenization for the ingredients field (the chosen recipe-entry
 * mockup, option 2) — a transparent `<textarea>` over a read-only highlight
 * overlay, plus a layer of drag handles at each line's detected quantity/item
 * boundary. The overlay text is plain React (safe by default, no HTML-string
 * building); the handles layer is a small imperative escape hatch — its exact
 * pixel position depends on a completed layout pass of the overlay's own text,
 * which a render-time computation can't see yet, so it's built directly against
 * the DOM in a layout effect instead.
 *
 * `overrides` (the per-line drag corrections) is controlled by the parent, not
 * local state here — the parent needs the current value at blur/save time to
 * bake a confirmed boundary into the saved `quantity`/`item`, not just this
 * field's live highlight (see `RecipeEntryForm.reconcileIngredients`). Keyed by
 * the line's own raw text rather than its array index: an index goes stale the
 * moment a line is inserted/removed above it (the same problem line
 * reconciliation exists to solve for stored ids), but a raw-text key doesn't —
 * it naturally stops matching once that exact line is edited or gone, with no
 * separate invalidation step needed.
 */

import { getWords, maxIngredientBoundary } from '@dtg/shared';
import { useLayoutEffect, useRef, useState } from 'react';

import { xAtOffset } from './domMeasure';
import { renderIngredientLine } from './lineRendering';
import styles from './TokenizedField.module.css';
import { useAutoGrow } from './useAutoGrow';

interface IngredientsFieldProps {
  value: string;
  onChange: (text: string) => void;
  onFieldBlur: (text: string) => void;
  overrides: Record<string, number>;
  onOverridesChange: (overrides: Record<string, number>) => void;
}

export function IngredientsField({
  value,
  onChange,
  onFieldBlur,
  overrides,
  onOverridesChange,
}: IngredientsFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const dragLineRef = useRef<number | null>(null);
  const dragCaptureRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  // `updateDrag` is only ever invoked from the mount-only pointermove listener
  // below (see its own comment) — it can't rely on closing over a fresh
  // `overrides`/`onOverridesChange` each render, so both are read through refs
  // kept current on every render instead.
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const onOverridesChangeRef = useRef(onOverridesChange);
  onOverridesChangeRef.current = onOverridesChange;

  useAutoGrow(textareaRef, value);

  const lines = value.split('\n');

  // Rebuilds the handle layer imperatively, after the overlay text above has laid
  // out — a handle's position is "wherever the boundary character actually falls,"
  // which only exists once the browser has rendered this render's text.
  useLayoutEffect(() => {
    const handlesEl = handlesRef.current;
    const overlayEl = overlayRef.current;
    if (!handlesEl || !overlayEl) return;
    handlesEl.replaceChildren();
    const overlayRect = overlayEl.getBoundingClientRect();
    const lineEls = overlayEl.querySelectorAll<HTMLElement>('[data-eline]');

    lineEls.forEach((lineEl, i) => {
      if (lineEl.dataset.heading === 'true') return;
      const lineText = lines[i] ?? '';
      const words = getWords(lineText);
      if (!words.length) return;
      const { amountEnd } = renderIngredientLine(lineText, overrides[lineText] ?? null);
      const charOffset = amountEnd ?? 0;
      const x = xAtOffset(lineEl, charOffset);
      if (x == null) return;
      const lineRect = lineEl.getBoundingClientRect();

      const handle = document.createElement('div');
      handle.className = styles.handle ?? '';
      handle.style.left = `${x - overlayRect.left}px`;
      handle.style.top = `${lineRect.top - overlayRect.top}px`;
      handle.style.height = `${lineRect.height}px`;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startDrag(i);
      });
      handlesEl.appendChild(handle);
    });
  }, [value, overrides]);

  useLayoutEffect(() => {
    function onPointerMove(e: PointerEvent) {
      updateDrag(e.clientX);
    }
    function onPointerUp() {
      endDrag();
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  function startDrag(lineIndex: number) {
    dragLineRef.current = lineIndex;
    setIsDragging(true);
    const capture = document.createElement('div');
    capture.className = styles.dragCapture ?? '';
    document.body.appendChild(capture);
    dragCaptureRef.current = capture;
  }

  function updateDrag(clientX: number) {
    const lineIndex = dragLineRef.current;
    if (lineIndex == null) return;
    const lineText = valueRef.current.split('\n')[lineIndex] ?? '';
    const lineEl = overlayRef.current?.querySelectorAll<HTMLElement>('[data-eline]')[lineIndex];
    const words = getWords(lineText);
    if (!lineEl || !words.length) return;

    // Snap to the nearest word boundary, never mid-word, and never past the
    // point that would leave nothing for `item` (the schema requires it
    // non-empty) — the same constraint auto-detection is capped to.
    let best = 0;
    let bestDist = Infinity;
    for (let b = 0; b <= maxIngredientBoundary(words.length); b++) {
      const charOffset = b === 0 ? 0 : words[b - 1]!.end;
      const x = xAtOffset(lineEl, charOffset);
      if (x == null) continue;
      const dist = Math.abs(x - clientX);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    // Every candidate offset measured `null` this tick (domMeasure.ts: a real,
    // expected case, not an error) — leave the override as it was rather than
    // snapping it to the loop's unmoved initial `best` of 0.
    if (bestDist === Infinity) return;
    onOverridesChangeRef.current({ ...overridesRef.current, [lineText]: best });
  }

  function endDrag() {
    dragLineRef.current = null;
    setIsDragging(false);
    dragCaptureRef.current?.remove();
    dragCaptureRef.current = null;
  }

  return (
    <div className={`${styles.field} ${isDragging ? styles.dragging : ''}`}>
      <div ref={overlayRef} className={`${styles.layer} ${styles.overlay}`} aria-hidden="true">
        {lines.map((line, i) => {
          const { isHeading, amountEnd } = renderIngredientLine(line, overrides[line] ?? null);
          return (
            <div
              key={i}
              data-eline
              data-heading={isHeading}
              className={`${styles.eline} ${isHeading ? styles.eheading : ''}`}
            >
              {line === '' ? (
                <br />
              ) : isHeading || amountEnd == null ? (
                line
              ) : (
                <>
                  <span className={styles.tokAmt}>{line.slice(0, amountEnd)}</span>
                  {line.slice(amountEnd)}
                </>
              )}
            </div>
          );
        })}
      </div>
      <textarea
        ref={textareaRef}
        className={`${styles.layer} ${styles.input}`}
        spellCheck={false}
        aria-label="Ingredients"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onFieldBlur(e.target.value)}
      />
      <div ref={handlesRef} className={styles.handles} aria-hidden="true" />
    </div>
  );
}
