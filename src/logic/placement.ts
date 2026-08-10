/**
 * Einstufungstest — a staircase over CEFR levels. The user climbs stage by
 * stage (A1 → C1) while they keep ≥ PASS_RATIO accuracy; the first failed
 * stage stops the test. Passing a level unlocks the path up to the first
 * unit of the next level (without awarding stars — placement opens doors,
 * it doesn't walk through them). Pure rules; screens supply questions.
 */

import { levelRank } from '@/logic/levels';

export type PlacementLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export const PLACEMENT_STAGES: PlacementLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Accuracy needed to clear a stage and climb to the next. */
export const PASS_RATIO = 0.7;

/** Questions per stage — small enough to stay a 5-minute test. */
export const STAGE_SIZE = 8;

export interface StageResult {
  level: PlacementLevel;
  correct: number;
  total: number;
}

export function stagePassed(r: StageResult): boolean {
  return r.total > 0 && r.correct / r.total >= PASS_RATIO;
}

/**
 * The next stage to run, or null when the test is over (a stage was failed,
 * or every stage is passed).
 */
export function nextStage(history: StageResult[]): PlacementLevel | null {
  if (history.some((r) => !stagePassed(r))) return null;
  return PLACEMENT_STAGES[history.length] ?? null;
}

export interface PlacementUnit {
  slug: string;
  level: string;
  /** Global 0-based order of the unit's first node. */
  firstNodeOrder: number;
}

export interface PlacementOutcome {
  /** Highest level fully passed, or null if the very first stage failed. */
  placedLevel: PlacementLevel | null;
  /**
   * Slug of the first unit NOT unlocked (the "you are here" unit), or null
   * when nothing is unlocked (start at the very beginning).
   */
  boundaryUnitSlug: string | null;
  /** First global node order NOT unlocked — feeds computeNodeStates. */
  boundaryOrder: number;
}

/**
 * Map a finished staircase onto the path: everything below the first unit
 * of the first *not-passed* level is unlocked.
 */
export function placementOutcome(
  history: StageResult[],
  units: PlacementUnit[]
): PlacementOutcome {
  let placedLevel: PlacementLevel | null = null;
  for (const r of history) {
    if (!stagePassed(r)) break;
    placedLevel = r.level;
  }
  if (!placedLevel) return { placedLevel: null, boundaryUnitSlug: null, boundaryOrder: 0 };

  // First unit above the placed level (not "the exact next level" — the
  // path may not have units for every CEFR step yet).
  // Unknown unit levels sort high so they land beyond every placed level.
  const rank = (level: string) => {
    const r = levelRank(level);
    return r < 0 ? 99 : r;
  };
  const boundaryUnit = units.find((u) => rank(u.level) > rank(placedLevel!));
  if (!boundaryUnit) {
    // Passed everything the path has — unlock it all.
    const last = units[units.length - 1];
    return {
      placedLevel,
      boundaryUnitSlug: null,
      boundaryOrder: last ? Number.MAX_SAFE_INTEGER : 0,
    };
  }
  return {
    placedLevel,
    boundaryUnitSlug: boundaryUnit.slug,
    boundaryOrder: boundaryUnit.firstNodeOrder,
  };
}
