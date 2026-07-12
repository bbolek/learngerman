import { pickNextTopic, type TopicStats } from '../src/logic/nextTopic';

function topic(overrides: Partial<TopicStats> & { id: number }): TopicStats {
  return { title: `Topic ${overrides.id}`, level: 'A1', attempts: 0, correct: 0, ...overrides };
}

describe('pickNextTopic', () => {
  it('returns null for an empty topic list', () => {
    expect(pickNextTopic([], '2026-07-05')).toBeNull();
  });

  it('surfaces a due topic ahead of everything else', () => {
    const topics = [
      topic({ id: 1, attempts: 10, correct: 3 }), // 30% — weakest, but not due
      topic({ id: 2, attempts: 10, correct: 8, due: true }), // due — wins
      topic({ id: 3 }), // unattempted
    ];
    const next = pickNextTopic(topics, '2026-07-05');
    expect(next).toMatchObject({ reason: 'due' });
    expect(next?.topic.id).toBe(2);
  });

  it('leads with the weakest-scoring due topic', () => {
    const topics = [
      topic({ id: 1, attempts: 10, correct: 9, due: true }), // 90% due
      topic({ id: 2, attempts: 10, correct: 5, due: true }), // 50% due — weaker
    ];
    const next = pickNextTopic(topics, '2026-07-05');
    expect(next?.reason).toBe('due');
    expect(next?.topic.id).toBe(2);
  });

  it('prefers the weakest attempted topic below the threshold', () => {
    const topics = [
      topic({ id: 1, attempts: 10, correct: 9 }), // 90% — solid
      topic({ id: 2, attempts: 10, correct: 4 }), // 40% — weakest
      topic({ id: 3, attempts: 10, correct: 6 }), // 60% — weak but better
      topic({ id: 4 }), // unattempted
    ];
    const next = pickNextTopic(topics, '2026-07-05');
    expect(next).toMatchObject({ reason: 'weak', accuracy: 0.4 });
    expect(next?.topic.id).toBe(2);
  });

  it('suggests an unattempted topic from the lowest open level when nothing is weak', () => {
    const topics = [
      topic({ id: 1, level: 'A1', attempts: 10, correct: 9 }),
      topic({ id: 2, level: 'B1' }),
      topic({ id: 3, level: 'A2' }),
      topic({ id: 4, level: 'A2' }),
    ];
    const next = pickNextTopic(topics, '2026-07-05');
    expect(next?.reason).toBe('new');
    expect(next?.accuracy).toBeNull();
    expect(next?.topic.level).toBe('A2');
  });

  it('rotates the new-topic suggestion across days', () => {
    const topics = [topic({ id: 1 }), topic({ id: 2 }), topic({ id: 3 })];
    const picks = new Set(
      ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'].map(
        (day) => pickNextTopic(topics, day)?.topic.id
      )
    );
    expect(picks.size).toBeGreaterThan(1); // not stuck on a single topic
  });

  it('is stable within the same day', () => {
    const topics = [topic({ id: 1 }), topic({ id: 2 }), topic({ id: 3 })];
    const a = pickNextTopic(topics, '2026-07-05');
    const b = pickNextTopic(topics, '2026-07-05');
    expect(a?.topic.id).toBe(b?.topic.id);
  });

  it('rotates through solid topics for review when everything is practiced', () => {
    const topics = [
      topic({ id: 1, attempts: 10, correct: 9 }),
      topic({ id: 2, attempts: 10, correct: 10 }),
    ];
    const next = pickNextTopic(topics, '2026-07-05');
    expect(next?.reason).toBe('review');
    expect(next?.accuracy).toBeGreaterThanOrEqual(0.75);
  });
});
