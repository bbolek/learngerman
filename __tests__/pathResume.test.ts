import {
  findPathResume,
  resolveBoundaryOrder,
  type ResumeUnit,
} from '../src/logic/pathResume';

function unit(slug: string, startOrder: number, stars: number[], level = 'A1'): ResumeUnit {
  return {
    slug,
    title: `Unit ${slug}`,
    emoji: '📦',
    level,
    nodes: stars.map((s, i) => ({
      slug: `${slug}-n${i}`,
      title: `Lektion ${i + 1}`,
      order: startOrder + i,
      stars: s,
    })),
  };
}

describe('resolveBoundaryOrder', () => {
  const units = [unit('u1', 0, [0, 0]), unit('u2', 2, [0, 0])];

  it('is null without placement', () => {
    expect(resolveBoundaryOrder(units, null)).toBeNull();
  });

  it('is null for a skipped placement', () => {
    expect(resolveBoundaryOrder(units, { skipped: true })).toBeNull();
  });

  it('resolves by unit slug to that unit’s first node order', () => {
    expect(
      resolveBoundaryOrder(units, { boundaryUnitSlug: 'u2', boundaryOrder: 99 })
    ).toBe(2);
  });

  it('falls back to the stored order when the unit slug is gone', () => {
    expect(
      resolveBoundaryOrder(units, { boundaryUnitSlug: 'dead', boundaryOrder: 1 })
    ).toBe(1);
  });
});

describe('findPathResume', () => {
  it('returns the first node on a fresh path', () => {
    const resume = findPathResume([unit('u1', 0, [0, 0]), unit('u2', 2, [0, 0])], null);
    expect(resume).toEqual({
      slug: 'u1-n0',
      title: 'Lektion 1',
      unitTitle: 'Unit u1',
      unitEmoji: '📦',
      unitLevel: 'A1',
    });
  });

  it('resumes past completed nodes, carrying the right unit', () => {
    const resume = findPathResume(
      [unit('u1', 0, [3, 2]), unit('u2', 2, [1, 0], 'A2')],
      null
    );
    expect(resume?.slug).toBe('u2-n1');
    expect(resume?.unitTitle).toBe('Unit u2');
    expect(resume?.unitLevel).toBe('A2');
  });

  it('starts at the placement boundary instead of node one', () => {
    const units = [unit('u1', 0, [0, 0]), unit('u2', 2, [0, 0])];
    const boundary = resolveBoundaryOrder(units, { boundaryUnitSlug: 'u2', boundaryOrder: 2 });
    expect(findPathResume(units, boundary)?.slug).toBe('u2-n0');
  });

  it('is null when every node is done', () => {
    expect(findPathResume([unit('u1', 0, [1, 3])], null)).toBeNull();
  });

  it('is null for an empty path', () => {
    expect(findPathResume([], null)).toBeNull();
  });
});
