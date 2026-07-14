import { computeStreak, dayKey, freezePlan, MAX_FREEZES } from '@/logic/streakSafe';

/** Days as offsets from `now` (0 = today, -1 = yesterday …). */
function days(now: Date, ...offsets: number[]): Set<string> {
  const DAY = 24 * 60 * 60 * 1000;
  return new Set(offsets.map((o) => dayKey(new Date(now.getTime() + o * DAY))));
}

const now = new Date('2026-07-14T12:00:00Z');

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(days(now, 0, -1, -2), now)).toBe(3);
  });

  it('still alive when today has no activity yet', () => {
    expect(computeStreak(days(now, -1, -2, -3), now)).toBe(3);
  });

  it('breaks on a gap', () => {
    expect(computeStreak(days(now, 0, -2, -3), now)).toBe(1);
    expect(computeStreak(days(now, -2, -3), now)).toBe(0);
  });

  it('frozen days count like active ones (caller merges the sets)', () => {
    const merged = new Set([...days(now, 0, -2, -3), ...days(now, -1)]);
    expect(computeStreak(merged, now)).toBe(4);
  });
});

describe('freezePlan', () => {
  it('nothing to protect while the streak is alive', () => {
    expect(freezePlan(days(now, 0, -1, -2), now).gapDays).toHaveLength(0);
    expect(freezePlan(days(now, -1, -2), now).gapDays).toHaveLength(0);
  });

  it('a one-day gap after a real streak needs one freeze', () => {
    const plan = freezePlan(days(now, -2, -3, -4), now);
    expect(plan.gapDays).toEqual([dayKey(new Date('2026-07-13T00:00:00Z'))]);
    expect(plan.lostStreak).toBe(3);
  });

  it('longer gaps list every missed day, oldest first', () => {
    const plan = freezePlan(days(now, -3, -4), now);
    expect(plan.gapDays).toEqual([
      dayKey(new Date('2026-07-12T00:00:00Z')),
      dayKey(new Date('2026-07-13T00:00:00Z')),
    ]);
    expect(plan.lostStreak).toBe(2);
  });

  it('does not bridge gaps beyond anything freezes could cover', () => {
    const plan = freezePlan(days(now, -10, -11, -12), now);
    expect(plan.gapDays).toHaveLength(0);
  });

  it('a 1-day "streak" is not worth insurance', () => {
    expect(freezePlan(days(now, -2), now).gapDays).toHaveLength(0);
  });

  it('never plans more than MAX_FREEZES + 1 gap days', () => {
    for (let gap = 1; gap <= 6; gap++) {
      const active = [-(gap + 1), -(gap + 2), -(gap + 3)];
      const plan = freezePlan(days(now, ...active), now);
      expect(plan.gapDays.length).toBeLessThanOrEqual(MAX_FREEZES + 1);
    }
  });
});
