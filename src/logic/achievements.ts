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
}

export interface AchievementDef {
  /** Stable id persisted in achievements_unlocked — never rename. */
  id: string;
  emoji: string;
  title: string;
  /** Short German description of the goal. */
  description: string;
  /** Progress toward the goal, for the locked-state hint. */
  progress: (s: AchievementStats) => { current: number; target: number };
}

function counter(
  id: string,
  emoji: string,
  title: string,
  description: string,
  target: number,
  value: (s: AchievementStats) => number
): AchievementDef {
  return {
    id,
    emoji,
    title,
    description,
    progress: (s) => ({ current: Math.min(value(s), target), target }),
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Streaks
  counter('streak-3', '🔥', 'Warmgelaufen', '3-Tage-Streak', 3, (s) => s.streak),
  counter('streak-7', '🔥', 'Eine ganze Woche', '7-Tage-Streak', 7, (s) => s.streak),
  counter('streak-30', '🌋', 'Unaufhaltsam', '30-Tage-Streak', 30, (s) => s.streak),
  counter('streak-100', '☄️', 'Hundertwerk', '100-Tage-Streak', 100, (s) => s.streak),
  // Reviews
  counter('reviews-100', '🃏', 'Kartenkenner:in', '100 Karten wiederholt', 100, (s) => s.reviewsDone),
  counter('reviews-500', '📚', 'Fleißarbeit', '500 Karten wiederholt', 500, (s) => s.reviewsDone),
  counter('reviews-1000', '🏛️', 'Karten-Kanon', '1000 Karten wiederholt', 1000, (s) => s.reviewsDone),
  // Grammar
  counter('quiz-100', '📐', 'Regelwerk', '100 Grammatikfragen beantwortet', 100, (s) => s.quizDone),
  counter('quiz-500', '🧠', 'Grammatik-Guru', '500 Grammatikfragen beantwortet', 500, (s) => s.quizDone),
  // Words
  counter('words-25', '💾', 'Sammelalbum', '25 Wörter gespeichert', 25, (s) => s.wordsSaved),
  counter('words-100', '🗄️', 'Wortschatzkammer', '100 Wörter gespeichert', 100, (s) => s.wordsSaved),
  counter('words-250', '🏦', 'Lexikon-Liga', '250 Wörter gespeichert', 250, (s) => s.wordsSaved),
  // Games
  counter('games-10', '🕹️', 'Spieltrieb', '10 Spielrunden gespielt', 10, (s) => s.gamesPlayed),
  counter('games-50', '🎮', 'Arcade-Ass', '50 Spielrunden gespielt', 50, (s) => s.gamesPlayed),
  counter('blitz-150', '⚡', 'Blitz-König:in', '150 Punkte in Wort-Blitz', 150, (s) => s.bestScores['wortblitz'] ?? 0),
  counter('artikel-20', '🎯', 'Artikel-Meister:in', '20er-Serie in einem Spiel', 20, (s) => s.bestGameStreak),
  // Levels
  counter('level-5', '⭐', 'Aufsteiger:in', 'Level 5 erreicht', 5, (s) => s.level),
  counter('level-10', '🌟', 'Zweistellig', 'Level 10 erreicht', 10, (s) => s.level),
  counter('level-20', '💫', 'Höhenflug', 'Level 20 erreicht', 20, (s) => s.level),
  // Dedication
  counter('days-30', '📅', 'Stammgast', 'An 30 Tagen gelernt', 30, (s) => s.activeDays),
  counter('xp-2500', '💎', 'XP-Schatz', '2500 XP gesammelt', 2500, (s) => s.totalXp),
];

export function isUnlocked(def: AchievementDef, stats: AchievementStats): boolean {
  const { current, target } = def.progress(stats);
  return current >= target;
}

/** Definitions that are earned now but missing from the persisted set. */
export function newlyUnlocked(stats: AchievementStats, unlockedIds: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id) && isUnlocked(a, stats));
}
