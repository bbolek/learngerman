import {
  missingSessionIds,
  parseSavedSession,
  SAVED_SESSION_VERSION,
  type SavedLessonSession,
} from '../src/logic/lessonProgress';

const session = (over: Partial<SavedLessonSession> = {}): SavedLessonSession => ({
  version: SAVED_SESSION_VERSION,
  slug: 'a1-basics-1',
  savedAt: '2026-08-10T10:00:00.000Z',
  index: 2,
  correct: 1,
  total: 2,
  queue: [
    { ex: { kind: 'intro', lemmaId: 1 }, retry: false },
    { ex: { kind: 'vocab_mc', lemmaId: 1, direction: 'de_en', optionIds: [1, 2, 3, 4] }, retry: false },
    { ex: { kind: 'vocab_type', lemmaId: 2 }, retry: false },
    { ex: { kind: 'grammar', questionId: 901 }, retry: false },
    { ex: { kind: 'vocab_type', lemmaId: 2 }, retry: true },
  ],
  grammarResults: [[901, true]],
  ...over,
});

describe('parseSavedSession', () => {
  it('accepts a coherent snapshot', () => {
    expect(parseSavedSession(session(), 'a1-basics-1')).toEqual(session());
  });

  it('rejects null, garbage and wrong versions', () => {
    expect(parseSavedSession(null, 'a1-basics-1')).toBeNull();
    expect(parseSavedSession('nope', 'a1-basics-1')).toBeNull();
    expect(parseSavedSession(session({ version: 2 as never }), 'a1-basics-1')).toBeNull();
  });

  it('rejects a snapshot for a different lesson', () => {
    expect(parseSavedSession(session(), 'a1-basics-2')).toBeNull();
  });

  it('rejects an index at or past the end (finished runs are cleared, not resumed)', () => {
    expect(parseSavedSession(session({ index: 5 }), 'a1-basics-1')).toBeNull();
    expect(parseSavedSession(session({ index: -1 }), 'a1-basics-1')).toBeNull();
    expect(parseSavedSession(session({ index: 4 }), 'a1-basics-1')).not.toBeNull();
  });

  it('rejects an empty or malformed queue', () => {
    expect(parseSavedSession(session({ queue: [] }), 'a1-basics-1')).toBeNull();
    expect(
      parseSavedSession(
        session({
          index: 0,
          queue: [{ ex: { kind: 'vocab_mc', lemmaId: 1 } as never, retry: false }],
        }),
        'a1-basics-1'
      )
    ).toBeNull();
    expect(
      parseSavedSession(
        session({ index: 0, queue: [{ ex: { kind: 'sing' } as never, retry: false }] }),
        'a1-basics-1'
      )
    ).toBeNull();
  });

  it('rejects inconsistent scores and malformed grammar results', () => {
    expect(parseSavedSession(session({ correct: 3, total: 2 }), 'a1-basics-1')).toBeNull();
    expect(parseSavedSession(session({ correct: -1 }), 'a1-basics-1')).toBeNull();
    expect(
      parseSavedSession(session({ grammarResults: [[901, 'yes']] as never }), 'a1-basics-1')
    ).toBeNull();
  });
});

describe('missingSessionIds', () => {
  it('reports nothing when the content resolves everything', () => {
    const missing = missingSessionIds(session(), new Set([1, 2, 3, 4]), new Set([901]));
    expect(missing).toEqual({ lemmaIds: [], questionIds: [] });
  });

  it('collects unresolved lemma ids from tested words and MC options, deduped', () => {
    const missing = missingSessionIds(session(), new Set([1, 2]), new Set([901]));
    expect([...missing.lemmaIds].sort()).toEqual([3, 4]);
    expect(missing.questionIds).toEqual([]);
  });

  it('collects unresolved grammar question ids', () => {
    const missing = missingSessionIds(session(), new Set([1, 2, 3, 4]), new Set());
    expect(missing).toEqual({ lemmaIds: [], questionIds: [901] });
  });
});
