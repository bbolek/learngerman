import { getDb } from '@/db/client';
import { grantXp, xpEarnedOnDay, type XpGrant } from '@/db/xpRepo';
import {
  questProgress,
  questsForDay,
  type QuestCounters,
  type QuestProgress,
} from '@/logic/quests';

export interface DailyQuestState extends QuestProgress {
  claimed: boolean;
}

async function counters(day: string): Promise<QuestCounters> {
  const row = await getDb().getFirstAsync<{
    reviews_done: number;
    quiz_done: number;
    words_saved: number;
    games_played: number;
  }>('SELECT reviews_done, quiz_done, words_saved, games_played FROM daily_activity WHERE day = ?', [
    day,
  ]);
  return {
    reviews: row?.reviews_done ?? 0,
    quiz: row?.quiz_done ?? 0,
    games: row?.games_played ?? 0,
    words: row?.words_saved ?? 0,
    xp: await xpEarnedOnDay(day),
  };
}

async function claimedKeys(day: string): Promise<Set<string>> {
  const rows = await getDb().getAllAsync<{ quest_key: string }>(
    'SELECT quest_key FROM quest_claims WHERE day = ?',
    [day]
  );
  return new Set(rows.map((r) => r.quest_key));
}

/** Today's quests with live progress and claim status. */
export async function dailyQuests(now: Date): Promise<DailyQuestState[]> {
  const day = now.toISOString().slice(0, 10);
  const [c, claimed] = await Promise.all([counters(day), claimedKeys(day)]);
  return questsForDay(day).map((q) => ({ ...questProgress(q, c), claimed: claimed.has(q.key) }));
}

export interface QuestClaim {
  quest: QuestProgress;
  grant: XpGrant;
}

/**
 * Auto-claim every completed-but-unclaimed quest. Claiming grants XP, which
 * can complete the "Sammle N XP" quest in turn — hence the settle loop.
 */
export async function claimCompletedQuests(now: Date): Promise<QuestClaim[]> {
  const db = getDb();
  const day = now.toISOString().slice(0, 10);
  const quests = questsForDay(day);
  const claims: QuestClaim[] = [];
  for (let pass = 0; pass < quests.length + 1; pass++) {
    const [c, claimed] = await Promise.all([counters(day), claimedKeys(day)]);
    const ready = quests
      .map((q) => questProgress(q, c))
      .filter((q) => q.done && !claimed.has(q.key));
    if (ready.length === 0) break;
    for (const quest of ready) {
      await db.runAsync(
        'INSERT OR IGNORE INTO quest_claims (day, quest_key, xp, claimed_at) VALUES (?, ?, ?, ?)',
        [day, quest.key, quest.xp, now.toISOString()]
      );
      claims.push({ quest, grant: await grantXp('quest', quest.xp, now) });
    }
  }
  return claims;
}
