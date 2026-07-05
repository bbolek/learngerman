import Database from 'better-sqlite3';
import * as path from 'node:path';

import {
  applyArcadeAnswer,
  articleFor,
  BLITZ_OPTIONS,
  buildBlitzQuestions,
  buildImageQuestions,
  buildPairsBoards,
  dedupeByGloss,
  DERDIEDAS_LIVES,
  GAMES,
  gameInfo,
  initialArcade,
  PAIRS_BOARDS,
  PAIRS_PER_BOARD,
  pairsBoardScore,
  shortGloss,
  streakBonus,
  withArticle,
  type GameWord,
  type ImageWord,
} from '@/logic/games';

function word(id: number, lemma: string, gloss: string): GameWord {
  return { id, lemma, gender: null, plural: null, gloss };
}

const POOL: GameWord[] = Array.from({ length: 40 }, (_, i) =>
  word(i + 1, `Wort${i + 1}`, `gloss${i + 1}`)
);

describe('registry', () => {
  it('exposes all four games', () => {
    expect(GAMES.map((g) => g.key)).toEqual(['wortblitz', 'bilderraetsel', 'derdiedas', 'wortpaare']);
    expect(gameInfo('derdiedas').title).toBe('Der, die oder das?');
  });
});

describe('shortGloss / dedupeByGloss', () => {
  it('takes the first segment before a semicolon', () => {
    expect(shortGloss('man; husband')).toBe('man');
    expect(shortGloss('house')).toBe('house');
  });

  it('drops words with colliding short glosses (case-insensitive)', () => {
    const words = [
      word(1, 'Mann', 'man; husband'),
      word(2, 'Ehemann', 'Man; spouse'),
      word(3, 'Frau', 'woman'),
    ];
    expect(dedupeByGloss(words).map((w) => w.id)).toEqual([1, 3]);
  });
});

describe('arcade scoring', () => {
  it('awards base points with a growing, capped streak bonus', () => {
    let s = initialArcade(DERDIEDAS_LIVES);
    s = applyArcadeAnswer(s, true); // streak 0 before answer → 10
    expect(s.score).toBe(10);
    s = applyArcadeAnswer(s, true); // streak 1 → 12
    expect(s.score).toBe(22);
    for (let i = 0; i < 10; i++) s = applyArcadeAnswer(s, true);
    // bonus capped at 2*5: every answer past the cap is worth 20
    const before = s.score;
    s = applyArcadeAnswer(s, true);
    expect(s.score - before).toBe(20);
    expect(s.bestStreak).toBe(13);
    expect(s.lives).toBe(DERDIEDAS_LIVES);
  });

  it('a wrong answer resets the streak, costs a life, never subtracts points', () => {
    let s = initialArcade(3);
    s = applyArcadeAnswer(s, true);
    s = applyArcadeAnswer(s, false);
    expect(s).toMatchObject({ score: 10, streak: 0, bestStreak: 1, correct: 1, total: 2, lives: 2 });
    s = applyArcadeAnswer(s, true); // streak restarts at base points
    expect(s.score).toBe(20);
  });

  it('streakBonus is monotonic and capped', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(3)).toBe(6);
    expect(streakBonus(5)).toBe(10);
    expect(streakBonus(50)).toBe(10);
  });
});

describe('buildBlitzQuestions', () => {
  it('builds one valid question per word', () => {
    const questions = buildBlitzQuestions(POOL, 42);
    expect(questions).toHaveLength(POOL.length);
    for (const q of questions) {
      expect(q.options).toHaveLength(BLITZ_OPTIONS);
      expect(new Set(q.options).size).toBe(BLITZ_OPTIONS); // no duplicate options
      expect(q.options[q.correctIndex]).toBe(shortGloss(q.word.gloss));
    }
  });

  it('is deterministic for the same seed and varies with the seed', () => {
    const a = buildBlitzQuestions(POOL, 7);
    const b = buildBlitzQuestions(POOL, 7);
    expect(a).toEqual(b);
    const c = buildBlitzQuestions(POOL, 8);
    expect(a.map((q) => q.options)).not.toEqual(c.map((q) => q.options));
  });

  it('answer positions are spread, not fixed', () => {
    const questions = buildBlitzQuestions(POOL, 11);
    expect(new Set(questions.map((q) => q.correctIndex)).size).toBeGreaterThan(1);
  });

  it('answer positions stay spread with realistic Date.now()-sized seeds', () => {
    // Regression: the old LCG lost float precision above 2^53 with large
    // seeds, so every question put the correct answer in the last slot.
    const counts = new Array(BLITZ_OPTIONS).fill(0);
    for (const seed of [1751700000000 & 0x7fffffff, 1782236400000 & 0x7fffffff]) {
      for (const q of buildBlitzQuestions(POOL, seed)) counts[q.correctIndex]++;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(total / 2); // no single slot dominates
    }
  });

  it('returns nothing when the pool is too small for four options', () => {
    expect(buildBlitzQuestions(POOL.slice(0, 3), 1)).toEqual([]);
  });
});

