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
  | 'streak_repair'
  | 'reading'
  | 'path';

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

/** First completion of a Leseecke text — the floor, paid for short A1 pieces. */
export const XP_READING_TEXT = 15;
export const XP_READING_TEXT_MAX = 40;

/**
 * Reading pays by length: the B2–C2 stories run several hundred words, so a
 * flat award would make the 70-word A1 texts the efficient choice. Every 100
 * words past 150 add 5 XP, up to the cap.
 */
export function xpForReadingText(wordCount: number): number {
  const bonus = Math.max(0, Math.floor((wordCount - 150) / 100)) * 5;
  return Math.min(XP_READING_TEXT + bonus, XP_READING_TEXT_MAX);
}

/**
 * Lernpfad: flat award per finished node — the session's vocab/grammar
 * answers don't earn per-answer XP (that would double-pay against the free
 * practice modes), the completed node does.
 */
export const XP_PATH_LESSON = 20;
export const XP_PATH_REVIEW = 15;
export const XP_PATH_REPEAT = 5;

export function xpForPathLesson(kind: 'lesson' | 'review', firstTime: boolean): number {
  if (!firstTime) return XP_PATH_REPEAT;
  return kind === 'review' ? XP_PATH_REVIEW : XP_PATH_LESSON;
}

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

/**
 * Playful rank shown next to the level number. Ids are stable; the names
 * themselves live in the catalogs under `rank.<id>` (see i18n/labels.ts).
 */
export type LevelRankId =
  | 'novice'
  | 'learner'
  | 'explorer'
  | 'collector'
  | 'sentenceBuilder'
  | 'connoisseur'
  | 'wordsmith'
  | 'guru'
  | 'pro'
  | 'master';

const LEVEL_TITLES: [minLevel: number, id: LevelRankId][] = [
  [30, 'master'],
  [25, 'pro'],
  [20, 'guru'],
  [15, 'wordsmith'],
  [12, 'connoisseur'],
  [9, 'sentenceBuilder'],
  [6, 'collector'],
  [4, 'explorer'],
  [2, 'learner'],
  [1, 'novice'],
];

export function levelRankId(level: number): LevelRankId {
  for (const [min, id] of LEVEL_TITLES) if (level >= min) return id;
  return LEVEL_TITLES[LEVEL_TITLES.length - 1][1];
}

/** Streak lengths worth a confetti moment (and a freeze, see streakRepo). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function isStreakMilestone(streak: number): boolean {
  return STREAK_MILESTONES.includes(streak);
}
