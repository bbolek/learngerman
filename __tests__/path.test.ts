import {
  computeNodeStates,
  currentPosition,
  starsForAccuracy,
  unitProgress,
  type PathNodeInput,
} from '../src/logic/path';

function nodes(stars: number[]): PathNodeInput[] {
  return stars.map((s, i) => ({ slug: `n${i}`, order: i, stars: s }));
}

describe('computeNodeStates', () => {
  it('marks the first node active on a fresh path', () => {
    const states = computeNodeStates(nodes([0, 0, 0]), null);
    expect(states.map((s) => s.state)).toEqual(['active', 'locked', 'locked']);
  });

  it('advances the active node past completed ones', () => {
    const states = computeNodeStates(nodes([3, 1, 0, 0]), null);
    expect(states.map((s) => s.state)).toEqual(['done', 'done', 'active', 'locked']);
  });

  it('keeps everything after a gap locked', () => {
    const states = computeNodeStates(nodes([3, 0, 3, 0]), null);
    // n1 skipped is impossible linearly, but progress rows could exist from
    // an old curriculum — the first not-done node is active, the rest locked.
    expect(states.map((s) => s.state)).toEqual(['done', 'active', 'done', 'locked']);
  });

  it('placement opens skipped nodes and puts the user at the boundary', () => {
    const states = computeNodeStates(nodes([0, 0, 0, 0, 0]), 3);
    expect(states.map((s) => s.state)).toEqual(['open', 'open', 'open', 'active', 'locked']);
  });

  it('progression continues linearly from the placement boundary', () => {
    const states = computeNodeStates(nodes([0, 0, 0, 1, 0]), 3);
    expect(states.map((s) => s.state)).toEqual(['open', 'open', 'open', 'done', 'active']);
  });

  it('completed nodes before the boundary stay done', () => {
    const states = computeNodeStates(nodes([2, 0, 0, 0]), 2);
    expect(states.map((s) => s.state)).toEqual(['done', 'open', 'active', 'locked']);
  });

  it('everything done → no active node', () => {
    const states = computeNodeStates(nodes([1, 2, 3]), null);
    expect(states.every((s) => s.state === 'done')).toBe(true);
    expect(currentPosition(states)).toBeNull();
  });

  it('unsorted input is handled by order', () => {
    const input: PathNodeInput[] = [
      { slug: 'b', order: 1, stars: 0 },
      { slug: 'a', order: 0, stars: 1 },
    ];
    const states = computeNodeStates(input, null);
    expect(states.map((s) => s.slug)).toEqual(['a', 'b']);
    expect(states[1].state).toBe('active');
  });
});

describe('currentPosition', () => {
  it('returns the active node', () => {
    const states = computeNodeStates(nodes([1, 0, 0]), null);
    expect(currentPosition(states)?.slug).toBe('n1');
  });
});

describe('starsForAccuracy', () => {
  it.each([
    [9, 10, 3],
    [10, 10, 3],
    [7, 10, 2],
    [8, 10, 2],
    [6, 10, 1],
    [0, 10, 1],
    [0, 0, 1],
  ])('%i/%i → %i stars', (correct, total, expected) => {
    expect(starsForAccuracy(correct, total)).toBe(expected);
  });
});

describe('unitProgress', () => {
  it('counts only real completions', () => {
    expect(unitProgress(nodes([1, 3, 0, 0]))).toEqual({ done: 2, total: 4 });
  });
});
