import {
  nextStage,
  placementOutcome,
  stagePassed,
  type PlacementUnit,
  type StageResult,
} from '../src/logic/placement';

const pass = (level: StageResult['level']): StageResult => ({ level, correct: 7, total: 8 });
const fail = (level: StageResult['level']): StageResult => ({ level, correct: 3, total: 8 });

const units: PlacementUnit[] = [
  { slug: 'a1-hallo', level: 'A1', firstNodeOrder: 0 },
  { slug: 'a1-familie', level: 'A1', firstNodeOrder: 4 },
  { slug: 'a2-reisen', level: 'A2', firstNodeOrder: 8 },
  { slug: 'b1-arbeit', level: 'B1', firstNodeOrder: 12 },
];

describe('stagePassed', () => {
  it('needs ≥ 70%', () => {
    expect(stagePassed({ level: 'A1', correct: 6, total: 8 })).toBe(true); // 75%
    expect(stagePassed({ level: 'A1', correct: 5, total: 8 })).toBe(false); // 62.5%
    expect(stagePassed({ level: 'A1', correct: 0, total: 0 })).toBe(false);
  });
});

describe('nextStage', () => {
  it('starts at A1', () => {
    expect(nextStage([])).toBe('A1');
  });

  it('climbs while stages pass', () => {
    expect(nextStage([pass('A1')])).toBe('A2');
    expect(nextStage([pass('A1'), pass('A2')])).toBe('B1');
  });

  it('stops after a failed stage', () => {
    expect(nextStage([pass('A1'), fail('A2')])).toBeNull();
  });

  it('stops after the last stage', () => {
    expect(nextStage([pass('A1'), pass('A2'), pass('B1'), pass('B2'), pass('C1')])).toBeNull();
  });
});

describe('placementOutcome', () => {
  it('failed first stage → nothing unlocked', () => {
    expect(placementOutcome([fail('A1')], units)).toEqual({
      placedLevel: null,
      boundaryUnitSlug: null,
      boundaryOrder: 0,
    });
  });

  it('passed A1 → boundary at the first A2 unit', () => {
    expect(placementOutcome([pass('A1'), fail('A2')], units)).toEqual({
      placedLevel: 'A1',
      boundaryUnitSlug: 'a2-reisen',
      boundaryOrder: 8,
    });
  });

  it('passed A2 → boundary at the first B1 unit', () => {
    expect(placementOutcome([pass('A1'), pass('A2'), fail('B1')], units)).toEqual({
      placedLevel: 'A2',
      boundaryUnitSlug: 'b1-arbeit',
      boundaryOrder: 12,
    });
  });

  it('passed beyond what the path has → everything unlocked', () => {
    const out = placementOutcome(
      [pass('A1'), pass('A2'), pass('B1'), pass('B2'), pass('C1')],
      units
    );
    expect(out.placedLevel).toBe('C1');
    expect(out.boundaryUnitSlug).toBeNull();
    expect(out.boundaryOrder).toBeGreaterThan(12);
  });

  it('skips over missing levels to the first higher unit', () => {
    const sparse: PlacementUnit[] = [
      { slug: 'a1-x', level: 'A1', firstNodeOrder: 0 },
      { slug: 'b1-y', level: 'B1', firstNodeOrder: 4 }, // no A2 units yet
    ];
    expect(placementOutcome([pass('A1'), fail('A2')], sparse)).toMatchObject({
      boundaryUnitSlug: 'b1-y',
      boundaryOrder: 4,
    });
  });
});
