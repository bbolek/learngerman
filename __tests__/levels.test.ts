import { CEFR_LEVELS, levelRank, levelPool, atLevel } from '../src/logic/levels';

describe('levelRank', () => {
  it('orders the CEFR ladder', () => {
    expect(levelRank('A1')).toBe(0);
    expect(levelRank('C2')).toBe(5);
    expect(levelRank('B1')).toBeLessThan(levelRank('B2'));
  });

  it('is -1 for unknown strings', () => {
    expect(levelRank('D1')).toBe(-1);
    expect(levelRank('')).toBe(-1);
  });
});

describe('levelPool', () => {
  it('is exactly the selected level — no lower levels leak in', () => {
    expect(levelPool('A1')).toEqual(['A1']);
    expect(levelPool('B1')).toEqual(['B1']);
    expect(levelPool('C2')).toEqual(['C2']);
  });

  it('degrades to every level on unknown input', () => {
    expect(levelPool('??')).toEqual([...CEFR_LEVELS]);
  });
});

describe('atLevel', () => {
  it('keeps only content at the user level', () => {
    expect(atLevel('A1', 'A1')).toBe(true);
    expect(atLevel('B1', 'B1')).toBe(true);
    expect(atLevel('A1', 'B1')).toBe(false);
    expect(atLevel('B1', 'B2')).toBe(false);
    expect(atLevel('C1', 'A1')).toBe(false);
  });

  it('excludes unknown content levels', () => {
    expect(atLevel('??', 'C2')).toBe(false);
  });
});
