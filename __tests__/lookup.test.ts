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
