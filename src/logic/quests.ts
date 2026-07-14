/**
 * Tagesziele — rotating daily quests (issue #26). Pure and deterministic:
 * the same day always yields the same three quests, so Home can re-derive
 * them at any time without persisting the rotation itself.
 */

export type QuestMetric = 'reviews' | 'quiz' | 'games' | 'words' | 'xp';

export interface QuestDef {
  /** Stable key persisted in quest_claims — never rename existing ones. */
  key: string;
  metric: QuestMetric;
  target: number;
  /** German goal line, e.g. "Wiederhole 15 Karten". */
  title: string;
  emoji: string;
  xp: number;
}

/** Today's counters the quests are measured against. */
export interface QuestCounters {
  reviews: number;
  quiz: number;
  games: number;
  words: number;
  xp: number;
}

/**
 * One pool per metric, easy → ambitious. Rotation picks three different
 * metrics per day so the goals always span learning and play.
 */
const POOL: Record<QuestMetric, QuestDef[]> = {
  reviews: [
    { key: 'reviews-10', metric: 'reviews', target: 10, title: 'Wiederhole 10 Karten', emoji: '🃏', xp: 20 },
    { key: 'reviews-15', metric: 'reviews', target: 15, title: 'Wiederhole 15 Karten', emoji: '🃏', xp: 25 },
    { key: 'reviews-25', metric: 'reviews', target: 25, title: 'Wiederhole 25 Karten', emoji: '🃏', xp: 35 },
  ],
  quiz: [
    { key: 'quiz-5', metric: 'quiz', target: 5, title: 'Beantworte 5 Grammatikfragen', emoji: '📐', xp: 20 },
    { key: 'quiz-10', metric: 'quiz', target: 10, title: 'Beantworte 10 Grammatikfragen', emoji: '📐', xp: 25 },
    { key: 'quiz-20', metric: 'quiz', target: 20, title: 'Beantworte 20 Grammatikfragen', emoji: '📐', xp: 35 },
  ],
  games: [
    { key: 'games-1', metric: 'games', target: 1, title: 'Spiele 1 Spielrunde', emoji: '🕹️', xp: 15 },
    { key: 'games-2', metric: 'games', target: 2, title: 'Spiele 2 Spielrunden', emoji: '🕹️', xp: 25 },
    { key: 'games-3', metric: 'games', target: 3, title: 'Spiele 3 Spielrunden', emoji: '🕹️', xp: 30 },
  ],
  words: [
    { key: 'words-3', metric: 'words', target: 3, title: 'Speichere 3 neue Wörter', emoji: '💾', xp: 15 },
    { key: 'words-5', metric: 'words', target: 5, title: 'Speichere 5 neue Wörter', emoji: '💾', xp: 20 },
  ],
  xp: [
    { key: 'xp-50', metric: 'xp', target: 50, title: 'Sammle 50 XP', emoji: '⭐', xp: 20 },
    { key: 'xp-100', metric: 'xp', target: 100, title: 'Sammle 100 XP', emoji: '⭐', xp: 30 },
  ],
};

const METRICS: QuestMetric[] = ['reviews', 'quiz', 'games', 'words', 'xp'];
export const QUESTS_PER_DAY = 3;

/** Small deterministic hash (FNV-1a) so a day string becomes a stable seed. */
function hashDay(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Three quests for a day (`YYYY-MM-DD`), distinct metrics, seeded rotation. */
export function questsForDay(day: string): QuestDef[] {
  const seed = hashDay(day);
  // Rotate which metrics play today, then pick one difficulty per metric.
  const metrics: QuestMetric[] = [];
  const order = [...METRICS];
  let s = seed;
  while (metrics.length < QUESTS_PER_DAY) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    metrics.push(order.splice(s % order.length, 1)[0]);
  }
  return metrics.map((metric, i) => {
    const variants = POOL[metric];
    return variants[(seed + i * 7919) % variants.length];
  });
}

export interface QuestProgress extends QuestDef {
  current: number;
  done: boolean;
}

export function questProgress(quest: QuestDef, counters: QuestCounters): QuestProgress {
  const current = Math.min(counters[quest.metric], quest.target);
  return { ...quest, current, done: counters[quest.metric] >= quest.target };
}
