import Database from 'better-sqlite3';
import * as path from 'node:path';

import {
  applyArcadeAnswer,
  articleFor,
  ARTIKEL_OPTIONS,
  BLITZ_OPTIONS,
  buildArtikelQuestions,
  buildBlitzQuestions,
  buildImageQuestions,
  buildDiktatDuelQuestions,
  buildDiktatQuestions,
  buildKonjugationQuestions,
  buildPairsBoards,
  buildSatzbauQuestions,
  DIKTAT_DUEL_WORDS,
  DIKTAT_WORDS,
  gradeDiktat,
  gradeSatzbau,
  dedupeByGloss,
  DERDIEDAS_LIVES,
  GAMES,
  gameInfo,
  initialArcade,
  KONJUGATION_TAGS,
  konjugationContext,
  PAIRS_BOARDS,
  addReviewWord,
  PAIRS_PER_BOARD,
  pairsBoardScore,
  SATZBAU_MAX_TOKENS,
  SATZBAU_MIN_TOKENS,
  SATZBAU_SENTENCES,
  shortGloss,
  streakBonus,
  tokenizeSentence,
  withArticle,
  type GameWord,
  type ImageWord,
  type SentenceWord,
  type VerbWord,
} from '@/logic/games';

function word(id: number, lemma: string, gloss: string): GameWord {
  return { id, lemma, gender: null, plural: null, gloss };
}

const POOL: GameWord[] = Array.from({ length: 40 }, (_, i) =>
  word(i + 1, `Wort${i + 1}`, `gloss${i + 1}`)
);

