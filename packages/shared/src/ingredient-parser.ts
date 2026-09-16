/**
 * Ingredient-line quantity/item boundary detection — ported from the chosen
 * recipe-entry mockup's `autoDetectBoundary`/`getWords` (`entry-option-2-live-inline.html`),
 * where it drove the live highlight overlay. Promoted here so the entry form and a
 * future URL-import feature can share one implementation.
 *
 * The boundary is expressed as "number of leading words," not a character offset —
 * that's what makes an auto-detected boundary and a user-dragged one indistinguishable
 * to any caller. 0 means nothing recognized.
 */

const UNITS = [
  'tbsp',
  'tsp',
  'cup',
  'cups',
  'oz',
  'lb',
  'lbs',
  'g',
  'kg',
  'ml',
  'l',
  'clove',
  'cloves',
  'can',
  'cans',
  'pinch',
  'dash',
];

const QTY_WORD = /^(?:\d+(?:\.\d+)?|[¼½¾⅓⅔]|\d+\/\d+)$/;

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Whitespace-delimited words with their start/end offsets in the original (untrimmed)
 * string — offsets have to survive round-tripping through a manual drag correction. */
export function getWords(text: string): Word[] {
  const words: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return words;
}

/** The largest boundary that still leaves at least one word for `item` — a schema
 * constraint (`ingredientLine.item` is non-empty), not just a display nicety. A
 * boundary at or past `wordCount` would consume the entire line. */
export function maxIngredientBoundary(wordCount: number): number {
  return Math.max(wordCount - 1, 0);
}

/** How many leading words make up the recognized quantity (+ unit). 0 = nothing
 * recognized. Handles a mixed number ("1 1/2") as two quantity words. Never
 * returns a boundary that would leave nothing for `item` (see
 * `maxIngredientBoundary`) — a lone quantity/unit with no named ingredient after
 * it degrades to "no quantity recognized" rather than an empty item. */
export function autoDetectBoundary(words: Word[]): number {
  const first = words[0];
  if (!first || !QTY_WORD.test(first.text)) return 0;
  let i = 1;
  const second = words[i];
  if (second && QTY_WORD.test(second.text)) i++;
  const unitWord = words[i];
  if (unitWord) {
    const w = unitWord.text.toLowerCase().replace(/[(),]/g, '');
    if (UNITS.includes(w) || UNITS.includes(w.replace(/s$/, ''))) i++;
  }
  return Math.min(i, maxIngredientBoundary(words.length));
}

/** Splits a raw ingredient line at a boundary (word count) into its quantity and
 * item substrings — the same split both auto-detection and a confirmed manual
 * drag correction produce, so both go through one implementation. `boundary` is
 * clamped via `maxIngredientBoundary` so `item` is never empty. */
export function splitAtBoundary(raw: string, boundary: number): { quantity: string; item: string } {
  const words = getWords(raw);
  if (!words.length) return { quantity: '', item: raw.trim() };
  const capped = Math.min(boundary, maxIngredientBoundary(words.length));
  if (capped <= 0) return { quantity: '', item: raw.trim() };
  const amtEnd = words[capped - 1]!.end;
  return { quantity: raw.slice(0, amtEnd).trim(), item: raw.slice(amtEnd).trim() };
}
