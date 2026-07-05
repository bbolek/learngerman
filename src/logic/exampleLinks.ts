/**
 * Splitting example sentences into words so the app can auto-link the
 * lesser-known ones to dictionary entries (no authoring markers needed).
 * Pure string logic — resolution against the DB happens in dictionaryRepo.
 */

export interface ExampleSegment {
  text: string;
  /** True when the segment is a word candidate (letters, may contain hyphens). */
  word: boolean;
}

/** German word runs: letters (incl. umlauts/ß), inner hyphens kept ("E-Mail"). */
const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

/** Split a sentence into alternating word / non-word segments (lossless). */
export function segmentExample(text: string): ExampleSegment[] {
  const segments: ExampleSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), word: false });
    segments.push({ text: m[0], word: true });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), word: false });
  return segments;
}

/** Same normalization as the DB's *_norm columns. */
export function normalizeToken(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

/** Unique normalized lookup candidates (single letters aren't worth linking). */
export function wordTokens(segments: ExampleSegment[]): string[] {
  const out = new Set<string>();
  for (const seg of segments) {
    if (seg.word && seg.text.length >= 2) out.add(normalizeToken(seg.text));
  }
  return [...out];
}
