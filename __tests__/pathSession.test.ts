import {
  buildLessonPlan,
  buildReviewPlan,
  seedFromString,
  type PathExercise,
  type PlanWord,
} from '../src/logic/pathSession';

const words = (n: number, pos = 'noun'): PlanWord[] =>
  Array.from({ length: n }, (_, i) => ({ lemmaId: i + 1, pos }));

const distractors: PlanWord[] = Array.from({ length: 10 }, (_, i) => ({
  lemmaId: 100 + i,
  pos: 'noun',
}));

function lemmaOf(e: PathExercise): number | null {
  return e.kind === 'grammar' ? null : e.lemmaId;
}

describe('buildLessonPlan', () => {
  const plan = buildLessonPlan(words(8), distractors, [901, 902, 903, 904], 42);

  it('teaches every word exactly three times (intro, recognize, produce)', () => {
    for (const w of words(8)) {
      const mine = plan.filter((e) => lemmaOf(e) === w.lemmaId);
      expect(mine).toHaveLength(3);
      expect(mine[0].kind).toBe('intro');
      expect(mine[1].kind).toBe('vocab_mc');
      expect(['vocab_type', 'vocab_mc']).toContain(mine[2].kind);
    }
  });

  it('includes every grammar question exactly once, none in the first third', () => {
    const grammarAt = plan
      .map((e, i) => (e.kind === 'grammar' ? i : -1))
      .filter((i) => i >= 0);
    expect(grammarAt).toHaveLength(4);
    expect(Math.min(...grammarAt)).toBeGreaterThanOrEqual(Math.floor(plan.length / 3) - 4);
    const ids = plan.filter((e) => e.kind === 'grammar').map((e) => (e as any).questionId);
    expect([...ids].sort()).toEqual([901, 902, 903, 904]);
  });

  it('never shows the same word in consecutive exercises', () => {
    for (let i = 1; i < plan.length; i++) {
      const a = lemmaOf(plan[i - 1]);
      const b = lemmaOf(plan[i]);
      if (a != null && b != null) expect(a).not.toBe(b);
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    const again = buildLessonPlan(words(8), distractors, [901, 902, 903, 904], 42);
    expect(again).toEqual(plan);
    const other = buildLessonPlan(words(8), distractors, [901, 902, 903, 904], 43);
    expect(other).not.toEqual(plan);
  });

  it('MC options contain the answer and no duplicates', () => {
    for (const e of plan) {
      if (e.kind !== 'vocab_mc') continue;
      expect(e.optionIds).toContain(e.lemmaId);
      expect(new Set(e.optionIds).size).toBe(e.optionIds.length);
      expect(e.optionIds.length).toBe(4);
    }
  });

  it('handles an odd word count without adjacent repeats', () => {
    const plan7 = buildLessonPlan(words(7), distractors, [], 7);
    for (let i = 1; i < plan7.length; i++) {
      const a = lemmaOf(plan7[i - 1]);
      const b = lemmaOf(plan7[i]);
      if (a != null && b != null) expect(a).not.toBe(b);
    }
    expect(plan7.filter((e) => e.kind === 'intro')).toHaveLength(7);
  });

  it('falls back to typed recall when the option pool is too small for MC', () => {
    const tiny = buildLessonPlan(words(2), [], [], 1);
    expect(tiny.every((e) => e.kind !== 'vocab_mc')).toBe(true);
  });

  it('seed helper is stable', () => {
    expect(seedFromString('a1-hallo-1')).toBe(seedFromString('a1-hallo-1'));
    expect(seedFromString('a1-hallo-1')).not.toBe(seedFromString('a1-hallo-2'));
  });
});

describe('buildReviewPlan', () => {
  it('takes due words first and fills up to the cap', () => {
    const due = words(3);
    const fill = Array.from({ length: 10 }, (_, i) => ({ lemmaId: 50 + i, pos: 'verb' }));
    const plan = buildReviewPlan(due, fill, [], 8, 5);
    const lemmas = plan.map(lemmaOf).filter((l): l is number => l != null);
    expect(lemmas).toHaveLength(8);
    for (const d of due) expect(lemmas).toContain(d.lemmaId);
  });

  it('has no intro exercises', () => {
    const plan = buildReviewPlan(words(5), [], [], 10, 5);
    expect(plan.every((e) => e.kind !== 'intro')).toBe(true);
  });

  it('interleaves grammar questions', () => {
    const plan = buildReviewPlan(words(6), [], [801, 802], 10, 5);
    const ids = plan.filter((e) => e.kind === 'grammar').map((e) => (e as any).questionId);
    expect([...ids].sort()).toEqual([801, 802]);
  });

  it('does not duplicate a word that is both due and fill', () => {
    const due = words(3);
    const plan = buildReviewPlan(due, words(5), [], 10, 5);
    const lemmas = plan.map(lemmaOf).filter((l): l is number => l != null);
    expect(new Set(lemmas).size).toBe(lemmas.length);
    expect(lemmas).toHaveLength(5);
  });

  it('caps at zero gracefully', () => {
    expect(buildReviewPlan(words(3), [], [], 0, 1)).toEqual([]);
  });
});
