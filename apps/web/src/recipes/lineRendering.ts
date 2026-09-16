/**
 * Pure line-rendering helpers shared by IngredientsField/StepsField's live overlay —
 * split out from the components so the heading/list-marker detection logic (ported
 * from the chosen recipe-entry mockup) is independently readable and doesn't get
 * lost in JSX.
 */

import { autoDetectBoundary, getWords, maxIngredientBoundary } from '@dtg/shared';

export function isHeadingText(trimmed: string): boolean {
  return trimmed.length > 1 && trimmed.endsWith(':');
}

export interface RenderedIngredientLine {
  isHeading: boolean;
  /** Character offset (into the raw line) where the recognized quantity ends. `null`
   * when nothing is recognized — still a valid drag target at offset 0. */
  amountEnd: number | null;
}

export function renderIngredientLine(
  text: string,
  override: number | null,
): RenderedIngredientLine {
  const trimmed = text.trim();
  if (isHeadingText(trimmed)) return { isHeading: true, amountEnd: null };
  if (!trimmed) return { isHeading: false, amountEnd: null };
  const words = getWords(text);
  const boundary =
    override != null
      ? Math.min(override, maxIngredientBoundary(words.length))
      : autoDetectBoundary(words);
  if (boundary === 0 || words.length === 0) return { isHeading: false, amountEnd: null };
  return { isHeading: false, amountEnd: words[boundary - 1]!.end };
}

// Numbered ("1.", "2)") or bulleted ("-", "*", "•") list markers, steps only. The
// lookahead (not a consumed \s+) keeps the marker span from including the trailing
// space, and keeps "2.5 cups"-shaped text from false-positiving.
export const LIST_MARKER = /^(\s*)((?:\d+[.)])|[-*•])(?=\s|$)/;

export interface RenderedStepLine {
  isHeading: boolean;
  markerLength: number | null;
}

export function renderStepLine(text: string): RenderedStepLine {
  const trimmed = text.trim();
  if (isHeadingText(trimmed)) return { isHeading: true, markerLength: null };
  const m = text.match(LIST_MARKER);
  return { isHeading: false, markerLength: m ? m[0].length : null };
}
