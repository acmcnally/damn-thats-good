import { describe, expect, it } from 'vitest';

import {
  CONTENT_SCHEMA_VERSION,
  contentEquals,
  diffContent,
  type IngredientOrHeadingLine,
  ingredientOrHeadingLineToRawText,
  parseNewIngredientOrHeadingLine,
  parseNewStepOrHeadingLine,
  type RecipeContent,
  recipeContentSchema,
  reconcileLines,
  type StepOrHeadingLine,
  stepOrHeadingLineToRawText,
} from './recipe-content';

function content(
  ingredients: RecipeContent['ingredients'] = [],
  steps: RecipeContent['steps'] = [],
): RecipeContent {
  return { contentSchemaVersion: CONTENT_SCHEMA_VERSION, ingredients, steps };
}

function ingredientLine(
  overrides: Partial<Extract<IngredientOrHeadingLine, { kind: 'ingredient' }>> = {},
) {
  return {
    id: crypto.randomUUID(),
    kind: 'ingredient' as const,
    raw: '2 tbsp olive oil',
    quantity: '2 tbsp',
    item: 'olive oil',
    parseStatus: 'auto' as const,
    ...overrides,
  };
}

function headingLine(
  overrides: Partial<Extract<IngredientOrHeadingLine, { kind: 'heading' }>> = {},
) {
  return { id: crypto.randomUUID(), kind: 'heading' as const, text: 'For the chili', ...overrides };
}

function stepLine(overrides: Partial<Extract<StepOrHeadingLine, { kind: 'step' }>> = {}) {
  return { id: crypto.randomUUID(), kind: 'step' as const, text: 'Heat the oil.', ...overrides };
}

