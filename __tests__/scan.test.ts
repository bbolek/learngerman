import Database from 'better-sqlite3';
import * as path from 'node:path';

import type { QueryDb } from '@/logic/lookup';
import {
  cleanScannedWord,
  collectScanWords,
  dedupeScanWords,
  mapFrameToView,
  resolveScanWords,
} from '@/logic/scan';

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

describe('cleanScannedWord', () => {
  it('keeps plain words', () => {
    expect(cleanScannedWord('Bäckerei')).toBe('Bäckerei');
  });

  it('strips surrounding punctuation and quotes', () => {
    expect(cleanScannedWord('„Hallo!“')).toBe('Hallo');
    expect(cleanScannedWord('(Ausgang)')).toBe('Ausgang');
    expect(cleanScannedWord('Straße,')).toBe('Straße');
  });

  it('keeps inner hyphens and apostrophes', () => {
    expect(cleanScannedWord('S-Bahn,')).toBe('S-Bahn');
    expect(cleanScannedWord("geht's")).toBe("geht's");
  });

  it('rejects numbers, symbols and single letters', () => {
    expect(cleanScannedWord('123')).toBeNull();
    expect(cleanScannedWord('§4a')).toBeNull();
    expect(cleanScannedWord('€')).toBeNull();
    expect(cleanScannedWord('A')).toBeNull();
    expect(cleanScannedWord('--')).toBeNull();
  });

  it('strips trailing digits but rejects digits between letters', () => {
    expect(cleanScannedWord('Gleis9')).toBe('Gleis');
    expect(cleanScannedWord('B2B')).toBeNull();
  });
});

describe('collectScanWords / dedupeScanWords', () => {
  const frame = { left: 0, top: 0, width: 10, height: 10 };

  it('cleans elements, keeps frames, drops junk', () => {
    const words = collectScanWords([
      { text: 'Der', frame },
      { text: 'Zug!', frame },
      { text: '18:30', frame },
      { text: 'fährt', frame: null },
    ]);
    expect(words.map((w) => w.word)).toEqual(['Der', 'Zug', 'fährt']);
    expect(words[0].frame).toEqual(frame);
    expect(words[2].frame).toBeNull();
  });

  it('dedupes case-insensitively, keeping reading order', () => {
    const words = collectScanWords([
      { text: 'Zug' },
      { text: 'Bahn' },
      { text: 'ZUG' },
      { text: 'zug.' },
    ]);
    expect(dedupeScanWords(words).map((w) => w.word)).toEqual(['Zug', 'Bahn']);
  });
});

describe('resolveScanWords', () => {
  it('matches exact lemmas', async () => {
    const hits = await resolveScanWords(db, ['bäckerei']);
    expect(hits.get('bäckerei')).toMatchObject({ lemma: 'Bäckerei', pos: 'noun' });
    expect(hits.get('bäckerei')!.gloss).toContain('bakery');
  });

  it('matches inflected forms: häuser → Haus, gemacht → machen', async () => {
    const hits = await resolveScanWords(db, ['häuser', 'gemacht']);
    expect(hits.get('häuser')).toMatchObject({ lemma: 'Haus' });
    expect(hits.get('gemacht')).toMatchObject({ lemma: 'machen' });
  });

  it('omits words that are not in the dictionary', async () => {
    const hits = await resolveScanWords(db, ['zug', 'xqzzyblorf']);
    expect(hits.has('zug')).toBe(true);
    expect(hits.has('xqzzyblorf')).toBe(false);
  });

  it('handles an empty token list', async () => {
    const hits = await resolveScanWords(db, []);
    expect(hits.size).toBe(0);
  });
});

describe('mapFrameToView', () => {
  const photo = { width: 1000, height: 2000 };

  it('scales and centers for contain fit (letterboxed left/right)', () => {
    // View is wider than the photo's aspect: photo is scaled by height.
    const box = mapFrameToView({ left: 100, top: 200, width: 300, height: 400 }, photo, {
      width: 400,
      height: 600,
    });
    // scale = min(400/1000, 600/2000) = 0.3 → photo renders 300×600, offsetX 50.
    expect(box).toEqual({ left: 50 + 30, top: 60, width: 90, height: 120 });
  });

  it('returns null for unusable dimensions', () => {
    const frame = { left: 0, top: 0, width: 10, height: 10 };
    expect(mapFrameToView(frame, { width: 0, height: 0 }, { width: 400, height: 600 })).toBeNull();
    expect(mapFrameToView(frame, photo, { width: 0, height: 0 })).toBeNull();
  });
});
