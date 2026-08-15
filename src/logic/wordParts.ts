/**
 * Fallbacks for words the dictionary cannot index directly.
 *
 * Three things defeat a finite form list. Participles and adjectives take
 * endings from an open set of stems (erstarrenden, zugesagte); every
 * masculine person noun has a feminine counterpart (Läuferin, Grafikerinnen);
 * and German builds compounds freely, so no word list will ever contain
 * Fischbrötchen or Bibliothekswissenschaft. Each is resolved by reducing the
 * typed word to something the dictionary does know, so the learner still
 * lands on a real entry.
 *
 * Pure string logic — the caller supplies the dictionary lookups.
 */

/** Adjective/participle endings, longest first. */
const ADJ_ENDINGS = ['en', 'em', 'er', 'es', 'e'];

/** Feminine person suffixes: Läuferin, Läuferinnen → Läufer. */
const FEMININE_SUFFIXES = ['innen', 'in'];

/** Shortest part that may stand as one half of a compound. */
const MIN_MODIFIER = 3;
/** Heads carry the meaning, so they need more substance than the modifier. */
const MIN_HEAD = 4;
/** A head that is only an inflected form needs more letters to be believable. */
const MIN_INFLECTED_HEAD = 5;

/** Linking morphemes: Königskind, Straßenrand, Menschengedenken. */
const FUGEN = ['', 's', 'n', 'en', 'es', 'er'];

function strip(word: string, suffixes: string[], minRest: number): string[] {
  const out: string[] = [];
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= minRest) {
      out.push(word.slice(0, -suffix.length));
    }
  }
  return out;
}

/**
 * The word with one ending removed, longest ending first. Both the adjective
 * endings and the feminine suffixes are tried, since either can sit on a word
 * whose base form is all the dictionary holds.
 */
export function reducedCandidates(word: string): string[] {
  return [
    ...strip(word, ADJ_ENDINGS, MIN_MODIFIER),
    ...strip(word, FEMININE_SUFFIXES, MIN_HEAD),
  ];
}

export interface CompoundSplit {
  /** The qualifying first part: Apfel in Apfelkuchen. */
  modifier: string;
  /** The last part, which carries the meaning and the gender: Kuchen. */
  head: string;
}

/**
 * Every way the word could be a two-part compound, longest head first so
 * "nachsehen" splits as nach|sehen rather than nachse|hen. Both parts have to
 * be checked against the dictionary by the caller — this only enumerates.
 */
export function compoundCandidates(word: string): CompoundSplit[] {
  const out: CompoundSplit[] = [];
  for (let cut = MIN_MODIFIER; cut <= word.length - MIN_HEAD; cut++) {
    const head = word.slice(cut);
    const left = word.slice(0, cut);
    for (const fuge of FUGEN) {
      if (fuge && !left.endsWith(fuge)) continue;
      const modifier = fuge ? left.slice(0, -fuge.length) : left;
      if (modifier.length >= MIN_MODIFIER) out.push({ modifier, head });
    }
  }
  return out;
}

/** Every spelling worth querying for one unresolved word. */
export function partCandidates(word: string): string[] {
  const parts = new Set<string>();
  for (const base of [word, ...reducedCandidates(word)]) {
    if (base !== word) parts.add(base);
    for (const { modifier, head } of compoundCandidates(base)) {
      parts.add(modifier);
      parts.add(head);
    }
  }
  return [...parts];
}

/**
 * First split whose parts are both known, or null. Modifiers must be lemmas.
 * Heads are tried as lemmas first and only then as inflected forms
 * (Ortsnamen → Ort + Namen), because a short form makes a convincing-looking
 * wrong split — "nachsehen" would otherwise come apart as nach + Ehen.
 */
export function resolveCompound(
  word: string,
  isLemma: (part: string) => boolean,
  isForm: (part: string) => boolean = () => false
): CompoundSplit | null {
  const candidates = compoundCandidates(word);
  for (const split of candidates) {
    if (isLemma(split.head) && isLemma(split.modifier)) return split;
  }
  for (const split of candidates) {
    if (split.head.length < MIN_INFLECTED_HEAD) continue;
    if (isForm(split.head) && isLemma(split.modifier)) return split;
  }
  return null;
}

/**
 * The spelling an unresolvable word should link to, or null. Endings come off
 * first (cheapest and most certain), then the word is read as a compound —
 * both on the word itself and on its reduced forms, so "Personalchefin"
 * reaches Personal + Chef.
 */
export function resolveByParts(
  word: string,
  isLemma: (part: string) => boolean,
  isForm: (part: string) => boolean
): string | null {
  const reduced = reducedCandidates(word);
  for (const base of reduced) {
    if (isLemma(base) || isForm(base)) return base;
  }
  for (const base of [word, ...reduced]) {
    const split = resolveCompound(base, isLemma, isForm);
    if (split) return split.head;
  }
  return null;
}
