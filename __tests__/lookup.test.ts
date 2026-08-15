import Database from 'better-sqlite3';
import * as path from 'node:path';

import { lookupEnglish, lookupGerman, type QueryDb } from '@/logic/lookup';

/** Adapt better-sqlite3 to the async QueryDb surface used by the app. */
function testDb(): QueryDb {
  const db = new Database(path.join(__dirname, '../assets/db/dictionary.db'), {
    readonly: true,
  });
  return {
    getAllAsync: async <T>(sql: string, params: (string | number)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
}

const db = testDb();

describe('lookupGerman', () => {
  it('finds the lemma itself', async () => {
    const hits = await lookupGerman(db, 'machen');
    expect(hits[0]).toMatchObject({ lemma: 'machen', via: 'lemma' });
    expect(hits[0].gloss).toContain('to make');
  });

  it('resolves inflected forms to the lemma: gemacht → machen', async () => {
    const hits = await lookupGerman(db, 'gemacht');
    expect(hits[0]).toMatchObject({ lemma: 'machen', via: 'form', matchedTag: 'partizip2' });
  });

  it('resolves stem-changed präsens: fährt → fahren', async () => {
    const hits = await lookupGerman(db, 'fährt');
    expect(hits[0]).toMatchObject({ lemma: 'fahren', via: 'form' });
  });

  it('resolves präteritum of sein: war → sein', async () => {
    const hits = await lookupGerman(db, 'war');
    expect(hits[0]).toMatchObject({ lemma: 'sein', via: 'form' });
  });

  it('handles umlaut digraph typing: haeuser → Haus', async () => {
    const hits = await lookupGerman(db, 'haeuser');
    expect(hits[0]).toMatchObject({ lemma: 'Haus', via: 'form' });
  });

  it('handles plain typing without umlauts: hauser → Haus', async () => {
    const hits = await lookupGerman(db, 'hauser');
    expect(hits[0]).toMatchObject({ lemma: 'Haus', via: 'form' });
  });

  it('is case-insensitive: HAUS → Haus', async () => {
    const hits = await lookupGerman(db, 'HAUS');
    expect(hits[0]).toMatchObject({ lemma: 'Haus', via: 'lemma' });
  });

  it('falls back to prefix search: schlü → Schlüssel', async () => {
    const hits = await lookupGerman(db, 'schlü');
    expect(hits.map((h) => h.lemma)).toContain('Schlüssel');
  });

  it('lists compounds below the exact hit: zeug → Zeug, then Flugzeug…', async () => {
    const hits = await lookupGerman(db, 'zeug', 50);
    expect(hits[0]).toMatchObject({ lemma: 'Zeug', via: 'lemma' });
    const lemmas = hits.map((h) => h.lemma);
    expect(lemmas).toEqual(expect.arrayContaining(['Flugzeug', 'Werkzeug', 'Feuerzeug', 'Spielzeug']));
    // prefix matches (Zeugnis) rank above in-word matches (Flugzeug)
    expect(lemmas.indexOf('Zeugnis')).toBeLessThan(lemmas.indexOf('Flugzeug'));
  });

  it('shows compounds even when the query has exact form hits: haus → Haus, Krankenhaus', async () => {
    const hits = await lookupGerman(db, 'haus', 50);
    expect(hits[0]).toMatchObject({ lemma: 'Haus' });
    expect(hits.map((h) => h.lemma)).toContain('Krankenhaus');
  });

  it('resolves comparative: besser → gut', async () => {
    const hits = await lookupGerman(db, 'besser');
    expect(hits[0]).toMatchObject({ lemma: 'gut', via: 'form', matchedTag: 'komparativ' });
  });

  it('returns empty for gibberish', async () => {
    expect(await lookupGerman(db, 'xqzzy')).toEqual([]);
  });
});

/** Function words are the words learners tap most; every form must resolve. */
describe('function-word forms', () => {
  const cases: [string, string, string][] = [
    ['mich', 'ich', 'akkusativ'],
    ['mir', 'ich', 'dativ'],
    ['ihn', 'er', 'akkusativ'],
    ['ihm', 'er', 'dativ'],
    ['ihnen', 'sie', 'dativ'],
    ['euch', 'ihr', 'akkusativ'],
    ['wen', 'wer', 'akkusativ'],
    ['seine', 'er', 'possessiv'],
    ['unserem', 'wir', 'possessiv'],
    ['meinen', 'mein', 'dekliniert'],
    ['eure', 'euer', 'dekliniert'],
    ['dem', 'der', 'dekliniert'],
    ['dessen', 'der', 'genitiv'],
    ['einer', 'ein', 'dekliniert'],
    ['keinem', 'kein', 'dekliniert'],
    ['diesen', 'dieser', 'dekliniert'],
    ['jedes', 'jeder', 'dekliniert'],
    ['vieler', 'viel', 'dekliniert'],
    ['ganzen', 'ganz', 'dekliniert'],
    ['ersten', 'erste', 'dekliniert'],
    ['zwanzigsten', 'zwanzigste', 'dekliniert'],
  ];

  it.each(cases)('%s → %s (%s)', async (form, lemma, tag) => {
    const hits = await lookupGerman(db, form);
    expect(hits.map((h) => `${h.lemma}|${h.matchedTag}`)).toContain(`${lemma}|${tag}`);
  });

  it.each([
    ['im', 'in'],
    ['ins', 'in'],
    ['am', 'an'],
    ['ans', 'an'],
    ['zum', 'zu'],
    ['zur', 'zu'],
    ['vom', 'von'],
    ['beim', 'bei'],
  ])('contraction %s → %s', async (form, lemma) => {
    const hits = await lookupGerman(db, form);
    expect(hits.map((h) => `${h.lemma}|${h.matchedTag}`)).toContain(`${lemma}|kontraktion`);
  });

  it.each([
    ['wäre', 'sein'],
    ['wärst', 'sein'],
    ['hätte', 'haben'],
    ['würden', 'werden'],
    ['könnte', 'können'],
    ['müsste', 'müssen'],
    ['käme', 'kommen'],
    ['ginge', 'gehen'],
  ])('Konjunktiv II %s → %s', async (form, lemma) => {
    const hits = await lookupGerman(db, form);
    expect(hits.map((h) => `${h.lemma}|${h.matchedTag}`)).toContain(`${lemma}|konjunktiv2`);
  });

  it('keeps the dative -e of one-syllable nouns: Kinde → Kind', async () => {
    const hits = await lookupGerman(db, 'Kinde');
    expect(hits.map((h) => `${h.lemma}|${h.matchedTag}`)).toContain('Kind|dativ');
  });

  it('declines adjectives whose citation form ends in -e: leiser → leise', async () => {
    const hits = await lookupGerman(db, 'leiser');
    expect(hits.map((h) => h.lemma)).toContain('leise');
  });

  it('keeps the e of -er adjectives that never elided it: schwere → schwer', async () => {
    const hits = await lookupGerman(db, 'schwere');
    expect(hits.map((h) => h.lemma)).toContain('schwer');
  });

  it('indexes Konjunktiv I for indirect speech: könne → können', async () => {
    const hits = await lookupGerman(db, 'könne');
    expect(hits.map((h) => `${h.lemma}|${h.matchedTag}`)).toContain('können|konjunktiv1');
  });

  it('wraps zu inside separable verbs: zurückzulassen → zurücklassen', async () => {
    const hits = await lookupGerman(db, 'zurückzulassen');
    expect(hits.map((h) => h.lemma)).toContain('zurücklassen');
  });

  it('shifts e→i in the imperative: sieh → sehen', async () => {
    const hits = await lookupGerman(db, 'sieh');
    expect(hits.map((h) => h.lemma)).toContain('sehen');
  });
});

/** Open word classes German builds on the fly — see src/logic/wordParts.ts. */
describe('words assembled on the fly', () => {
  it.each([
    ['Apfelkuchen', 'Kuchen'],
    ['Fischbrötchen', 'Brötchen'],
    ['Königstochter', 'Tochter'],
    ['Zweizimmerwohnung', 'Wohnung'],
    ['Läuferinnen', 'Läufer'],
    ['Töpfchen', 'Topf'],
    ['erstarrenden', 'erstarren'],
  ])('%s resolves through %s', async (word, expected) => {
    const hits = await lookupGerman(db, word);
    expect(hits.map((h) => h.lemma)).toContain(expected);
  });

  it('offers both halves of a compound, head first', async () => {
    const hits = await lookupGerman(db, 'Apfelkuchen');
    expect(hits.slice(0, 2).map((h) => h.lemma)).toEqual(['Kuchen', 'Apfel']);
  });
});

describe('lookupEnglish', () => {
  it('finds German word by English gloss: house → Haus', async () => {
    const hits = await lookupEnglish(db, 'house');
    expect(hits[0]).toMatchObject({ lemma: 'Haus' });
  });

  it('matches inside multi-word glosses: make → machen', async () => {
    const hits = await lookupEnglish(db, 'make');
    expect(hits.map((h) => h.lemma)).toContain('machen');
  });

  it('is case-insensitive: HELP → helfen', async () => {
    const hits = await lookupEnglish(db, 'HELP');
    expect(hits.map((h) => h.lemma)).toContain('helfen');
  });
});
