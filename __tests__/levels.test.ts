import { CEFR_LEVELS, levelRank, levelsUpTo, withinLevel } from '../src/logic/levels';

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

describe('levelsUpTo', () => {
  it('includes everything up to and including the level', () => {
    expect(levelsUpTo('A1')).toEqual(['A1']);
    expect(levelsUpTo('B1')).toEqual(['A1', 'A2', 'B1']);
    expect(levelsUpTo('C2')).toEqual([...CEFR_LEVELS]);
  });

  it('degrades to every level on unknown input', () => {
    expect(levelsUpTo('??')).toEqual([...CEFR_LEVELS]);
  });
});

describe('withinLevel', () => {
  it('gates content above the user level', () => {
    expect(withinLevel('A1', 'A1')).toBe(true);
    expect(withinLevel('B1', 'B2')).toBe(true);
    expect(withinLevel('C1', 'A1')).toBe(false);
  });

  it('excludes unknown content levels', () => {
    expect(withinLevel('??', 'C2')).toBe(false);
  });
});
