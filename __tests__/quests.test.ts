import {
  questProgress,
  questsForDay,
  QUESTS_PER_DAY,
  type QuestCounters,
} from '@/logic/quests';

const NO_PROGRESS: QuestCounters = { reviews: 0, quiz: 0, games: 0, words: 0, xp: 0 };

describe('questsForDay', () => {
  it('is deterministic — same day, same quests', () => {
    const a = questsForDay('2026-07-14');
    const b = questsForDay('2026-07-14');
    expect(a.map((q) => q.key)).toEqual(b.map((q) => q.key));
  });

  it('always yields three quests with distinct metrics', () => {
    for (let d = 1; d <= 28; d++) {
      const day = `2026-07-${String(d).padStart(2, '0')}`;
      const quests = questsForDay(day);
      expect(quests).toHaveLength(QUESTS_PER_DAY);
      expect(new Set(quests.map((q) => q.metric)).size).toBe(QUESTS_PER_DAY);
      for (const q of quests) {
        expect(q.target).toBeGreaterThan(0);
        expect(q.xp).toBeGreaterThan(0);
        expect(q.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('rotates — a month of days uses more than one combination', () => {
    const combos = new Set(
      Array.from({ length: 28 }, (_, i) =>
        questsForDay(`2026-07-${String(i + 1).padStart(2, '0')}`)
          .map((q) => q.key)
          .join('|')
      )
    );
    expect(combos.size).toBeGreaterThan(5);
  });
});

describe('questProgress', () => {
  const quest = questsForDay('2026-07-14').find((q) => q.metric === 'reviews') ??
    // metric mix varies by day — fall back to a fixed def for the math check
    { key: 'reviews-10', metric: 'reviews' as const, target: 10, title: 'x', emoji: 'x', xp: 20 };

  it('caps current at the target and flags completion', () => {
    expect(questProgress(quest, NO_PROGRESS).done).toBe(false);
    expect(questProgress(quest, NO_PROGRESS).current).toBe(0);
    const done = questProgress(quest, { ...NO_PROGRESS, reviews: quest.target + 99 });
    expect(done.done).toBe(true);
    expect(done.current).toBe(quest.target);
  });

  it('one short of the target is not done', () => {
    const almost = questProgress(quest, { ...NO_PROGRESS, reviews: quest.target - 1 });
    expect(almost.done).toBe(false);
  });
});
