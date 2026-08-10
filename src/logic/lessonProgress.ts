/**
 * Mid-lesson resume for the Lernpfad player — pure, RN-free, no clocks.
 *
 * The lesson screen snapshots its run (queue, position, score, first-try
 * grammar results) at every step boundary; reopening the lesson restores the
 * snapshot instead of rebuilding a fresh plan. Snapshots reference content by
 * lemma/question id, which is NOT stable across content swaps — callers must
 * resolve every referenced id against live content and discard the snapshot
 * when anything is missing.
 */

import { type PathExercise } from '@/logic/pathSession';

export const SAVED_SESSION_VERSION = 1;

export interface SavedQueueItem {
  ex: PathExercise;
  retry: boolean;
}

export interface SavedLessonSession {
  version: typeof SAVED_SESSION_VERSION;
  slug: string;
  savedAt: string;
  /** Next step to play; always < queue.length (finished runs are cleared). */
  index: number;
  correct: number;
  total: number;
  queue: SavedQueueItem[];
  /** First-try result per grammar question id. */
  grammarResults: [number, boolean][];
}

function isValidExercise(ex: unknown): ex is PathExercise {
  if (typeof ex !== 'object' || ex === null) return false;
  const e = ex as Record<string, unknown>;
  switch (e.kind) {
    case 'intro':
    case 'vocab_type':
      return typeof e.lemmaId === 'number';
    case 'vocab_mc':
      return (
        typeof e.lemmaId === 'number' &&
        (e.direction === 'de_en' || e.direction === 'en_de') &&
        Array.isArray(e.optionIds) &&
        e.optionIds.length > 0 &&
        e.optionIds.every((id) => typeof id === 'number')
      );
    case 'grammar':
      return typeof e.questionId === 'number';
    default:
      return false;
  }
}

/**
 * Structural validation of a stored snapshot (raw parsed JSON). Returns the
 * typed snapshot when it is a coherent, unfinished run of `slug`, else null.
 */
export function parseSavedSession(raw: unknown, slug: string): SavedLessonSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== SAVED_SESSION_VERSION) return null;
  if (s.slug !== slug) return null;
  if (typeof s.savedAt !== 'string') return null;
  if (!Array.isArray(s.queue) || s.queue.length === 0) return null;
  const queueOk = s.queue.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).retry === 'boolean' &&
      isValidExercise((item as Record<string, unknown>).ex)
  );
  if (!queueOk) return null;
  if (!Number.isInteger(s.index) || (s.index as number) < 0 || (s.index as number) >= s.queue.length)
    return null;
  if (!Number.isInteger(s.correct) || !Number.isInteger(s.total)) return null;
  if ((s.correct as number) < 0 || (s.correct as number) > (s.total as number)) return null;
  if (!Array.isArray(s.grammarResults)) return null;
  const resultsOk = s.grammarResults.every(
    (r: unknown) =>
      Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'boolean'
  );
  if (!resultsOk) return null;
  return raw as SavedLessonSession;
}

/**
 * Ids the snapshot references that the freshly loaded content can't resolve.
 * Distractor pools and review question draws are randomized per load, so a
 * valid snapshot routinely needs a few rows fetched by id; after a content
 * swap the ids themselves may be gone — then the snapshot must be discarded.
 */
export function missingSessionIds(
  session: SavedLessonSession,
  knownLemmaIds: ReadonlySet<number>,
  knownQuestionIds: ReadonlySet<number>
): { lemmaIds: number[]; questionIds: number[] } {
  const lemmaIds = new Set<number>();
  const questionIds = new Set<number>();
  for (const { ex } of session.queue) {
    if (ex.kind === 'grammar') {
      if (!knownQuestionIds.has(ex.questionId)) questionIds.add(ex.questionId);
      continue;
    }
    if (!knownLemmaIds.has(ex.lemmaId)) lemmaIds.add(ex.lemmaId);
    if (ex.kind === 'vocab_mc') {
      for (const id of ex.optionIds) if (!knownLemmaIds.has(id)) lemmaIds.add(id);
    }
  }
  return { lemmaIds: [...lemmaIds], questionIds: [...questionIds] };
}
