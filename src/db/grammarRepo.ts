import { getDb } from '@/db/client';
import { type QuestionPayload } from '@/logic/graders';
import {
  deriveStatus,
  masteryCounts,
  pickRoundRows,
  questionStatusRows,
  type QuestionStatus,
  type RoundMode,
} from '@/logic/quizRound';

export interface TopicRow {
  id: number;
  slug: string;
  title: string;
  level: 'A1' | 'A2' | 'B1';
  explainer_md: string;
  /** Distinct dictionary words the topic introduces via [[vocab]] markers. */
  vocab_count: number;
  question_count: number;
  attempts: number;
  correct: number;
  /** Questions answered correctly at least once. */
  mastered_count: number;
}

export interface QuestionRow {
  id: number;
  qtype: 'mc' | 'fill' | 'order' | 'case_id';
  difficulty: number;
  payload: QuestionPayload;
}

export async function listTopics(): Promise<TopicRow[]> {
  return getDb().getAllAsync<TopicRow>(
    `SELECT t.id, t.slug, t.title, t.level, t.explainer_md, t.vocab_count,
            (SELECT COUNT(*) FROM grammar_questions q WHERE q.topic_id = t.id) AS question_count,
            (SELECT COUNT(*) FROM quiz_attempts a JOIN grammar_questions q ON q.id = a.question_id
              WHERE q.topic_id = t.id) AS attempts,
            (SELECT COUNT(*) FROM quiz_attempts a JOIN grammar_questions q ON q.id = a.question_id
              WHERE q.topic_id = t.id AND a.correct = 1) AS correct,
            (SELECT COUNT(DISTINCT q.id) FROM grammar_questions q
              JOIN quiz_attempts a ON a.question_id = q.id AND a.correct = 1
              WHERE q.topic_id = t.id) AS mastered_count
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
 * Pick a fully random quiz round. Default mode draws only from questions the
 * user has never answered correctly (wrong ones stay in rotation until
 * beaten); an empty round means the topic is mastered. 'all' ignores history
 * for free practice.
 */
export async function pickQuestions(
  topicId: number,
  count: number,
  mode: RoundMode = 'default'
): Promise<QuestionRow[]> {
  const rows = await pickRoundRows(getDb(), topicId, count, mode);
  return rows.map((r) => ({
    id: r.id,
    qtype: r.qtype,
    difficulty: r.difficulty,
    payload: JSON.parse(r.payload) as QuestionPayload,
  }));
}

export interface QuestionStatusRow {
  id: number;
  qtype: QuestionRow['qtype'];
  difficulty: number;
  payload: QuestionPayload;
  status: QuestionStatus;
  attempts: number;
  /** Latest attempt's answer_given JSON — render via formatAnswer(). */
  lastAnswer: string | null;
  lastCorrect: boolean | null;
  lastAttemptedAt: string | null;
}

/** All questions of a topic with their answer history, for the history screen. */
export async function listQuestionStatuses(topicId: number): Promise<QuestionStatusRow[]> {
  const rows = await questionStatusRows(getDb(), topicId);
  return rows.map((r) => ({
    id: r.id,
    qtype: r.qtype,
    difficulty: r.difficulty,
    payload: JSON.parse(r.payload) as QuestionPayload,
    status: deriveStatus(r.attempts, r.ever_correct),
    attempts: r.attempts,
    lastAnswer: r.last_answer,
    lastCorrect: r.last_correct == null ? null : r.last_correct === 1,
    lastAttemptedAt: r.last_attempted_at,
  }));
}

/** How many of the topic's questions have ever been answered correctly. */
export async function topicMastery(topicId: number): Promise<{ total: number; mastered: number }> {
  return masteryCounts(getDb(), topicId);
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
