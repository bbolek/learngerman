import { getDb } from '@/db/client';
import { mistakeDueAt, softLapse } from '@/logic/mistakes';

interface SrsRow {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: string;
}

/**
 * Route words missed in a game or duel back into the SRS queue so play feeds
 * targeted review instead of throwing the signal away.
 *
 *  - Already-saved word → soften its ease and bring it forward (soft lapse),
 *    so it comes up again soon without a full "Again" penalty.
 *  - Unsaved word → enrol it as a card tagged `source = 'mistake'`, marked as
 *    already seen (last_reviewed_at = now) and due now, so it lands in the due
 *    queue for the next session rather than competing under the new-card cap.
 *
 * Ids are deduped; an empty list is a no-op. Never bumps `words_saved` — the
 * game already counted toward the streak, and these weren't deliberate saves.
 */
export async function recordMistakes(lemmaIds: number[], now: Date): Promise<void> {
  const ids = [...new Set(lemmaIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return;
  const db = getDb();
  const nowIso = now.toISOString();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      const state = await db.getFirstAsync<SrsRow>(
        'SELECT ease, interval_days, reps, lapses, due_at FROM srs_state WHERE lemma_id = ?',
        [id]
      );
      if (state) {
        const next = softLapse({
          ease: state.ease,
          intervalDays: state.interval_days,
          reps: state.reps,
          lapses: state.lapses,
        });
        const dueAt = mistakeDueAt(new Date(state.due_at), now);
        await db.runAsync(
          `UPDATE srs_state
              SET ease = ?, interval_days = ?, due_at = ?,
                  last_reviewed_at = COALESCE(last_reviewed_at, ?)
            WHERE lemma_id = ?`,
          [next.ease, next.intervalDays, dueAt.toISOString(), nowIso, id]
        );
      } else {
        await db.runAsync(
          "INSERT OR IGNORE INTO user_saved_words (lemma_id, saved_at, source) VALUES (?, ?, 'mistake')",
          [id, nowIso]
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO srs_state
             (lemma_id, ease, interval_days, reps, lapses, due_at, last_reviewed_at)
           VALUES (?, 2.5, 0, 0, 0, ?, ?)`,
          [id, nowIso, nowIso]
        );
      }
    }
  });
}
