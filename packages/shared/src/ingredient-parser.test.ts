import { describe, expect, it } from 'vitest';

import {
  autoDetectBoundary,
  getWords,
  maxIngredientBoundary,
  splitAtBoundary,
} from './ingredient-parser';

function boundaryFor(line: string): number {
  return autoDetectBoundary(getWords(line));
}

describe('autoDetectBoundary', () => {
  it('recognizes a plain number + unit', () => {
    expect(boundaryFor('2 tbsp olive oil')).toBe(2);
  });

  it('recognizes a mixed number ("1 1/2")', () => {
    expect(boundaryFor('1 1/2 tsp cayenne')).toBe(3);
  });

  it('recognizes a unicode fraction', () => {
    expect(boundaryFor('½ cup sugar')).toBe(2);
  });

  it('recognizes a bare fraction ("1/2")', () => {
    expect(boundaryFor('1/2 cup sugar')).toBe(2);
  });

  it('recognizes a plural unit', () => {
    expect(boundaryFor('2 cups flour')).toBe(2);
  });

  it('does not look past a parenthesized aside for the unit', () => {
    // "(15" isn't a bare quantity word or a recognized unit, so detection stops
    // after "2" — a known, accepted rough edge (the boundary is user-draggable).
    expect(boundaryFor('2 (15 oz) cans white beans')).toBe(1);
  });

  it('recognizes a quantity with no unit at all', () => {
    expect(boundaryFor('3 cloves garlic')).toBe(2); // "cloves" is itself a recognized unit
    expect(boundaryFor('2 onions')).toBe(1); // "onions" is not a unit
  });

  it('returns 0 for a line with no leading quantity', () => {
    expect(boundaryFor('a pinch of salt')).toBe(0);
    expect(boundaryFor('Salt and pepper to taste')).toBe(0);
  });

  it('returns 0 for an empty or whitespace-only line', () => {
    expect(boundaryFor('')).toBe(0);
    expect(boundaryFor('   ')).toBe(0);
  });

  it('handles leading/trailing whitespace without shifting offsets incorrectly', () => {
    const words = getWords('  2 tbsp olive oil  ');
    expect(autoDetectBoundary(words)).toBe(2);
    expect(words[1]!.end).toBe(words[1]!.start + 'tbsp'.length);
  });

  it('never consumes the whole line, even when quantity+unit is everything present', () => {
    // "2 cups" alone: both words match quantity/unit, but consuming both would
    // leave nothing for `item` (schema requires it non-empty).
    expect(boundaryFor('2 cups')).toBe(1);
    expect(boundaryFor('2')).toBe(0); // a single bare quantity word has nowhere to stop but 0
  });
});

describe('maxIngredientBoundary', () => {
  it('leaves at least one word for item', () => {
    expect(maxIngredientBoundary(3)).toBe(2);
    expect(maxIngredientBoundary(1)).toBe(0);
    expect(maxIngredientBoundary(0)).toBe(0);
  });
});

describe('splitAtBoundary', () => {
  it('splits at the given word boundary', () => {
    expect(splitAtBoundary('2 tbsp olive oil', 2)).toEqual({
      quantity: '2 tbsp',
      item: 'olive oil',
    });
  });

  it('falls back to no quantity when boundary is 0', () => {
    expect(splitAtBoundary('a pinch of salt', 0)).toEqual({
      quantity: '',
      item: 'a pinch of salt',
    });
  });

  it('caps a boundary that would consume the whole line', () => {
    expect(splitAtBoundary('2 cups', 2)).toEqual({ quantity: '2', item: 'cups' });
  });

  it('handles an empty line', () => {
    expect(splitAtBoundary('', 0)).toEqual({ quantity: '', item: '' });
  });
});
