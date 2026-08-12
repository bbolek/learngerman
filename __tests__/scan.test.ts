import Database from 'better-sqlite3';
import * as path from 'node:path';

import type { QueryDb } from '@/logic/lookup';
import {
  cleanScannedWord,
  collectScanWords,
  dedupeScanWords,
  mapFrameToView,
  resolveScanWords,
  uprightScanFrame,
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

describe('uprightScanFrame', () => {
  // Portrait photo as reported by the camera: upright 3000×4000, so the
  // stored buffer is landscape 4000×3000 for the rotated orientations.
  const photo = { width: 3000, height: 4000 };
  const frame = { left: 100, top: 200, width: 400, height: 50 };

  it('leaves frames untouched for orientation 1 and unknown values', () => {
    expect(uprightScanFrame(frame, 1, photo)).toEqual(frame);
    expect(uprightScanFrame(frame, 0, photo)).toEqual(frame);
    expect(uprightScanFrame(frame, NaN, photo)).toEqual(frame);
  });

  it('rotates 90° CW frames (orientation 6, normal portrait shot)', () => {
    // Buffer top-left corner must land in the upright top-right corner.
    expect(uprightScanFrame({ left: 0, top: 0, width: 400, height: 50 }, 6, photo)).toEqual({
      left: 3000 - 50,
      top: 0,
      width: 50,
      height: 400,
    });
    expect(uprightScanFrame(frame, 6, photo)).toEqual({
      left: 3000 - 250,
      top: 100,
      width: 50,
      height: 400,
    });
  });

  it('rotates 90° CCW frames (orientation 8)', () => {
    // Buffer top-left corner must land in the upright bottom-left corner.
    expect(uprightScanFrame({ left: 0, top: 0, width: 400, height: 50 }, 8, photo)).toEqual({
      left: 0,
      top: 4000 - 400,
      width: 50,
      height: 400,
    });
  });

  it('rotates 180° frames (orientation 3)', () => {
    expect(uprightScanFrame(frame, 3, photo)).toEqual({
      left: 3000 - 500,
      top: 4000 - 250,
      width: 400,
      height: 50,
    });
  });

  it('mirrors horizontal/vertical frames (orientations 2 and 4)', () => {
    expect(uprightScanFrame(frame, 2, photo)).toEqual({ ...frame, left: 3000 - 500 });
    expect(uprightScanFrame(frame, 4, photo)).toEqual({ ...frame, top: 4000 - 250 });
  });

  it('keeps rotated frames inside the upright photo bounds', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const buffer = orientation >= 5 ? { width: 4000, height: 3000 } : photo;
      const f = { left: buffer.width - 700, top: buffer.height - 90, width: 600, height: 80 };
      const up = uprightScanFrame(f, orientation, photo);
      expect(up.left).toBeGreaterThanOrEqual(0);
      expect(up.top).toBeGreaterThanOrEqual(0);
      expect(up.left + up.width).toBeLessThanOrEqual(photo.width);
      expect(up.top + up.height).toBeLessThanOrEqual(photo.height);
    }
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
