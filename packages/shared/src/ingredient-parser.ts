/**
 * Ingredient-line quantity/item boundary detection — ported from the DAMN-2 mockup's
 * `autoDetectBoundary`/`getWords` (`entry-option-2-live-inline.html`), where it drove
 * the live highlight overlay. Promoted here so `apps/web`'s entry form and `DAMN-5`'s
 * URL import share one implementation (technical-design.md).
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

/** How many leading words make up the recognized quantity (+ unit). 0 = nothing
 * recognized. Handles a mixed number ("1 1/2") as two quantity words. */
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
  return i;
}
