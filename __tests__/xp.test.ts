import {
  isStreakMilestone,
  levelForXp,
  levelProgress,
  levelTitle,
  xpForGameScore,
  xpForLevel,
  xpForQuizAnswer,
  xpForReview,
  XP_GAME_MAX,
  XP_GAME_MIN,
  XP_QUIZ_CORRECT,
  XP_QUIZ_WRONG,
  XP_REVIEW_AGAIN,
  XP_REVIEW_RECALLED,
} from '@/logic/xp';

describe('level curve', () => {
  it('starts at level 1 with 0 XP', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
  });

  it('has escalating thresholds (each level costs 25 XP more than the last)', () => {
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(125);
    expect(xpForLevel(4)).toBe(225);
    expect(xpForLevel(5)).toBe(350);
    for (let l = 3; l < 40; l++) {
      const prevStep = xpForLevel(l) - xpForLevel(l - 1);
      const step = xpForLevel(l + 1) - xpForLevel(l);
      expect(step - prevStep).toBe(25);
    }
  });

  it('levelForXp is the inverse of xpForLevel at boundaries', () => {
    for (let l = 1; l <= 30; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
  });

  it('levelProgress reports position inside the current level', () => {
    const p = levelProgress(60); // level 2 spans 50..125
    expect(p.level).toBe(2);
    expect(p.into).toBe(10);
    expect(p.span).toBe(75);
    expect(p.ratio).toBeCloseTo(10 / 75);
  });

  it('level titles exist for every level', () => {
    for (let l = 1; l <= 40; l++) expect(levelTitle(l).length).toBeGreaterThan(0);
    expect(levelTitle(1)).toBe('Neuling');
    expect(levelTitle(30)).toBe('Deutschmeister:in');
  });
});

describe('award sizes', () => {
  it('reviews: recalled beats "Nochmal"', () => {
    expect(xpForReview(0)).toBe(XP_REVIEW_AGAIN);
    expect(xpForReview(1)).toBe(XP_REVIEW_RECALLED);
    expect(xpForReview(2)).toBe(XP_REVIEW_RECALLED);
    expect(xpForReview(3)).toBe(XP_REVIEW_RECALLED);
  });

  it('quiz: correct beats wrong', () => {
    expect(xpForQuizAnswer(true)).toBe(XP_QUIZ_CORRECT);
    expect(xpForQuizAnswer(false)).toBe(XP_QUIZ_WRONG);
    expect(XP_QUIZ_CORRECT).toBeGreaterThan(XP_QUIZ_WRONG);
  });

  it('games: score/10 clamped to [min, max]', () => {
    expect(xpForGameScore(0)).toBe(XP_GAME_MIN);
    expect(xpForGameScore(120)).toBe(12);
    expect(xpForGameScore(10_000)).toBe(XP_GAME_MAX);
  });
});

describe('streak milestones', () => {
  it('flags the celebrated lengths only', () => {
    expect(isStreakMilestone(3)).toBe(true);
    expect(isStreakMilestone(7)).toBe(true);
    expect(isStreakMilestone(4)).toBe(false);
    expect(isStreakMilestone(0)).toBe(false);
  });
});
