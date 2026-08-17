/**
 * Achievements / badges (issue #36). Pure definitions + predicates over a
 * stats snapshot; the repo gathers the snapshot and persists unlocks.
 */

export interface AchievementStats {
  /** Lifetime earned XP (spending never takes badges away). */
  totalXp: number;
  level: number;
  /** Current streak in days (freeze-protected days count). */
  streak: number;
  /** Lifetime totals. */
  reviewsDone: number;
  quizDone: number;
  gamesPlayed: number;
  wordsSaved: number;
  /** Distinct days with any activity. */
  activeDays: number;
  /** Best score per arcade game. */
  bestScores: Partial<Record<string, number>>;
  /** Best answer streak across arcade games. */
  bestGameStreak: number;
  /** Lernpfad: completed lessons / fully completed units. */
  pathLessonsDone: number;
  pathUnitsDone: number;
}

/**
 * Title and description live in the translation catalogs under
 * `achievement.<id>.title` / `.description` — this module stays pure data.
 */
export interface AchievementDef {
  /** Stable id persisted in achievements_unlocked — never rename. */
  id: string;
  emoji: string;
  /** Progress toward the goal, for the locked-state hint. */
  progress: (s: AchievementStats) => { current: number; target: number };
}

function counter(
  id: string,
  emoji: string,
  target: number,
  value: (s: AchievementStats) => number
): AchievementDef {
  return {
    id,
    emoji,
    progress: (s) => ({ current: Math.min(value(s), target), target }),
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Streaks
  counter('streak-3', '🔥', 3, (s) => s.streak),
  counter('streak-7', '🔥', 7, (s) => s.streak),
  counter('streak-30', '🌋', 30, (s) => s.streak),
  counter('streak-100', '☄️', 100, (s) => s.streak),
  // Reviews
  counter('reviews-100', '🃏', 100, (s) => s.reviewsDone),
  counter('reviews-500', '📚', 500, (s) => s.reviewsDone),
  counter('reviews-1000', '🏛️', 1000, (s) => s.reviewsDone),
  // Grammar
  counter('quiz-100', '📐', 100, (s) => s.quizDone),
  counter('quiz-500', '🧠', 500, (s) => s.quizDone),
  // Words
  counter('words-25', '💾', 25, (s) => s.wordsSaved),
  counter('words-100', '🗄️', 100, (s) => s.wordsSaved),
  counter('words-250', '🏦', 250, (s) => s.wordsSaved),
  // Games
  counter('games-10', '🕹️', 10, (s) => s.gamesPlayed),
  counter('games-50', '🎮', 50, (s) => s.gamesPlayed),
  counter('blitz-150', '⚡', 150, (s) => s.bestScores['wortblitz'] ?? 0),
  counter('artikel-20', '🎯', 20, (s) => s.bestGameStreak),
  // Levels
  counter('level-5', '⭐', 5, (s) => s.level),
  counter('level-10', '🌟', 10, (s) => s.level),
  counter('level-20', '💫', 20, (s) => s.level),
  // Lernpfad
  counter('path-lessons-10', '🧭', 10, (s) => s.pathLessonsDone),
  counter('path-lessons-50', '🥾', 50, (s) => s.pathLessonsDone),
  counter('path-units-5', '🏔️', 5, (s) => s.pathUnitsDone),
  // Dedication
  counter('days-30', '📅', 30, (s) => s.activeDays),
  counter('xp-2500', '💎', 2500, (s) => s.totalXp),
];

export function isUnlocked(def: AchievementDef, stats: AchievementStats): boolean {
  const { current, target } = def.progress(stats);
  return current >= target;
}

/** Definitions that are earned now but missing from the persisted set. */
export function newlyUnlocked(stats: AchievementStats, unlockedIds: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id) && isUnlocked(a, stats));
}
