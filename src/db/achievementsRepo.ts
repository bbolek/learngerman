import { getDb } from '@/db/client';
import { countedDays } from '@/db/streakRepo';
import { xpTotals } from '@/db/xpRepo';
import {
  ACHIEVEMENTS,
  newlyUnlocked,
  type AchievementDef,
  type AchievementStats,
} from '@/logic/achievements';
import { computeStreak } from '@/logic/streakSafe';
import { levelForXp } from '@/logic/xp';

async function gatherStats(now: Date): Promise<AchievementStats> {
  const db = getDb();
  const [totals, days, activity, saved, games] = await Promise.all([
    xpTotals(),
    countedDays(),
    db.getFirstAsync<{ reviews: number | null; quiz: number | null; active: number | null }>(
      `SELECT SUM(reviews_done) AS reviews, SUM(quiz_done) AS quiz,
              COUNT(*) AS active
       FROM daily_activity
       WHERE reviews_done > 0 OR quiz_done > 0 OR words_saved > 0 OR games_played > 0`
    ),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM user_saved_words'),
    db.getAllAsync<{ game_key: string; plays: number; best: number; best_streak: number }>(
      `SELECT game_key, COUNT(*) AS plays, MAX(score) AS best, MAX(best_streak) AS best_streak
       FROM game_results GROUP BY game_key`
    ),
  ]);
  const bestScores: Partial<Record<string, number>> = {};
  let gamesPlayed = 0;
  let bestGameStreak = 0;
  for (const g of games) {
    bestScores[g.game_key] = g.best;
    gamesPlayed += g.plays;
    bestGameStreak = Math.max(bestGameStreak, g.best_streak);
  }
  return {
    totalXp: totals.lifetime,
    level: levelForXp(totals.lifetime),
    streak: computeStreak(days, now),
    reviewsDone: activity?.reviews ?? 0,
    quizDone: activity?.quiz ?? 0,
    gamesPlayed,
    wordsSaved: saved?.c ?? 0,
    activeDays: activity?.active ?? 0,
    bestScores,
    bestGameStreak,
  };
}

async function unlockedIds(): Promise<Set<string>> {
  const rows = await getDb().getAllAsync<{ id: string }>('SELECT id FROM achievements_unlocked');
  return new Set(rows.map((r) => r.id));
}

/**
 * Evaluate all badges against live stats, persist fresh unlocks and return
 * them (oldest-defined first) so callers can fire the unlock celebration.
 */
export async function checkAchievements(now: Date): Promise<AchievementDef[]> {
  const [stats, unlocked] = await Promise.all([gatherStats(now), unlockedIds()]);
  const fresh = newlyUnlocked(stats, unlocked);
  const db = getDb();
  for (const def of fresh) {
    await db.runAsync('INSERT OR IGNORE INTO achievements_unlocked (id, unlocked_at) VALUES (?, ?)', [
      def.id,
      now.toISOString(),
    ]);
  }
  return fresh;
}

/** Cheap badge tally for overview screens (no stats sweep). */
export async function unlockedCount(): Promise<number> {
  const row = await getDb().getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM achievements_unlocked'
  );
  return row?.c ?? 0;
}

export interface AchievementStatus {
  def: AchievementDef;
  unlockedAt: string | null;
  current: number;
  target: number;
}

/** Every badge with unlock state + live progress, for the collection screen. */
export async function listAchievements(now: Date): Promise<AchievementStatus[]> {
  const stats = await gatherStats(now);
  const rows = await getDb().getAllAsync<{ id: string; unlocked_at: string }>(
    'SELECT id, unlocked_at FROM achievements_unlocked'
  );
  const when = new Map(rows.map((r) => [r.id, r.unlocked_at]));
  return ACHIEVEMENTS.map((def) => {
    const { current, target } = def.progress(stats);
    return { def, unlockedAt: when.get(def.id) ?? null, current, target };
  });
}
