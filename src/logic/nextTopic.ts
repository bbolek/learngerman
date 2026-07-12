/**
 * Picks which grammar topic the home screen recommends today.
 *
 * Priority:
 *  1. "due"    — a topic whose spaced-repetition card has come due: revisiting
 *                it before it fades is the whole point of scheduling.
 *  2. "weak"   — the attempted topic with the lowest accuracy below the
 *                threshold: fixing weak spots beats novelty.
 *  3. "new"    — an unattempted topic from the lowest CEFR level that still
 *                has open topics, rotating daily so the suggestion changes
 *                every day instead of being stuck on one topic.
 *  4. "review" — everything practiced and solid: rotate daily to refresh.
 */

export interface TopicStats {
  id: number;
  title: string;
  level: 'A1' | 'A2' | 'B1';
  attempts: number;
  correct: number;
  /** SRS card is due today (set by the caller from grammar_srs). */
  due?: boolean;
}

export type NextTopicReason = 'due' | 'weak' | 'new' | 'review';

export interface NextTopic<T extends TopicStats> {
  topic: T;
  reason: NextTopicReason;
  /** 0..1 for attempted topics, null for unattempted. */
  accuracy: number | null;
}

const WEAK_THRESHOLD = 0.75;

/** Deterministic hash of the day key so the rotation is stable within a day. */
function dayHash(dayKey: string): number {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  return h;
}

export function pickNextTopic<T extends TopicStats>(
  topics: T[],
  dayKey: string
): NextTopic<T> | null {
  if (topics.length === 0) return null;
  const acc = (t: TopicStats) => (t.attempts === 0 ? null : t.correct / t.attempts);

  // Due cards first — weakest-scoring due topic leads, so the shakiest
  // material resurfaces before comfortable revision.
  const due = topics
    .filter((t) => t.due)
    .sort((a, b) => (acc(a) ?? 1) - (acc(b) ?? 1));
  if (due.length > 0) return { topic: due[0], reason: 'due', accuracy: acc(due[0]) };

  const weak = topics
    .filter((t) => t.attempts > 0 && (acc(t) as number) < WEAK_THRESHOLD)
    .sort((a, b) => (acc(a) as number) - (acc(b) as number));
  if (weak.length > 0) return { topic: weak[0], reason: 'weak', accuracy: acc(weak[0]) };

  const fresh = topics.filter((t) => t.attempts === 0);
  if (fresh.length > 0) {
    // 'A1' < 'A2' < 'B1' holds lexicographically.
    const lowestLevel = fresh.reduce((min, t) => (t.level < min ? t.level : min), fresh[0].level);
    const pool = fresh.filter((t) => t.level === lowestLevel);
    const topic = pool[dayHash(dayKey) % pool.length];
    return { topic, reason: 'new', accuracy: null };
  }

  const topic = topics[dayHash(dayKey) % topics.length];
  return { topic, reason: 'review', accuracy: acc(topic) };
}