describe('recipeContentSchema', () => {
  it('accepts a valid document', () => {
    const result = recipeContentSchema.safeParse(
      content([ingredientLine(), headingLine()], [stepLine()]),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a duplicate line id within one array', () => {
    const id = crypto.randomUUID();
    const result = recipeContentSchema.safeParse(
      content([ingredientLine({ id }), headingLine({ id })]),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const result = recipeContentSchema.safeParse(
      content([
        {
          id: crypto.randomUUID(),
          kind: 'garnish',
          text: 'lime',
        } as unknown as IngredientOrHeadingLine,
      ]),
    );
    expect(result.success).toBe(false);
  });

  it('rejects the wrong contentSchemaVersion', () => {
    const result = recipeContentSchema.safeParse({ ...content(), contentSchemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing id', () => {
    const bad = {
      kind: 'ingredient',
      raw: '2 tbsp oil',
      quantity: '2 tbsp',
      item: 'oil',
      parseStatus: 'auto',
    };
    const result = recipeContentSchema.safeParse(
      content([bad as unknown as IngredientOrHeadingLine]),
    );
    expect(result.success).toBe(false);
  });
});

describe('diffContent / contentEquals', () => {
  it('reports no-op for identical content', () => {
    const a = content([ingredientLine()], [stepLine()]);
    expect(contentEquals(a, a)).toBe(true);
    const diff = diffContent(a, a);
    expect(diff.ingredients.every((d) => d.type === 'unchanged')).toBe(true);
    expect(diff.steps.every((d) => d.type === 'unchanged')).toBe(true);
  });

  it('detects an added line', () => {
    const shared = ingredientLine();
    const a = content([shared]);
    const b = content([shared, ingredientLine({ raw: '1 onion', quantity: '1', item: 'onion' })]);
    const diff = diffContent(a, b);
    expect(diff.ingredients.filter((d) => d.type === 'added')).toHaveLength(1);
  });

  it('detects a removed line', () => {
    const shared = ingredientLine();
    const gone = ingredientLine({ raw: '1 onion', quantity: '1', item: 'onion' });
    const a = content([shared, gone]);
    const b = content([shared]);
    const diff = diffContent(a, b);
    expect(diff.ingredients.filter((d) => d.type === 'removed')).toHaveLength(1);
    expect(contentEquals(a, b)).toBe(false);
  });

  it('detects a changed line (same id, different item text)', () => {
    const id = crypto.randomUUID();
    const a = content([ingredientLine({ id, item: 'olive oil' })]);
    const b = content([ingredientLine({ id, item: 'butter' })]);
    const diff = diffContent(a, b);
    expect(diff.ingredients).toEqual([
      { type: 'changed', before: a.ingredients[0], after: b.ingredients[0] },
    ]);
    expect(contentEquals(a, b)).toBe(false);
  });

  it('excludes parseStatus from equality (phase 5 fix — finding 8)', () => {
    const id = crypto.randomUUID();
    const a = content([ingredientLine({ id, parseStatus: 'auto' })]);
    const b = content([ingredientLine({ id, parseStatus: 'confirmed' })]);
    expect(contentEquals(a, b)).toBe(true);
  });
});

describe('reconcileLines', () => {
  it('keeps the id and fields of an untouched line', () => {
    const line = ingredientLine({ parseStatus: 'confirmed' });
    const [result] = reconcileLines(
      [line],
      [ingredientOrHeadingLineToRawText(line)],
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    expect(result).toBe(line); // same object, not just equal — nothing was re-parsed
  });

  it('mints a fresh id and auto-parses a genuinely new line', () => {
    const [result] = reconcileLines<IngredientOrHeadingLine>(
      [],
      ['2 cups flour'],
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    expect(result!.id).toBeTruthy();
    expect(result).toMatchObject({
      kind: 'ingredient',
      raw: '2 cups flour',
      quantity: '2 cups',
      item: 'flour',
    });
  });

  it('drops a previous line with no match in the current text', () => {
    const kept = ingredientLine({ raw: '2 tbsp oil', quantity: '2 tbsp', item: 'oil' });
    const removed = ingredientLine({ raw: '1 onion', quantity: '1', item: 'onion' });
    const result = reconcileLines(
      [kept, removed],
      [ingredientOrHeadingLineToRawText(kept)],
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(kept);
  });

  it('preserves ids for untouched lines when a new line is inserted above them', () => {
    // The exact bug reconciliation exists to prevent (ADR-0006): a naive index-based
    // scheme would reassign every id below an insertion point.
    const first = ingredientLine({ raw: '2 tbsp oil', quantity: '2 tbsp', item: 'oil' });
    const second = ingredientLine({ raw: '1 onion', quantity: '1', item: 'onion' });
    const result = reconcileLines(
      [first, second],
      [
        '1 tsp salt',
        ingredientOrHeadingLineToRawText(first),
        ingredientOrHeadingLineToRawText(second),
      ],
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    expect(result.map((l) => l.id)).toEqual([expect.anything(), first.id, second.id]);
    expect(result[0]!.id).not.toBe(first.id);
    expect(result[0]!.id).not.toBe(second.id);
  });

  it('round-trips a heading line through its colon-stripped storage form', () => {
    const heading = headingLine({ text: 'For the sauce' });
    expect(ingredientOrHeadingLineToRawText(heading)).toBe('For the sauce:');
    const [result] = reconcileLines(
      [heading],
      [ingredientOrHeadingLineToRawText(heading)],
      ingredientOrHeadingLineToRawText,
      parseNewIngredientOrHeadingLine,
    );
    expect(result).toBe(heading);
  });

  it('re-parses a step/heading line the same way', () => {
    const [result] = reconcileLines<StepOrHeadingLine>(
      [],
      ['For the topping:'],
      stepOrHeadingLineToRawText,
      parseNewStepOrHeadingLine,
    );
    expect(result).toMatchObject({ kind: 'heading', text: 'For the topping' });
  });
});

describe('parseNewIngredientOrHeadingLine', () => {
  it('marks a fresh line as auto, not confirmed', () => {
    const result = parseNewIngredientOrHeadingLine('2 tbsp olive oil');
    expect(result).toMatchObject({ parseStatus: 'auto' });
  });

  it('falls back to an empty quantity when nothing is recognized', () => {
    const result = parseNewIngredientOrHeadingLine('Salt and pepper to taste');
    expect(result).toMatchObject({
      kind: 'ingredient',
      quantity: '',
      item: 'Salt and pepper to taste',
    });
  });
});
