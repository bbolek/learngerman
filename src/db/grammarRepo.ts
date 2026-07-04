import { getDb } from '@/db/client';
import { type QuestionPayload } from '@/logic/graders';

export interface TopicRow {
  id: number;
  slug: string;
  title: string;
  explainer_md: string;
  question_count: number;
  attempts: number;
  correct: number;
}

export interface QuestionRow {
  id: number;
  qtype: 'mc' | 'fill' | 'order' | 'case_id';
  difficulty: number;
  payload: QuestionPayload;
}

export async function listTopics(): Promise<TopicRow[]> {
  return getDb().getAllAsync<TopicRow>(
    `SELECT t.id, t.slug, t.title, t.explainer_md,
            (SELECT COUNT(*) FROM grammar_questions q WHERE q.topic_id = t.id) AS question_count,
            (SELECT COUNT(*) FROM quiz_attempts a JOIN grammar_questions q ON q.id = a.question_id
              WHERE q.topic_id = t.id) AS attempts,
            (SELECT COUNT(*) FROM quiz_attempts a JOIN grammar_questions q ON q.id = a.question_id
              WHERE q.topic_id = t.id AND a.correct = 1) AS correct
     FROM grammar_topics t
     WHERE (SELECT COUNT(*) FROM grammar_questions q WHERE q.topic_id = t.id) > 0
     ORDER BY t.sort_order`
  );
}

export async function getTopic(topicId: number): Promise<TopicRow | null> {
  const rows = await listTopics();
  return rows.find((t) => t.id === topicId) ?? null;
}

/**
 * Pick a quiz round: questions the user got wrong recently come first, then
 * least-practiced, easier difficulties before harder, random tiebreak.
 */
export async function pickQuestions(topicId: number, count: number): Promise<QuestionRow[]> {
  const rows = await getDb().getAllAsync<{
    id: number;
    qtype: QuestionRow['qtype'];
    difficulty: number;
    payload: string;
  }>(
    `SELECT q.id, q.qtype, q.difficulty, q.payload,
            COALESCE(SUM(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END), 0) AS wrong,
            COUNT(a.id) AS attempts
     FROM grammar_questions q
     LEFT JOIN quiz_attempts a ON a.question_id = q.id
     WHERE q.topic_id = ?
     GROUP BY q.id
     ORDER BY (CASE WHEN COUNT(a.id) > 0 THEN CAST(SUM(CASE WHEN a.correct = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(a.id) ELSE 0.5 END) DESC,
              attempts ASC, q.difficulty ASC, RANDOM()
     LIMIT ?`,
    [topicId, count]
  );
  return rows.map((r) => ({
    id: r.id,
    qtype: r.qtype,
    difficulty: r.difficulty,
    payload: JSON.parse(r.payload) as QuestionPayload,
  }));
}

export async function logAttempt(
  questionId: number,
  correct: boolean,
  answerGiven: unknown,
  now: Date
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO quiz_attempts (question_id, correct, answer_given, attempted_at) VALUES (?, ?, ?, ?)',
      [questionId, correct ? 1 : 0, JSON.stringify(answerGiven ?? null), now.toISOString()]
    );
    const day = now.toISOString().slice(0, 10);
    await db.runAsync(
      `INSERT INTO daily_activity (day, quiz_done) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET quiz_done = quiz_done + 1`,
      [day]
    );
  });
}

/** Per-topic accuracy over the most recent attempts (for mastery rings). */
export function topicAccuracy(topic: TopicRow): number | null {
  if (topic.attempts === 0) return null;
  return topic.correct / topic.attempts;
}
