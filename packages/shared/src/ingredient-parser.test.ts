import { describe, expect, it } from 'vitest';

import { autoDetectBoundary, getWords } from './ingredient-parser';

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
});
