import type { QueryDb } from '@/logic/lookup';
import { normalize } from '@/logic/normalize';

/**
 * Pure logic for the camera scanner: turning ML Kit OCR output into clean,
 * tappable German words and resolving them against the bundled dictionary.
 * OCR frames are in photo pixel coordinates; mapFrameToView projects them
 * onto the preview image shown with "contain" fit.
 */

export interface ScanFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Minimal shape of an ML Kit text element (one recognized word). */
export interface ScanElement {
  text: string;
  frame?: ScanFrame | null;
}

export interface ScanWord {
  /** Cleaned spelling as printed ("Bäckerei", "S-Bahn"). */
  word: string;
  /** normalize()d key used for dictionary matching. */
  norm: string;
  frame: ScanFrame | null;
}

/**
 * Strip surrounding punctuation/quotes/digits from an OCR token, keeping
 * inner hyphens and apostrophes ("S-Bahn", "geht's"). Returns null for
 * tokens that aren't a plausible word: no letters, single letters, numbers,
 * or leftover symbol runs.
 */
export function cleanScannedWord(raw: string): string | null {
  const stripped = raw.normalize('NFC').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (stripped.length < 2 || stripped.length > 40) return null;
  if (!/^\p{L}+(?:[-'’]\p{L}+)*$/u.test(stripped)) return null;
  return stripped;
}

/** Clean every OCR element into a ScanWord, dropping non-words. */
export function collectScanWords(elements: ScanElement[]): ScanWord[] {
  const words: ScanWord[] = [];
  for (const el of elements) {
    const word = cleanScannedWord(el.text);
    if (!word) continue;
    words.push({ word, norm: normalize(word), frame: el.frame ?? null });
  }
  return words;
}

/** Unique words by normalized spelling, keeping first-seen (reading) order. */
export function dedupeScanWords(words: ScanWord[]): ScanWord[] {
  const seen = new Set<string>();
  const out: ScanWord[] = [];
  for (const w of words) {
    if (seen.has(w.norm)) continue;
    seen.add(w.norm);
    out.push(w);
  }
  return out;
}

export interface ScanHit {
  lemmaId: number;
  lemma: string;
  pos: string;
  gender: string | null;
  level: string;
  gloss: string;
}

const HIT_COLS = `l.id AS lemmaId, l.lemma, l.pos, l.gender, l.level,
  (SELECT en FROM senses WHERE lemma_id = l.id ORDER BY sense_order LIMIT 1) AS gloss`;

/**
 * Batch-resolve scanned words to dictionary entries: exact lemma match first,
 * then inflected forms ("Häuser" → Haus). Returns a map keyed by norm;
 * unmatched words are simply absent. Mirrors the precedence of
 * resolveExampleWords but stays on the injectable QueryDb surface so jest
 * can run it against the real built DB.
 */
export async function resolveScanWords(
  db: QueryDb,
  norms: string[]
): Promise<Map<string, ScanHit>> {
  const map = new Map<string, ScanHit>();
  const unique = [...new Set(norms)];
  if (unique.length === 0) return map;

  const marks = unique.map(() => '?').join(',');
  const lemmaRows = await db.getAllAsync<ScanHit & { lemma_norm: string }>(
    `SELECT ${HIT_COLS}, l.lemma_norm FROM lemmas l WHERE l.lemma_norm IN (${marks})
     ORDER BY l.freq_rank IS NULL, l.freq_rank`,
    unique
  );
  for (const r of lemmaRows) {
    if (!map.has(r.lemma_norm)) {
      const { lemma_norm: _n, ...hit } = r;
      map.set(r.lemma_norm, hit);
    }
  }

  const rest = unique.filter((n) => !map.has(n));
  if (rest.length > 0) {
    const formRows = await db.getAllAsync<ScanHit & { form_norm: string }>(
      `SELECT ${HIT_COLS}, f.form_norm FROM forms f JOIN lemmas l ON l.id = f.lemma_id
       WHERE f.form_norm IN (${rest.map(() => '?').join(',')})
       ORDER BY l.freq_rank IS NULL, l.freq_rank`,
      rest
    );
    for (const r of formRows) {
      if (!map.has(r.form_norm)) {
        const { form_norm: _n, ...hit } = r;
        map.set(r.form_norm, hit);
      }
    }
  }
  return map;
}

/**
 * Rotate/mirror an OCR frame from the photo's stored-pixel (buffer) space
 * into the upright space the photo is displayed in.
 *
 * iOS saves camera photos with the sensor's landscape pixels plus an EXIF
 * orientation tag (expo-camera reports upright width/height and the tag via
 * `exif.Orientation`), and ML Kit on iOS returns frames in the raw buffer's
 * coordinates — so a portrait shot (orientation 6) comes back with frames
 * rotated 90° against the displayed image. Android's ML Kit input applies
 * the EXIF rotation itself, so callers pass 1 there (no-op).
 *
 * `photo` is the upright size as reported by the camera. Unknown/missing
 * orientation values leave the frame untouched.
 */
export function uprightScanFrame(
  frame: ScanFrame,
  exifOrientation: number,
  photo: { width: number; height: number }
): ScanFrame {
  const { left: x, top: y, width: w, height: h } = frame;
  const pw = photo.width;
  const ph = photo.height;
  switch (exifOrientation) {
    case 2: // mirrored horizontally
      return { left: pw - (x + w), top: y, width: w, height: h };
    case 3: // rotated 180°
      return { left: pw - (x + w), top: ph - (y + h), width: w, height: h };
    case 4: // mirrored vertically
      return { left: x, top: ph - (y + h), width: w, height: h };
    case 5: // mirrored + rotated 90° CW
      return { left: y, top: x, width: h, height: w };
    case 6: // rotated 90° CW (portrait, home button right)
      return { left: pw - (y + h), top: x, width: h, height: w };
    case 7: // mirrored + rotated 90° CCW
      return { left: pw - (y + h), top: ph - (x + w), width: h, height: w };
    case 8: // rotated 90° CCW (portrait upside-down grip)
      return { left: y, top: ph - (x + w), width: h, height: w };
    default:
      return frame;
  }
}

/**
 * Project a photo-pixel frame onto a view that shows the photo with
 * "contain" fit (letterboxed, centered). Returns null when the photo
 * dimensions are unusable so callers can skip the overlay.
 */
export function mapFrameToView(
  frame: ScanFrame,
  photo: { width: number; height: number },
  view: { width: number; height: number }
): ScanFrame | null {
  if (photo.width <= 0 || photo.height <= 0 || view.width <= 0 || view.height <= 0) return null;
  const scale = Math.min(view.width / photo.width, view.height / photo.height);
  const offsetX = (view.width - photo.width * scale) / 2;
  const offsetY = (view.height - photo.height * scale) / 2;
  return {
    left: offsetX + frame.left * scale,
    top: offsetY + frame.top * scale,
    width: frame.width * scale,
    height: frame.height * scale,
  };
}