describe('buildImageQuestions', () => {
  const imagePool: ImageWord[] = [
    { id: 1, lemma: 'Haus', gender: 'n', plural: null, gloss: 'house', svg: '<svg/>' },
    { id: 2, lemma: 'Mann', gender: 'm', plural: null, gloss: 'man', svg: '<svg/>' },
    { id: 3, lemma: 'Frau', gender: 'f', plural: null, gloss: 'woman', svg: '<svg/>' },
    { id: 4, lemma: 'Kind', gender: 'n', plural: null, gloss: 'child', svg: '<svg/>' },
    { id: 5, lemma: 'Hund', gender: 'm', plural: null, gloss: 'dog', svg: '<svg/>' },
  ];

  it('articleFor / withArticle map genders to der/die/das', () => {
    expect(articleFor('m')).toBe('der');
    expect(articleFor('f')).toBe('die');
    expect(articleFor('n')).toBe('das');
    expect(articleFor('pl')).toBe('die');
    expect(articleFor(null)).toBeNull();
    expect(withArticle({ lemma: 'Haus', gender: 'n' })).toBe('das Haus');
    expect(withArticle({ lemma: 'gehen', gender: null })).toBe('gehen');
  });

  it('options are German words with articles and include the answer', () => {
    const questions = buildImageQuestions(imagePool, 21);
    expect(questions).toHaveLength(imagePool.length);
    for (const q of questions) {
      expect(q.options).toHaveLength(BLITZ_OPTIONS);
      expect(new Set(q.options).size).toBe(BLITZ_OPTIONS);
      expect(q.options[q.correctIndex]).toBe(withArticle(q.word));
      expect(q.word.svg).toBe('<svg/>');
    }
  });

  it('drops duplicate lemmas so no option can appear twice', () => {
    const withDupe = [...imagePool, { ...imagePool[0], id: 99 }];
    expect(buildImageQuestions(withDupe, 4)).toHaveLength(imagePool.length);
  });
});

describe('buildPairsBoards', () => {
  it('builds full boards where every tile pairs up exactly once', () => {
    const boards = buildPairsBoards(POOL, 99);
    expect(boards).toHaveLength(PAIRS_BOARDS);
    const seen = new Set<number>();
    for (const board of boards) {
      expect(board.de).toHaveLength(PAIRS_PER_BOARD);
      expect(board.en).toHaveLength(PAIRS_PER_BOARD);
      const deIds = board.de.map((tile) => tile.pairId).sort();
      const enIds = board.en.map((tile) => tile.pairId).sort();
      expect(deIds).toEqual(enIds);
      for (const id of deIds) {
        expect(seen.has(id)).toBe(false); // no word reused across boards
        seen.add(id);
      }
    }
  });

  it('stops short instead of emitting a partial board', () => {
    const boards = buildPairsBoards(POOL.slice(0, PAIRS_PER_BOARD * 2 + 3), 5);
    expect(boards).toHaveLength(2);
  });

  it('is deterministic for the same seed', () => {
    expect(buildPairsBoards(POOL, 3)).toEqual(buildPairsBoards(POOL, 3));
  });
});

describe('pairsBoardScore', () => {
  it('rewards speed and punishes mistakes', () => {
    const fast = pairsBoardScore(6, 0, 10_000);
    const slow = pairsBoardScore(6, 0, 50_000);
    const sloppy = pairsBoardScore(6, 4, 10_000);
    expect(fast).toBe(6 * 20 + 30); // full speed bonus
    expect(slow).toBe(6 * 20); // bonus gone after 45s
    expect(fast - sloppy).toBe(4 * 5);
  });

  it('never drops below the floor', () => {
    expect(pairsBoardScore(6, 100, 600_000)).toBe(30);
  });
});

// ---- content assumptions the game repos rely on (real built DB) ----

describe('dictionary content supports the games', () => {
  const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), { readonly: true });

  it('has plenty of words with a first-sense gloss for Wort-Blitz and Wortpaare', () => {
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM lemmas l JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1')
      .get() as { c: number };
    expect(row.c).toBeGreaterThan(500);
  });

  it('has plenty of der/die/das nouns for Der-die-das', () => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM lemmas l
         JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1
         WHERE l.pos = 'noun' AND l.gender IN ('m', 'f', 'n')`
      )
      .get() as { c: number };
    expect(row.c).toBeGreaterThan(300);
  });

  it('has enough imaged nouns with glosses for a Bilderrätsel round', () => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM lemma_images i
         JOIN lemmas l ON l.id = i.lemma_id
         JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1`
      )
      .get() as { c: number };
    expect(row.c).toBeGreaterThan(100);
  });

  it('random word pools survive gloss dedupe with enough words for all boards', () => {
    const rows = db
      .prepare(
        `SELECT l.id, l.lemma, l.gender, l.plural, s.en AS gloss
         FROM lemmas l JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1
         ORDER BY RANDOM() LIMIT 60`
      )
      .all() as GameWord[];
    expect(dedupeByGloss(rows).length).toBeGreaterThanOrEqual(PAIRS_BOARDS * PAIRS_PER_BOARD);
  });
});
