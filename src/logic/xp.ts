/**
 * XP & level economy — the shared progression backbone (issue #24).
 * Pure math only: no RN imports, no clocks. Repos persist events, screens
 * decide when to celebrate.
 */

/** What earned (or cost) the XP — stored on every ledger event. */
export type XpKind =
  | 'review'
  | 'quiz'
  | 'game'
  | 'duel_win'
  | 'duel_played'
  | 'quest'
  | 'streak_repair';

// ---------- award sizes ----------

/** SRS review: full XP for a recalled card, a little for "Nochmal". */
export const XP_REVIEW_RECALLED = 5;
export const XP_REVIEW_AGAIN = 2;

/** Grammar quiz: per answered question. */
export const XP_QUIZ_CORRECT = 5;
export const XP_QUIZ_WRONG = 1;

/** Duels: winning pays, showing up still counts. */
export const XP_DUEL_WIN = 40;
export const XP_DUEL_PLAYED = 10;

/** Same-day streak repair when no Streak-Retter is left. */
export const STREAK_REPAIR_COST = 100;

export function xpForReview(rating: number): number {
  return rating === 0 ? XP_REVIEW_AGAIN : XP_REVIEW_RECALLED;
}

export function xpForQuizAnswer(correct: boolean): number {
  return correct ? XP_QUIZ_CORRECT : XP_QUIZ_WRONG;
}

/**
 * Arcade round → XP: a tenth of the score, clamped so a throwaway round
 * still pays a little and a monster round can't outearn a review session.
 */
export const XP_GAME_MIN = 5;
export const XP_GAME_MAX = 50;

export function xpForGameScore(score: number): number {
  return Math.max(XP_GAME_MIN, Math.min(XP_GAME_MAX, Math.round(score / 10)));
}

// ---------- level curve ----------

/**
 * Total XP required to *reach* a level. Level 1 is the start; each step up
 * costs 25 XP more than the previous one (50, 75, 100, …) so early levels
 * come fast and later ones are earned:
 *   L2 = 50 · L3 = 125 · L4 = 225 · L5 = 350 · L10 = 1175 · L20 = 5225
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const steps = level - 1;
  return 50 * steps + (25 * (steps - 1) * steps) / 2;
}

export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP gathered inside the current level. */
  into: number;
  /** XP needed to go from this level to the next. */
  span: number;
  /** into / span, 0..1. */
  ratio: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const into = totalXp - floor;
  return { level, into, span, ratio: span === 0 ? 1 : into / span };
}

/** Playful German rank names shown next to the level number. */
const LEVEL_TITLES: [minLevel: number, title: string][] = [
  [30, 'Deutschmeister:in'],
  [25, 'Sprachprofi'],
  [20, 'Grammatik-Guru'],
  [15, 'Wortschmied:in'],
  [12, 'Sprachkenner:in'],
  [9, 'Satzbauer:in'],
  [6, 'Wortsammler:in'],
  [4, 'Entdecker:in'],
  [2, 'Lernende:r'],
  [1, 'Neuling'],
];

export function levelTitle(level: number): string {
  for (const [min, title] of LEVEL_TITLES) if (level >= min) return title;
  return LEVEL_TITLES[LEVEL_TITLES.length - 1][1];
}

/** Streak lengths worth a confetti moment (and a freeze, see streakRepo). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function isStreakMilestone(streak: number): boolean {
  return STREAK_MILESTONES.includes(streak);
}
