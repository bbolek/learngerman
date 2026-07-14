import {
  ACHIEVEMENTS,
  isUnlocked,
  newlyUnlocked,
  type AchievementStats,
} from '@/logic/achievements';

const zero: AchievementStats = {
  totalXp: 0,
  level: 1,
  streak: 0,
  reviewsDone: 0,
  quizDone: 0,
  gamesPlayed: 0,
  wordsSaved: 0,
  activeDays: 0,
  bestScores: {},
  bestGameStreak: 0,
};

describe('achievement definitions', () => {
  it('ids are unique and stable-looking', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('nothing unlocks on a fresh install', () => {
    expect(newlyUnlocked(zero, new Set())).toHaveLength(0);
  });

  it('progress never exceeds the target', () => {
    const maxed: AchievementStats = {
      totalXp: 1e6,
      level: 99,
      streak: 999,
      reviewsDone: 99999,
      quizDone: 99999,
      gamesPlayed: 9999,
      wordsSaved: 9999,
      activeDays: 999,
      bestScores: { wortblitz: 9999 },
      bestGameStreak: 999,
    };
    for (const a of ACHIEVEMENTS) {
      const { current, target } = a.progress(maxed);
      expect(current).toBeLessThanOrEqual(target);
      expect(isUnlocked(a, maxed)).toBe(true);
    }
  });
});

describe('unlock thresholds', () => {
  it('streak badges unlock exactly at their length', () => {
    const streak7 = ACHIEVEMENTS.find((a) => a.id === 'streak-7')!;
    expect(isUnlocked(streak7, { ...zero, streak: 6 })).toBe(false);
    expect(isUnlocked(streak7, { ...zero, streak: 7 })).toBe(true);
  });

  it('Blitz-König needs a 150-point Wort-Blitz run', () => {
    const blitz = ACHIEVEMENTS.find((a) => a.id === 'blitz-150')!;
    expect(isUnlocked(blitz, { ...zero, bestScores: { wortblitz: 149 } })).toBe(false);
    expect(isUnlocked(blitz, { ...zero, bestScores: { wortblitz: 150 } })).toBe(true);
    // scores in other games don't count
    expect(isUnlocked(blitz, { ...zero, bestScores: { wortpaare: 500 } })).toBe(false);
  });

  it('newlyUnlocked skips already-persisted badges', () => {
    const stats = { ...zero, streak: 7 };
    const fresh = newlyUnlocked(stats, new Set(['streak-3']));
    expect(fresh.map((a) => a.id)).toEqual(['streak-7']);
  });
});
