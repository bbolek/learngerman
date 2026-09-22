/**
 * CEFR levels — the single rank table for gating content to the user's
 * level (Sprachniveau in settings, seeded by the Einstufungstest).
 * Pure module, no RN imports.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Position in the CEFR ladder; -1 for unknown strings. */
export function levelRank(level: string): number {
  return CEFR_LEVELS.indexOf(level as CefrLevel);
}

/**
 * The level pool a learner at `level` should see — exactly that level.
 * Unknown input degrades to every level (no gate).
 */
export function levelPool(level: string): CefrLevel[] {
  const rank = levelRank(level);
  return rank < 0 ? [...CEFR_LEVELS] : [CEFR_LEVELS[rank]];
}

/** Whether content at `level` belongs in a `userLevel` learner's view. */
export function atLevel(level: string, userLevel: string): boolean {
  const rank = levelRank(level);
  return rank >= 0 && rank === levelRank(userLevel);
}
