import {
  isActionStep,
  isOffRoute,
  matchesRoute,
  nextIndexForEvent,
  resumeIndexFor,
  TOUR_STEPS,
  type TourEvent,
} from '@/logic/tour';

const indexOf = (id: string) => TOUR_STEPS.findIndex((s) => s.id === id);

describe('TOUR_STEPS invariants', () => {
  it('step ids are unique', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every step has copy and a target', () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.targetId.length).toBeGreaterThan(0);
    }
  });

  it('route-advance steps navigate somewhere other than their own route', () => {
    for (const s of TOUR_STEPS) {
      if (s.advance.kind === 'route') expect(s.advance.pathname).not.toBe(s.route);
    }
  });

  it('resumeTo always points at an existing earlier step', () => {
    TOUR_STEPS.forEach((s, i) => {
      if (!s.resumeTo) return;
      const target = indexOf(s.resumeTo);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThan(i);
    });
  });

  it('consecutive steps connect: each step lives on the route the previous one ends on', () => {
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      const prev = TOUR_STEPS[i - 1];
      const step = TOUR_STEPS[i];
      const expectedRoute = prev.advance.kind === 'route' ? prev.advance.pathname : prev.route;
      expect(step.route).toBe(expectedRoute);
    }
  });

  it('tour starts and ends on the home screen', () => {
    expect(TOUR_STEPS[0].route).toBe('/');
    const last = TOUR_STEPS[TOUR_STEPS.length - 1];
    expect(last.route).toBe('/');
    expect(last.advance.kind).toBe('next');
  });
});

describe('matchesRoute', () => {
  it('root matches only the home pathname', () => {
    expect(matchesRoute('/', '/')).toBe(true);
    expect(matchesRoute('/', '/dictionary')).toBe(false);
    expect(matchesRoute('/', '/word/12')).toBe(false);
  });

  it('prefixes match dynamic segments but not lookalike routes', () => {
    expect(matchesRoute('/word', '/word/12')).toBe(true);
    expect(matchesRoute('/word', '/word')).toBe(true);
    expect(matchesRoute('/word', '/words')).toBe(false);
    expect(matchesRoute('/words', '/words')).toBe(true);
  });
});

describe('nextIndexForEvent', () => {
  const next: TourEvent = { type: 'next' };

  it('next advances info steps only', () => {
    expect(nextIndexForEvent(TOUR_STEPS, indexOf('home-streak'), next)).toBe(
      indexOf('home-streak') + 1
    );
    expect(nextIndexForEvent(TOUR_STEPS, indexOf('dict-search'), next)).toBeNull();
    expect(nextIndexForEvent(TOUR_STEPS, indexOf('tab-dictionary'), next)).toBeNull();
  });

  it('dict-results advances the search step and nothing else', () => {
    const event: TourEvent = { type: 'action', name: 'dict-results' };
    TOUR_STEPS.forEach((s, i) => {
      const advanced = nextIndexForEvent(TOUR_STEPS, i, event);
      if (s.id === 'dict-search') expect(advanced).toBe(i + 1);
      else expect(advanced).toBeNull();
    });
  });

  it('word-saved is ignored when emitted out of order', () => {
    const event: TourEvent = { type: 'action', name: 'word-saved' };
    expect(nextIndexForEvent(TOUR_STEPS, indexOf('word-tts'), event)).toBeNull();
    expect(nextIndexForEvent(TOUR_STEPS, indexOf('word-save'), event)).toBe(
      indexOf('word-save') + 1
    );
  });

  it('route events advance tab steps to their destination', () => {
    expect(
      nextIndexForEvent(TOUR_STEPS, indexOf('tab-dictionary'), {
        type: 'route',
        pathname: '/dictionary',
      })
    ).toBe(indexOf('tab-dictionary') + 1);
    expect(
      nextIndexForEvent(TOUR_STEPS, indexOf('dict-first-result'), {
        type: 'route',
        pathname: '/word/42',
      })
    ).toBe(indexOf('dict-first-result') + 1);
    expect(
      nextIndexForEvent(TOUR_STEPS, indexOf('tab-dictionary'), {
        type: 'route',
        pathname: '/games',
      })
    ).toBeNull();
  });

  it('advancing past the last step returns the finish sentinel (steps.length)', () => {
    expect(nextIndexForEvent(TOUR_STEPS, TOUR_STEPS.length - 1, next)).toBe(TOUR_STEPS.length);
  });

  it('out-of-range index yields null', () => {
    expect(nextIndexForEvent(TOUR_STEPS, TOUR_STEPS.length, next)).toBeNull();
    expect(nextIndexForEvent(TOUR_STEPS, -1, next)).toBeNull();
  });
});

describe('isOffRoute', () => {
  it('dynamic word routes stay on-route', () => {
    expect(isOffRoute(TOUR_STEPS[indexOf('word-save')], '/word/12')).toBe(false);
  });

  it('wandering to settings mid-home-step is off-route', () => {
    expect(isOffRoute(TOUR_STEPS[indexOf('home-streak')], '/settings')).toBe(true);
  });

  it('the destination of a route step is handled as advance, not off-route', () => {
    const i = indexOf('tab-words');
    const advanced = nextIndexForEvent(TOUR_STEPS, i, { type: 'route', pathname: '/words' });
    expect(advanced).toBe(i + 1);
  });
});

describe('resumeIndexFor', () => {
  it('word-detail steps resume at the dictionary search', () => {
    expect(resumeIndexFor(TOUR_STEPS, indexOf('word-save'))).toBe(indexOf('dict-search'));
    expect(resumeIndexFor(TOUR_STEPS, indexOf('word-back'))).toBe(indexOf('dict-search'));
  });

  it('steps without resumeTo resume in place', () => {
    expect(resumeIndexFor(TOUR_STEPS, indexOf('home-daily'))).toBe(indexOf('home-daily'));
  });
});

describe('isActionStep', () => {
  it('matches the advance rule', () => {
    for (const s of TOUR_STEPS) {
      expect(isActionStep(s)).toBe(s.advance.kind !== 'next');
    }
  });
});
