/**
 * Live inline tokenization for the steps field (DAMN-2 mockup, option 2). Simpler
 * than IngredientsField — no drag handles, just heading/list-marker highlighting
 * and Enter-key list auto-continuation.
 */

import { type KeyboardEvent, useRef } from 'react';

import { LIST_MARKER, renderStepLine } from './lineRendering';
import styles from './TokenizedField.module.css';
import { useAutoGrow } from './useAutoGrow';

interface StepsFieldProps {
  value: string;
  onChange: (text: string) => void;
  onFieldBlur: (text: string) => void;
}

export function StepsField({ value, onChange, onFieldBlur }: StepsFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(textareaRef, value);

  const lines = value.split('\n');

  /**
   * Pressing Enter on a numbered/bulleted line starts the next line with the next
   * marker instead of a bare line break; pressing Enter on an empty marker ends the
   * list. Only decides the *next* marker from the line Enter was pressed on — it
   * does not renumber the rest of a list on an arbitrary edit (decision #4, not
   * built: out of proportion to what was asked for).
   */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return;
    const el = e.currentTarget;
    const cursor = el.selectionStart;
    if (cursor !== el.selectionEnd) return; // a real selection is being replaced

    const text = el.value;
    const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
    const lineEnd = text.indexOf('\n', cursor);
    const beforeCursor = text.slice(lineStart, cursor);
    const afterCursor = text.slice(cursor, lineEnd === -1 ? text.length : lineEnd);

    const numbered = /^(\s*)(\d+)([.)])(\s+)/.exec(beforeCursor);
    const bulleted = numbered ? null : /^(\s*)([-*•])(\s+)/.exec(beforeCursor);
    const match = numbered ?? bulleted;
    if (!match) return; // not on a list line — let the browser insert a normal newline

    const isEmpty = beforeCursor.slice(match[0].length).trim() === '' && afterCursor.trim() === '';
    e.preventDefault();

    let next: string;
    if (isEmpty) {
      next = text.slice(0, lineStart) + text.slice(cursor);
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart));
      return;
    }
    if (numbered) {
      const [, indent, num, punct, gap] = numbered;
      next = `${text.slice(0, cursor)}\n${indent}${Number(num) + 1}${punct}${gap}${text.slice(cursor)}`;
    } else {
      const [, indent, marker, gap] = bulleted!;
      next = `${text.slice(0, cursor)}\n${indent}${marker}${gap}${text.slice(cursor)}`;
    }
    const nextCursor = cursor + (next.length - text.length);
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(nextCursor, nextCursor));
  }

  return (
    <div className={styles.field}>
      <div className={`${styles.layer} ${styles.overlay}`} aria-hidden="true">
        {lines.map((line, i) => {
          const { isHeading, markerLength } = renderStepLine(line);
          return (
            <div key={i} className={`${styles.eline} ${isHeading ? styles.eheading : ''}`}>
              {line === '' ? (
                <br />
              ) : isHeading || markerLength == null ? (
                line
              ) : (
                <>
                  <span className={styles.tokListMarker}>{LIST_MARKER.exec(line)![0]}</span>
                  {line.slice(markerLength)}
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
        aria-label="Steps"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onFieldBlur(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
