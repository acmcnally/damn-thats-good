import { z } from 'zod';

import { autoDetectBoundary, getWords, splitAtBoundary } from './ingredient-parser';

export const CONTENT_SCHEMA_VERSION = 1 as const;

const lineId = z.uuid(); // crypto.randomUUID() — assigned by the client-side reconciler below, never re-derived from array position

const headingLine = z.object({
  id: lineId,
  kind: z.literal('heading'),
  text: z.string().trim().min(1).max(200), // stored WITHOUT trailing colon — see decision #3
});

/** A blank (or whitespace-only) line the user left as spacing — between a section's
 * last item and the next heading, say. Carries no content of its own; kept as its own
 * line so the spacing survives a save instead of collapsing when the recipe is
 * reopened for editing. Never produced by anything that reads recipe content for
 * search/scaling/shopping-list purposes — those skip it same as they'd skip nothing
 * at all. */
const blankLine = z.object({
  id: lineId,
  kind: z.literal('blank'),
});

/**
 * `quantity` and `item` are the two substrings either side of the tokenizer's detected
 * (or user-dragged) boundary. Both plain strings in V1 — "2 cups", "1 1/2", "a pinch" for
 * quantity; numeric/unit decomposition for scaling is an additive V2 field, not built
 * here (ADR-0006 permits additive evolution; only per-line ids are load-bearing enough
 * to need to be right on the first pass).
 */
const ingredientLine = z.object({
  id: lineId,
  kind: z.literal('ingredient'),
  raw: z.string().trim().min(1).max(500), // full line, verbatim — source of truth for re-editing
  quantity: z.string().max(100), // '' when the parser found no leading quantity
  item: z.string().trim().min(1).max(500),
  parseStatus: z.enum(['auto', 'confirmed']), // see decision #2
});

const stepLine = z.object({
  id: lineId,
  kind: z.literal('step'),
  text: z.string().trim().min(1).max(4000), // markdown; list markers are literal characters
});

function uniqueIds(entries: { id: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  for (const [i, e] of entries.entries()) {
    if (seen.has(e.id))
      ctx.addIssue({ code: 'custom', message: `duplicate line id ${e.id}`, path: [i, 'id'] });
    seen.add(e.id);
  }
}

export const recipeContentSchema = z.object({
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  ingredients: z
    .array(z.discriminatedUnion('kind', [headingLine, ingredientLine, blankLine]))
    .max(300)
    .superRefine(uniqueIds),
  steps: z
    .array(z.discriminatedUnion('kind', [headingLine, stepLine, blankLine]))
    .max(300)
    .superRefine(uniqueIds),
});

export type RecipeContent = z.infer<typeof recipeContentSchema>;
export type HeadingLine = z.infer<typeof headingLine>;
export type IngredientLine = z.infer<typeof ingredientLine>;
export type StepLine = z.infer<typeof stepLine>;
export type BlankLine = z.infer<typeof blankLine>;
export type IngredientOrHeadingLine = RecipeContent['ingredients'][number];
export type StepOrHeadingLine = RecipeContent['steps'][number];

// ---- Line reconciliation --------------------------------------------------------

/** A trimmed line ending in ":" is a section heading — same rule the mockup's live
 * overlay used, applied here at persistence time instead of render time. */
function isHeadingText(trimmed: string): boolean {
  return trimmed.length > 1 && trimmed.endsWith(':');
}

/** Reconstructs the exact editable-field text a stored ingredient/heading line came
 * from — the heading colon is added back (decision #3 strips it at persistence), an
 * ingredient line's `raw` is already the verbatim source. Used both as `reconcileLines`'
 * `canonicalText` and to seed the entry form's textarea when a recipe is loaded for
 * editing, so the two stay in lockstep by construction. */
export function ingredientOrHeadingLineToRawText(line: IngredientOrHeadingLine): string {
  if (line.kind === 'blank') return '';
  return line.kind === 'heading' ? `${line.text}:` : line.raw;
}

/** Same as above, for the steps field. */
export function stepOrHeadingLineToRawText(line: StepOrHeadingLine): string {
  if (line.kind === 'blank') return '';
  return line.kind === 'heading' ? `${line.text}:` : line.text;
}

/** Fresh auto-parse for an ingredient/heading line with no previous match. */
export function parseNewIngredientOrHeadingLine(
  raw: string,
): Omit<HeadingLine, 'id'> | Omit<IngredientLine, 'id'> | Omit<BlankLine, 'id'> {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'blank' };
  if (isHeadingText(trimmed)) {
    return { kind: 'heading', text: trimmed.slice(0, -1).trim() };
  }
  const boundary = autoDetectBoundary(getWords(raw));
  const { quantity, item } = splitAtBoundary(raw, boundary);
  return { kind: 'ingredient', raw, quantity, item, parseStatus: 'auto' };
}

/** Fresh auto-parse for a step/heading line with no previous match. */
export function parseNewStepOrHeadingLine(
  raw: string,
): Omit<HeadingLine, 'id'> | Omit<StepLine, 'id'> | Omit<BlankLine, 'id'> {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'blank' };
  if (isHeadingText(trimmed)) {
    return { kind: 'heading', text: trimmed.slice(0, -1).trim() };
  }
  return { kind: 'step', text: trimmed };
}