describe('registry', () => {
  it('exposes all seven games', () => {
    expect(GAMES.map((g) => g.key)).toEqual([
      'wortblitz',
      'bilderraetsel',
      'derdiedas',
      'wortpaare',
      'konjugation',
      'satzbau',
      'diktat',
    ]);
    expect(gameInfo('derdiedas').emoji).toBe('🎯');
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

describe('buildArtikelQuestions', () => {
  const nounPool: GameWord[] = [
    { id: 1, lemma: 'Haus', gender: 'n', plural: null, gloss: 'house' },
    { id: 2, lemma: 'Mann', gender: 'm', plural: null, gloss: 'man' },
    { id: 3, lemma: 'Frau', gender: 'f', plural: null, gloss: 'woman' },
    { id: 4, lemma: 'Leute', gender: 'pl', plural: null, gloss: 'people' },
    { id: 5, lemma: 'gehen', gender: null, plural: null, gloss: 'to go' },
  ];

  it('keeps only der/die/das nouns and marks the right article', () => {
    const questions = buildArtikelQuestions(nounPool, 3);
    expect(questions).toHaveLength(3); // pl and genderless words dropped
    for (const q of questions) {
      expect(q.options).toEqual(ARTIKEL_OPTIONS);
      expect(q.options[q.correctIndex]).toBe(articleFor(q.word.gender));
    }
  });

  it('is deterministic per seed and reorders with the seed', () => {
    const big = Array.from({ length: 30 }, (_, i) => ({
      ...nounPool[i % 3],
      id: i + 1,
      lemma: `Nomen${i + 1}`,
    }));
    expect(buildArtikelQuestions(big, 5)).toEqual(buildArtikelQuestions(big, 5));
    expect(buildArtikelQuestions(big, 5).map((q) => q.word.id)).not.toEqual(
      buildArtikelQuestions(big, 6).map((q) => q.word.id)
    );
  });
});

describe('buildKonjugationQuestions', () => {
  function verb(id: number, lemma: string, forms: [string, string][], aux = 'haben'): VerbWord {
    return {
      id,
      lemma,
      gender: null,
      plural: null,
      gloss: `to ${lemma}`,
      aux,
      forms: forms.map(([form, tag]) => ({ form, tag })),
    };
  }

  const fahren = verb(
    1,
    'fahren',
    [
      ['fahre', 'präsens_ich'],
      ['fährst', 'präsens_du'],
      ['fährt', 'präsens_er'],
      ['fahrt', 'präsens_ihr'],
      ['fuhr', 'präteritum_ich'],
      ['fuhr', 'präteritum_er'],
      ['fuhren', 'präteritum_wir'],
      ['gefahren', 'partizip2'],
    ],
    'sein'
  );
  const machen = verb(2, 'machen', [
    ['mache', 'präsens_ich'],
    ['machst', 'präsens_du'],
    ['macht', 'präsens_er'],
    ['machte', 'präteritum_er'],
    ['machten', 'präteritum_wir'],
    ['gemacht', 'partizip2'],
  ]);

  it('asks a drillable tag with the right form among real sibling forms', () => {
    const questions = buildKonjugationQuestions([fahren, machen], 42);
    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(KONJUGATION_TAGS).toContain(q.tag);
      expect(q.options).toHaveLength(BLITZ_OPTIONS);
      expect(new Set(q.options).size).toBe(BLITZ_OPTIONS);
      const expected = q.word.forms.find((f) => f.tag === q.tag)!.form;
      expect(q.options[q.correctIndex]).toBe(expected);
      const all = new Set(q.word.forms.map((f) => f.form));
      for (const opt of q.options) expect(all.has(opt)).toBe(true);
    }
  });

  it('is deterministic per seed and varies with the seed', () => {
    const pool = [fahren, machen];
    expect(buildKonjugationQuestions(pool, 7)).toEqual(buildKonjugationQuestions(pool, 7));
    const many = Array.from({ length: 20 }, (_, i) => ({ ...fahren, id: i + 1 }));
    expect(buildKonjugationQuestions(many, 7).map((q) => q.options)).not.toEqual(
      buildKonjugationQuestions(many, 8).map((q) => q.options)
    );
  });

  it('skips verbs without enough distinct forms for four options', () => {
    const thin = verb(3, 'sein', [
      ['war', 'präteritum_er'],
      ['gewesen', 'partizip2'],
    ]);
    expect(buildKonjugationQuestions([thin], 5)).toHaveLength(0);
  });

  it('never repeats a duplicated surface form inside the options', () => {
    // fuhr appears under two tags — options must stay four distinct strings
    for (let seed = 1; seed < 30; seed++) {
      for (const q of buildKonjugationQuestions([fahren], seed)) {
        expect(new Set(q.options).size).toBe(BLITZ_OPTIONS);
      }
    }
  });

  it('konjugationContext picks the Perfekt auxiliary from the verb', () => {
    expect(konjugationContext('präsens_du', 'haben')).toEqual({ lead: 'du', tense: 'präsens' });
    expect(konjugationContext('partizip2', 'haben').lead).toBe('er hat');
    expect(konjugationContext('partizip2', 'sein').lead).toBe('er ist');
  });
});

describe('Satzbau', () => {
  function sentence(id: number, de: string, en = 'translation'): SentenceWord {
    return { id, de, en };
  }

  const POOL_DE: SentenceWord[] = [
    sentence(1, 'Ich gehe heute ins Kino.'),
    sentence(2, 'Was machst du morgen Abend?'),
    sentence(3, 'Er fährt jeden Tag mit dem Bus zur Arbeit.'),
    sentence(4, 'Wir haben gestern einen Film gesehen.'),
    sentence(5, 'Sie liest gern Bücher.'),
    sentence(6, 'Das Wetter ist heute sehr schön.'),
    sentence(7, 'Kannst du mir bitte helfen?'),
    sentence(8, 'Der Zug kommt um acht Uhr an.'),
    sentence(9, 'Mein Bruder wohnt in Berlin.'),
    sentence(10, 'Ich möchte einen Kaffee bestellen.'),
    sentence(11, 'Am Wochenende besuchen wir unsere Großeltern.'),
    sentence(12, 'Hunger!'), // too short — dropped
    sentence(13, 'Ich gehe heute ins Kino.'), // duplicate — dropped
  ];

  it('tokenizeSentence splits words and drops the final punctuation only', () => {
    expect(tokenizeSentence('Was machst du?')).toEqual(['Was', 'machst', 'du']);
    expect(tokenizeSentence('Ich gehe ins Kino.')).toEqual(['Ich', 'gehe', 'ins', 'Kino']);
    expect(tokenizeSentence('Komm her!')).toEqual(['Komm', 'her']);
    expect(tokenizeSentence('  Hallo Welt  ')).toEqual(['Hallo', 'Welt']);
    expect(tokenizeSentence('')).toEqual([]);
  });

  it('builds up to SATZBAU_SENTENCES questions from usable, distinct sentences', () => {
    const questions = buildSatzbauQuestions(POOL_DE, 42);
    expect(questions).toHaveLength(SATZBAU_SENTENCES);
    for (const q of questions) {
      expect(q.solution.length).toBeGreaterThanOrEqual(SATZBAU_MIN_TOKENS);
      expect(q.solution.length).toBeLessThanOrEqual(SATZBAU_MAX_TOKENS);
      // tiles are a permutation of the solution …
      expect(q.tiles.map((t) => t.text).sort()).toEqual([...q.solution].sort());
      expect(new Set(q.tiles.map((t) => t.id)).size).toBe(q.tiles.length);
      // … but never presented in the original order
      expect(q.tiles.map((t) => t.text)).not.toEqual(q.solution);
    }
  });

  it('is deterministic per seed and varies with the seed', () => {
    expect(buildSatzbauQuestions(POOL_DE, 9)).toEqual(buildSatzbauQuestions(POOL_DE, 9));
    expect(buildSatzbauQuestions(POOL_DE, 9).map((q) => q.solution)).not.toEqual(
      buildSatzbauQuestions(POOL_DE, 10).map((q) => q.solution)
    );
  });

  it('gradeSatzbau accepts only the exact sequence, duplicates included', () => {
    const solution = ['Die', 'Frau', 'sieht', 'die', 'Kinder'];
    expect(gradeSatzbau(solution, ['Die', 'Frau', 'sieht', 'die', 'Kinder'])).toBe(true);
    expect(gradeSatzbau(solution, ['die', 'Frau', 'sieht', 'Die', 'Kinder'])).toBe(false);
    expect(gradeSatzbau(solution, solution.slice(0, 4))).toBe(false);
  });
});

describe('Diktat', () => {
  const pool: GameWord[] = [
    { id: 1, lemma: 'Haus', gender: 'n', plural: null, gloss: 'house' },
    { id: 2, lemma: 'laufen', gender: null, plural: null, gloss: 'to run' },
    { id: 3, lemma: 'Frau', gender: 'f', plural: null, gloss: 'woman' },
    { id: 4, lemma: 'schön', gender: null, plural: null, gloss: 'beautiful' },
    ...Array.from({ length: 12 }, (_, i) =>
      word(10 + i, `Wort${i}`, `gloss${i}`)
    ),
  ];

  it('speaks nouns with their article, everything else bare, capped at DIKTAT_WORDS', () => {
    const questions = buildDiktatQuestions(pool, 3);
    expect(questions).toHaveLength(DIKTAT_WORDS);
    const byId = new Map(questions.map((q) => [q.word.id, q.text]));
    if (byId.has(1)) expect(byId.get(1)).toBe('das Haus');
    if (byId.has(2)) expect(byId.get(2)).toBe('laufen');
    expect(new Set(questions.map((q) => q.text.toLowerCase())).size).toBe(questions.length);
  });

  it('is deterministic per seed', () => {
    expect(buildDiktatQuestions(pool, 5)).toEqual(buildDiktatQuestions(pool, 5));
    expect(buildDiktatQuestions(pool, 5).map((q) => q.word.id)).not.toEqual(
      buildDiktatQuestions(pool, 6).map((q) => q.word.id)
    );
  });

  it('gradeDiktat ignores case and spacing, tolerates folded umlauts as a near-miss', () => {
    expect(gradeDiktat('das Haus', ' das  haus ')).toMatchObject({ correct: true, nearMiss: false });
    expect(gradeDiktat('schön', 'schoen')).toMatchObject({ correct: true, nearMiss: true });
    expect(gradeDiktat('die Straße', 'die strasse')).toMatchObject({ correct: true, nearMiss: true });
    expect(gradeDiktat('das Haus', 'die Haus')).toMatchObject({ correct: false });
    expect(gradeDiktat('laufen', 'kaufen')).toMatchObject({ correct: false });
  });

  it('honors a custom word count for duel rounds', () => {
    expect(buildDiktatQuestions(pool, 3, 4)).toHaveLength(4);
    expect(buildDiktatQuestions(pool, 3, DIKTAT_DUEL_WORDS)).toHaveLength(
      Math.min(DIKTAT_DUEL_WORDS, pool.length)
    );
  });

  it('buildDiktatDuelQuestions ships plain words in the duel wire shape', () => {
    const questions = buildDiktatDuelQuestions(pool, 7);
    expect(questions).toHaveLength(Math.min(DIKTAT_DUEL_WORDS, pool.length));
    for (const q of questions) {
      expect(q.options).toEqual([]);
      expect(q.correctIndex).toBe(-1);
    }
    // The spoken text is reconstructible on every device from the word alone.
    expect(questions.map((q) => withArticle(q.word))).toEqual(
      buildDiktatQuestions(pool, 7, DIKTAT_DUEL_WORDS).map((q) => q.text)
    );
  });
});

describe('addReviewWord', () => {
  it('appends missed words once, keeping miss order', () => {
    let words: string[] = [];
    for (const lemma of ['Baum', 'Haus', 'Baum']) words = addReviewWord(words, lemma);
    expect(words).toEqual(['Baum', 'Haus']);
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

  it('has plenty of verbs with enough distinct forms for the Konjugations-Trainer', () => {
    const rows = db
      .prepare(
        `SELECT l.id, COUNT(DISTINCT f.form) AS distinct_forms
         FROM lemmas l JOIN forms f ON f.lemma_id = l.id
         WHERE l.pos = 'verb' GROUP BY l.id HAVING distinct_forms >= 4`
      )
      .all();
    expect(rows.length).toBeGreaterThan(500);
  });

  it('has plenty of punctuation-free 4–9 word example sentences for Satzbau', () => {
    const rows = db
      .prepare(
        `SELECT s.example_de AS de FROM senses s
         WHERE s.sense_order = 1 AND s.example_de IS NOT NULL AND s.example_en IS NOT NULL
           AND s.example_de NOT LIKE '%,%' AND s.example_de NOT LIKE '%:%'
           AND s.example_de NOT LIKE '%"%' AND s.example_de NOT LIKE '%„%'
           AND s.example_de NOT LIKE '%–%' AND s.example_de NOT LIKE '%(%'`
      )
      .all() as { de: string }[];
    const usable = rows.filter((r) => {
      const count = tokenizeSentence(r.de).length;
      return count >= SATZBAU_MIN_TOKENS && count <= SATZBAU_MAX_TOKENS;
    });
    expect(usable.length).toBeGreaterThan(1000);
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
