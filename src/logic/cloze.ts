/**
 * Pure logic for building cloze (fill-in-the-blank) cards from an example
 * sentence. No RN imports, no DB — the caller supplies the word's known
 * surface forms; this just finds and blanks one in the sentence.
 */

import { normalizeToken, segmentExample } from '@/logic/exampleLinks';

export const CLOZE_BLANK = '_____';

/** Shortest surface form worth hiding — one- and two-letter blanks are trivial. */
const MIN_ANSWER_LEN = 3;

export interface Cloze {
  /** The sentence with the target form replaced by {@link CLOZE_BLANK}. */
  masked: string;
  /** The surface form that was removed — the expected answer. */
  answer: string;
}

/**
 * Blank the first token of `sentence` that matches one of the word's known
 * `forms` (normalized). Returns null when nothing suitable is found, so the
 * caller can fall back to a normal recall card.
 */
export function buildCloze(sentence: string, forms: Set<string>): Cloze | null {
  const segments = segmentExample(sentence);
  const targetIndex = segments.findIndex(
    (seg) => seg.word && seg.text.length >= MIN_ANSWER_LEN && forms.has(normalizeToken(seg.text))
  );
  if (targetIndex === -1) return null;

  const answer = segments[targetIndex].text;
  const masked = segments
    .map((seg, i) => (i === targetIndex ? CLOZE_BLANK : seg.text))
    .join('');
  return { masked, answer };
}