/**
 * Reconciles a freshly re-split textarea against the last-committed line array for the
 * same field, preserving `id` (and every other field) for a line whose canonical text is
 * unchanged, minting a fresh id + auto-parse for anything new. Matching is an LCS
 * (longest-common-subsequence) pass over the two canonical-text sequences, treating each
 * line as one atomic token — enough at this scale (each array caps at 300 lines) without
 * within-line diffing. A previous line with no match anywhere in `currentRawLines` is
 * dropped; its id retires. Ambiguity (duplicate identical lines) resolves by nearest
 * index, which is exactly what LCS backtracking does when it pairs occurrences in
 * left-to-right order — low-stakes either way, since a wrong resolution there attributes
 * a diff entry to a line that reads identically anyway, not data corruption.
 *
 * A blank (or whitespace-only) line is pure editing whitespace, not content, but it
 * still becomes its own `kind: 'blank'` line rather than being dropped — that's what
 * lets the spacing survive a save instead of collapsing the next time the recipe is
 * reopened for editing. Canonicalized to `''` before matching (regardless of exactly
 * how much whitespace it is) so the LCS pass doesn't churn ids over whitespace that
 * doesn't matter — every blank current line matches any blank previous line
 * interchangeably, same as the general "duplicate identical lines" case below.
 *
 * Every current line is trimmed before comparison for the same reason: `canonicalText`
 * of a *previous* line is always already edge-trimmed (`raw`/`text` are `z.string()
 * .trim()` in the schema), so comparing it against an untrimmed current line would
 * mismatch a genuinely unchanged line over incidental leading/trailing whitespace —
 * minting it a fresh id and reverting an ingredient's `parseStatus` from `'confirmed'`
 * back to `'auto'` for no real edit.
 */
export function reconcileLines<T extends { id: string }>(
  previous: T[],
  currentRawLines: string[],
  canonicalText: (line: T) => string,
  parseNew: (raw: string) => Omit<T, 'id'>,
): T[] {
  const currentTexts = currentRawLines.map((line) => line.trim());
  const prevTexts = previous.map(canonicalText);
  const n = prevTexts.length;
  const m = currentTexts.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        prevTexts[i] === currentTexts[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const matchedByCurrentIndex = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (prevTexts[i] === currentTexts[j]) {
      matchedByCurrentIndex.set(j, i);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }

  return currentRawLines.map((raw, j) => {
    const matchedIndex = matchedByCurrentIndex.get(j);
    if (matchedIndex !== undefined) return previous[matchedIndex]!;
    return { id: crypto.randomUUID(), ...parseNew(raw) } as T;
  });
}

// ---- diffContent / contentEquals ------------------------------------------------

export type LineDiff<T> =
  | { type: 'added'; after: T }
  | { type: 'removed'; before: T }
  | { type: 'changed'; before: T; after: T } // same id, different fields
  | { type: 'unchanged'; line: T };

export interface ContentDiff {
  ingredients: LineDiff<IngredientOrHeadingLine>[];
  steps: LineDiff<StepOrHeadingLine>[];
}

/** Content equality for diff purposes — deliberately excludes `parseStatus`
 * (phase 5 fix — finding 8): it's bookkeeping about *how* `quantity`/`item` were
 * derived, not content a user would recognize as an edit, so comparing it would mint a
 * version for a boundary drag that landed back where it started. */
function lineContentEquals<T extends { kind: string }>(a: T, b: T): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'heading') {
    return (a as unknown as HeadingLine).text === (b as unknown as HeadingLine).text;
  }
  if (a.kind === 'ingredient') {
    const ia = a as unknown as IngredientLine;
    const ib = b as unknown as IngredientLine;
    return ia.raw === ib.raw && ia.quantity === ib.quantity && ia.item === ib.item;
  }
  if (a.kind === 'step') {
    return (a as unknown as StepLine).text === (b as unknown as StepLine).text;
  }
  if (a.kind === 'blank') return true; // no fields beyond id/kind to compare
  return false;
}

function diffLines<T extends { id: string; kind: string }>(a: T[], b: T[]): LineDiff<T>[] {
  const aById = new Map(a.map((line) => [line.id, line]));
  const bById = new Map(b.map((line) => [line.id, line]));
  const diffs: LineDiff<T>[] = [];

  for (const before of a) {
    if (!bById.has(before.id)) diffs.push({ type: 'removed', before });
  }
  for (const after of b) {
    const before = aById.get(after.id);
    if (!before) {
      diffs.push({ type: 'added', after });
    } else if (!lineContentEquals(before, after)) {
      diffs.push({ type: 'changed', before, after });
    } else {
      diffs.push({ type: 'unchanged', line: after });
    }
  }
  return diffs;
}

/** Structural, field-level diff keyed by line id, per ADR-0006/0007 — not a text diff.
 * Reordering is intentionally not a distinct diff type here; order-aware move
 * detection and the diff *rendering* are a separate feature's job.
 * TODO: DAMN-3 — version-history/diff/revert UI builds on this. */
export function diffContent(a: RecipeContent, b: RecipeContent): ContentDiff {
  return {
    ingredients: diffLines(a.ingredients, b.ingredients),
    steps: diffLines(a.steps, b.steps),
  };
}

/** The save-time "did anything change?" check — true iff `diffContent` produces no
 * `added`/`removed`/`changed` entries in either array. */
export function contentEquals(a: RecipeContent, b: RecipeContent): boolean {
  const diff = diffContent(a, b);
  const isDegenerate = (diffs: LineDiff<unknown>[]) => diffs.every((d) => d.type === 'unchanged');
  return isDegenerate(diff.ingredients) && isDegenerate(diff.steps);
}
