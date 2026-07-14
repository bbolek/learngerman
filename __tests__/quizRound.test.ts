import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { MIGRATIONS } from '@/db/migrations';
import {
  correctAnswerText,
  deriveStatus,
  formatAnswer,
  masteryCounts,
  pickRoundRows,
  questionStatusRows,
  questionSummary,
  type QuizDb,
} from '@/logic/quizRound';
import {
  type CaseIdPayload,
  type FillPayload,
  type McPayload,
  type OrderPayload,
} from '@/logic/graders';

const BUILT = path.join(__dirname, '../assets/db/dictionary.db');

function adapt(db: Database.Database): QuizDb {
  return {
    async getAllAsync<T>(sql: string, params: (string | number)[]) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

let dir: string;
let raw: Database.Database;
let db: QuizDb;
let topicId: number;
let questionIds: number[];

function attempt(questionId: number, correct: boolean, answer: unknown, at: string) {
  raw
    .prepare('INSERT INTO quiz_attempts (question_id, correct, answer_given, attempted_at) VALUES (?, ?, ?, ?)')
    .run(questionId, correct ? 1 : 0, JSON.stringify(answer ?? null), at);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizround-'));
  const dbPath = path.join(dir, 'test.db');
  fs.copyFileSync(BUILT, dbPath);
  raw = new Database(dbPath);
  for (const m of MIGRATIONS) raw.exec(m);
  db = adapt(raw);
  const topic = raw.prepare("SELECT id FROM grammar_topics WHERE slug = 'dativ'").get() as { id: number };
  topicId = topic.id;
  questionIds = (
    raw.prepare('SELECT id FROM grammar_questions WHERE topic_id = ? ORDER BY id').all(topicId) as {
      id: number;
    }[]
  ).map((r) => r.id);
});

afterEach(() => {
  raw.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('pickRoundRows', () => {
  it('draws only from the topic and respects the count', async () => {
    const rows = await pickRoundRows(db, topicId, 10, 'default');
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(questionIds).toContain(r.id);
  });

  it('excludes questions answered correctly, keeps wrong-answered ones', async () => {
    const [beaten, missed] = questionIds;
    attempt(beaten, true, { selected: 0 }, '2026-07-10T10:00:00Z');
    attempt(missed, false, { selected: 1 }, '2026-07-10T10:01:00Z');

    const rows = await pickRoundRows(db, topicId, questionIds.length, 'default');
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(beaten);
    expect(ids).toContain(missed);
    expect(rows).toHaveLength(questionIds.length - 1);
  });

  it('a wrong-then-correct question is excluded; wrong-after-correct stays excluded', async () => {
    const [q] = questionIds;
    attempt(q, false, { selected: 1 }, '2026-07-10T10:00:00Z');
    attempt(q, true, { selected: 0 }, '2026-07-10T10:01:00Z');
    attempt(q, false, { selected: 2 }, '2026-07-10T10:02:00Z');
    const rows = await pickRoundRows(db, topicId, questionIds.length, 'default');
    expect(rows.map((r) => r.id)).not.toContain(q);
  });

  it('shrinks the round when fewer questions remain, and returns [] when mastered', async () => {
    for (const id of questionIds.slice(0, -2)) attempt(id, true, {}, '2026-07-10T10:00:00Z');
    expect(await pickRoundRows(db, topicId, 10, 'default')).toHaveLength(2);

    for (const id of questionIds.slice(-2)) attempt(id, true, {}, '2026-07-10T11:00:00Z');
    expect(await pickRoundRows(db, topicId, 10, 'default')).toHaveLength(0);
  });

  it("mode 'all' ignores history", async () => {
    for (const id of questionIds) attempt(id, true, {}, '2026-07-10T10:00:00Z');
    const rows = await pickRoundRows(db, topicId, 10, 'all');
    expect(rows).toHaveLength(10);
  });

  it('randomizes order between draws', async () => {
    // With 48 questions the odds of two identical 10-question ordered draws
    // are astronomically small; a few retries kill any flake risk entirely.
    const draw = async () => (await pickRoundRows(db, topicId, 10, 'default')).map((r) => r.id).join(',');
    const first = await draw();
    let differed = false;
    for (let i = 0; i < 5 && !differed; i++) differed = (await draw()) !== first;
    expect(differed).toBe(true);
  });
});

describe('masteryCounts & questionStatusRows', () => {
  it('counts mastered questions and derives statuses', async () => {
    const [a, b] = questionIds;
    attempt(a, true, { selected: 0 }, '2026-07-10T10:00:00Z');
    attempt(b, false, { text: 'dem' }, '2026-07-10T10:01:00Z');

    const counts = await masteryCounts(db, topicId);
    expect(counts.total).toBe(questionIds.length);
    expect(counts.mastered).toBe(1);

    const rows = await questionStatusRows(db, topicId);
    expect(rows).toHaveLength(questionIds.length);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(deriveStatus(byId.get(a)!.attempts, byId.get(a)!.ever_correct)).toBe('correct');
    expect(deriveStatus(byId.get(b)!.attempts, byId.get(b)!.ever_correct)).toBe('wrong');
    const untouched = rows.find((r) => r.id !== a && r.id !== b)!;
    expect(deriveStatus(untouched.attempts, untouched.ever_correct)).toBe('unanswered');
    expect(untouched.last_answer).toBeNull();
  });

  it('reports the latest attempt, not the first', async () => {
    const [q] = questionIds;
    attempt(q, false, { selected: 1 }, '2026-07-10T10:00:00Z');
    attempt(q, true, { selected: 2 }, '2026-07-11T10:00:00Z');
    const row = (await questionStatusRows(db, topicId)).find((r) => r.id === q)!;
    expect(row.attempts).toBe(2);
    expect(row.last_correct).toBe(1);
    expect(JSON.parse(row.last_answer!)).toEqual({ selected: 2 });
    expect(row.last_attempted_at).toBe('2026-07-11T10:00:00Z');
  });
});

describe('render helpers', () => {
  const mc: McPayload = {
    prompt: 'Ich gebe ___ Mann das Buch.',
    options: ['der', 'den', 'dem', 'des'],
    correctIndex: 2,
    explanation: 'x',
  };
  const fill: FillPayload = { prompt: 'Er hilft ___ Kind.', accept: ['dem'], explanation: 'x' };
  const order: OrderPayload = {
    tokens: ['ich', 'dir', 'helfe'],
    solutions: [['ich', 'helfe', 'dir']],
    translation: 'I help you',
    explanation: 'x',
  };
  const caseId: CaseIdPayload = {
    sentence: 'Der Lehrer gibt **dem Schüler** ein Buch.',
    correctCase: 'dativ',
    reasons: ['subject', 'direct object', 'indirect object'],
    correctReasonIndex: 2,
    explanation: 'x',
  };

  it('questionSummary per qtype', () => {
    expect(questionSummary('mc', mc)).toBe(mc.prompt);
    expect(questionSummary('fill', fill)).toBe(fill.prompt);
    expect(questionSummary('order', order)).toBe('“I help you”');
    expect(questionSummary('order', { ...order, translation: undefined })).toBe('ich helfe dir');
    expect(questionSummary('case_id', caseId)).toBe('Der Lehrer gibt dem Schüler ein Buch.');
  });

  it('correctAnswerText per qtype', () => {
    expect(correctAnswerText('mc', mc)).toBe('dem');
    expect(correctAnswerText('fill', fill)).toBe('dem');
    expect(correctAnswerText('order', order)).toBe('ich helfe dir');
    expect(correctAnswerText('case_id', caseId)).toBe('Dativ — indirect object');
  });

  it('formatAnswer renders each stored shape', () => {
    expect(formatAnswer('mc', mc, JSON.stringify({ selected: 1 }))).toBe('den');
    expect(formatAnswer('fill', fill, JSON.stringify({ text: 'den' }))).toBe('den');
    expect(formatAnswer('order', order, JSON.stringify({ sequence: ['dir', 'ich', 'helfe'] }))).toBe(
      'dir ich helfe'
    );
    expect(
      formatAnswer('case_id', caseId, JSON.stringify({ caseChoice: 'akkusativ', reasonIndex: 1 }))
    ).toBe('Akkusativ — direct object');
  });

  it('formatAnswer never throws on missing or malformed data', () => {
    expect(formatAnswer('mc', mc, null)).toBeNull();
    expect(formatAnswer('mc', mc, 'not json')).toBeNull();
    expect(formatAnswer('mc', mc, 'null')).toBeNull();
    expect(formatAnswer('mc', mc, JSON.stringify({ selected: 99 }))).toBeNull();
    expect(formatAnswer('mc', mc, JSON.stringify({ selected: -1 }))).toBeNull();
    expect(formatAnswer('fill', fill, JSON.stringify({}))).toBeNull();
    expect(formatAnswer('order', order, JSON.stringify({ sequence: [1, 2] }))).toBeNull();
    expect(formatAnswer('case_id', caseId, JSON.stringify({ reasonIndex: 0 }))).toBeNull();
    expect(
      formatAnswer('case_id', caseId, JSON.stringify({ caseChoice: 'dativ', reasonIndex: 99 }))
    ).toBe('Dativ');
  });
});
