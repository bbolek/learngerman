import {
  buildResumeShelf,
  lastPlayedGame,
  nextUnreadText,
  pickDailyTheme,
  pickHeroAction,
  type ReadingRowLike,
} from '../src/logic/homeFeed';
import type { PathResume } from '../src/logic/pathResume';

const node: PathResume = {
  slug: 'u1-n0',
  title: 'Lektion 1',
  unitTitle: 'Erste Schritte',
  unitEmoji: '👋',
  unitLevel: 'A1',
};

function text(slug: string, completed: string | null): ReadingRowLike {
  return { slug, title: slug, level: 'A1', word_count: 120, completed_at: completed };
}

describe('pickHeroAction', () => {
  it('leads with review when cards are due', () => {
    expect(pickHeroAction(5, 2, node)).toEqual({ kind: 'review', due: 5, fresh: 2 });
  });

  it('counts new-only cards as a review day', () => {
    expect(pickHeroAction(0, 3, null).kind).toBe('review');
  });

  it('falls back to the path when nothing is pending', () => {
    expect(pickHeroAction(0, 0, node)).toEqual({ kind: 'path', node });
  });

  it('ends at discover when path and queue are both empty', () => {
    expect(pickHeroAction(0, 0, null)).toEqual({ kind: 'discover' });
  });
});

describe('buildResumeShelf', () => {
  const base = {
    due: 4,
    fresh: 1,
    pathNext: node,
    nextReading: text('im-cafe', null),
    lastGame: { key: 'wortblitz' as const, best: 320 },
  };

  it('never repeats the hero: review hero drops the review card', () => {
    const items = buildResumeShelf({ ...base, hero: pickHeroAction(4, 1, node) });
    expect(items.map((i) => i.kind)).toEqual(['path', 'reading', 'game']);
  });

  it('never repeats the hero: path hero drops the path card', () => {
    const items = buildResumeShelf({
      ...base,
      due: 0,
      fresh: 0,
      hero: pickHeroAction(0, 0, node),
    });
    expect(items.map((i) => i.kind)).toEqual(['reading', 'game']);
  });

  it('keeps the shelf alive on a fresh install via the first reading text', () => {
    const items = buildResumeShelf({
      hero: pickHeroAction(0, 0, node),
      due: 0,
      fresh: 0,
      pathNext: node,
      nextReading: text('im-cafe', null),
      lastGame: null,
    });
    expect(items).toEqual([
      { kind: 'reading', slug: 'im-cafe', title: 'im-cafe', level: 'A1', wordCount: 120 },
    ]);
  });

  it('shows the review card when a non-review hero leaves cards pending', () => {
    // Impossible via pickHeroAction today, but the dedup must not depend on it.
    const items = buildResumeShelf({ ...base, hero: { kind: 'discover' } });
    expect(items.map((i) => i.kind)).toEqual(['path', 'review', 'reading', 'game']);
    expect(items[1]).toEqual({ kind: 'review', count: 5 });
  });
});

describe('nextUnreadText', () => {
  it('skips completed texts, keeping repo order', () => {
    const texts = [text('a', '2026-01-01'), text('b', null), text('c', null)];
    expect(nextUnreadText(texts)?.slug).toBe('b');
  });

  it('is null when everything is read or the list is empty', () => {
    expect(nextUnreadText([text('a', '2026-01-01')])).toBeNull();
    expect(nextUnreadText([])).toBeNull();
  });
});

describe('lastPlayedGame', () => {
  it('picks the most recently played game with its record', () => {
    const stats = new Map([
      ['wortblitz' as const, { best: 320, lastPlayed: '2026-08-01T10:00:00Z' }],
      ['derdiedas' as const, { best: 150, lastPlayed: '2026-08-09T08:00:00Z' }],
    ]);
    expect(lastPlayedGame(stats)).toEqual({ key: 'derdiedas', best: 150 });
  });

  it('ignores entries without a played date and handles an empty map', () => {
    expect(lastPlayedGame(new Map())).toBeNull();
    expect(
      lastPlayedGame(new Map([['satzbau' as const, { best: 0, lastPlayed: null }]]))
    ).toBeNull();
  });
});

describe('pickDailyTheme', () => {
  const themes = ['essen', 'reisen', 'arbeit', 'familie'];

  it('is deterministic within a day', () => {
    expect(pickDailyTheme(themes, '2026-08-10')).toBe(pickDailyTheme(themes, '2026-08-10'));
  });

  it('rotates across days', () => {
    const picks = new Set(
      ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'].map((d) =>
        pickDailyTheme(themes, d)
      )
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('is null for an empty list', () => {
    expect(pickDailyTheme([], '2026-08-10')).toBeNull();
  });
});
