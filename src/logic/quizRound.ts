/**
 * Quiz round selection & per-question answer history, derived entirely from
 * `quiz_attempts` — no extra user tables. Pure of RN imports; the DB handle is
 * injected through a minimal interface so jest can run the same SQL against
 * the real built DB via better-sqlite3 (same seam as contentUpdate.ts).
 */

import {
  type CaseIdPayload,
  type FillPayload,
  type McPayload,
  type OrderPayload,
  type QuestionPayload,
} from '@/logic/graders';

/** Minimal surface shared by expo-sqlite and the better-sqlite3 test adapter. */
export interface QuizDb {
  getAllAsync<T>(sql: string, params: (string | number)[]): Promise<T[]>;
}

/** 'default' skips questions already answered correctly; 'all' ignores history. */
export type RoundMode = 'default' | 'all';

export type QuestionStatus = 'correct' | 'wrong' | 'unanswered';

export type Qtype = 'mc' | 'fill' | 'order' | 'case_id';

export interface RawQuestionRow {
  id: number;
  qtype: Qtype;
  difficulty: number;
  payload: string;
}

export interface RawStatusRow extends RawQuestionRow {
  attempts: number;
  ever_correct: number;
  last_answer: string | null;
  last_correct: number | null;
  last_attempted_at: string | null;
}

/**
 * Pick a fully random round. In 'default' mode the pool is only the questions
 * the user has never answered correctly (wrong ones stay in rotation until
 * they're beaten); an empty result means the topic is mastered. The round
 * shrinks naturally when fewer than `count` questions remain.
 */
export async function pickRoundRows(
  db: QuizDb,
  topicId: number,
  count: number,
  mode: RoundMode
): Promise<RawQuestionRow[]> {
  return db.getAllAsync<RawQuestionRow>(
    `SELECT q.id, q.qtype, q.difficulty, q.payload
     FROM grammar_questions q
     WHERE q.topic_id = ?
       AND (? = 'all' OR NOT EXISTS (
             SELECT 1 FROM quiz_attempts a
             WHERE a.question_id = q.id AND a.correct = 1))
     ORDER BY RANDOM()
     LIMIT ?`,
    [topicId, mode, count]
  );
}

/** Every question of a topic with its attempt history (latest attempt inlined). */
export async function questionStatusRows(db: QuizDb, topicId: number): Promise<RawStatusRow[]> {
  return db.getAllAsync<RawStatusRow>(
    `SELECT q.id, q.qtype, q.difficulty, q.payload,
            COUNT(a.id) AS attempts,
            COALESCE(MAX(a.correct), 0) AS ever_correct,
            (SELECT a2.answer_given FROM quiz_attempts a2 WHERE a2.question_id = q.id
              ORDER BY a2.attempted_at DESC, a2.id DESC LIMIT 1) AS last_answer,
            (SELECT a2.correct FROM quiz_attempts a2 WHERE a2.question_id = q.id
              ORDER BY a2.attempted_at DESC, a2.id DESC LIMIT 1) AS last_correct,
            (SELECT a2.attempted_at FROM quiz_attempts a2 WHERE a2.question_id = q.id
              ORDER BY a2.attempted_at DESC, a2.id DESC LIMIT 1) AS last_attempted_at
     FROM grammar_questions q
     LEFT JOIN quiz_attempts a ON a.question_id = q.id
     WHERE q.topic_id = ?
     GROUP BY q.id
     ORDER BY q.difficulty, q.id`,
    [topicId]
  );
}

/** Mastered = answered correctly at least once (a later miss doesn't demote). */
export async function masteryCounts(
  db: QuizDb,
  topicId: number
): Promise<{ total: number; mastered: number }> {
  const rows = await db.getAllAsync<{ total: number; mastered: number }>(
    `SELECT (SELECT COUNT(*) FROM grammar_questions WHERE topic_id = ?) AS total,
            (SELECT COUNT(DISTINCT q.id) FROM grammar_questions q
              JOIN quiz_attempts a ON a.question_id = q.id AND a.correct = 1
             WHERE q.topic_id = ?) AS mastered`,
    [topicId, topicId]
  );
  return rows[0] ?? { total: 0, mastered: 0 };
}

export function deriveStatus(attempts: number, everCorrect: number): QuestionStatus {
  if (attempts === 0) return 'unanswered';
  return everCorrect ? 'correct' : 'wrong';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One-line teaser for the history list. */
export function questionSummary(qtype: Qtype, payload: QuestionPayload): string {
  switch (qtype) {
    case 'mc':
      return (payload as McPayload).prompt;
    case 'fill':
      return (payload as FillPayload).prompt;
    case 'order': {
      const p = payload as OrderPayload;
      return p.translation ? `“${p.translation}”` : p.solutions[0].join(' ');
    }
    case 'case_id':
      return (payload as CaseIdPayload).sentence.replaceAll('**', '');
  }
}

/** The canonical correct answer, rendered for the history detail. */
export function correctAnswerText(qtype: Qtype, payload: QuestionPayload): string {
  switch (qtype) {
    case 'mc': {
      const p = payload as McPayload;
      return p.options[p.correctIndex] ?? '';
    }
    case 'fill':
      return (payload as FillPayload).accept[0] ?? '';
    case 'order':
      return (payload as OrderPayload).solutions[0].join(' ');
    case 'case_id': {
      const p = payload as CaseIdPayload;
      return `${capitalize(p.correctCase)} — ${p.reasons[p.correctReasonIndex] ?? ''}`;
    }
  }
}

/**
 * Render the user's stored `answer_given` JSON. Returns null for missing or
 * malformed data (attempts can predate this feature or survive content
 * remaps with stale option indexes) — never throws.
 */
export function formatAnswer(
  qtype: Qtype,
  payload: QuestionPayload,
  answerGivenJson: string | null
): string | null {
  if (!answerGivenJson) return null;
  let given: unknown;
  try {
    given = JSON.parse(answerGivenJson);
  } catch {
    return null;
  }
  if (given == null || typeof given !== 'object') return null;
  const g = given as Record<string, unknown>;
  switch (qtype) {
    case 'mc': {
      const p = payload as McPayload;
      const i = g.selected;
      return typeof i === 'number' && i >= 0 && i < p.options.length ? p.options[i] : null;
    }
    case 'fill':
      return typeof g.text === 'string' ? g.text : null;
    case 'order':
      return Array.isArray(g.sequence) && g.sequence.every((t) => typeof t === 'string')
        ? (g.sequence as string[]).join(' ')
        : null;
    case 'case_id': {
      const p = payload as CaseIdPayload;
      if (typeof g.caseChoice !== 'string') return null;
      const reason =
        typeof g.reasonIndex === 'number' && g.reasonIndex >= 0 && g.reasonIndex < p.reasons.length
          ? p.reasons[g.reasonIndex]
          : null;
      return reason ? `${capitalize(g.caseChoice)} — ${reason}` : capitalize(g.caseChoice);
    }
  }
}
