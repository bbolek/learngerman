import { ratingFromScore } from '@/logic/grammarSrs';
import { schedule } from '@/logic/sm2';

describe('ratingFromScore', () => {
  it('maps accuracy bands to Again / Hard / Good / Easy', () => {
    expect(ratingFromScore(0, 10)).toBe(0); // 0%
    expect(ratingFromScore(4, 10)).toBe(0); // 40% → Again
    expect(ratingFromScore(6, 10)).toBe(1); // 60% → Hard
    expect(ratingFromScore(8, 10)).toBe(2); // 80% → Good
    expect(ratingFromScore(9, 10)).toBe(3); // 90% → Easy
    expect(ratingFromScore(10, 10)).toBe(3); // 100% → Easy
  });

  it('grades an empty round as Good so it is never punished', () => {
    expect(ratingFromScore(0, 0)).toBe(2);
  });
});

describe('grammar SRS scheduling reuses the vocab scheduler', () => {
  const now = new Date('2026-07-12T10:00:00Z');
  const fresh = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };

  it('a perfect first round schedules further out than a shaky one', () => {
    const good = schedule(fresh, ratingFromScore(10, 10), now).dueAt.getTime();
    const weak = schedule(fresh, ratingFromScore(6, 10), now).dueAt.getTime();
    expect(good).toBeGreaterThan(weak);
  });

  it('a failed round keeps the topic due almost immediately', () => {
    const { dueAt } = schedule(fresh, ratingFromScore(2, 10), now);
    const minutes = (dueAt.getTime() - now.getTime()) / 60000;
    expect(minutes).toBeLessThanOrEqual(10);
  });
});
