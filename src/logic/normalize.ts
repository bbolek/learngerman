/**
 * Text normalization shared by the dictionary build script and runtime lookup.
 * Rule: lowercase + trim + NFC; umlauts/ß are KEPT. ASCII-folded variants are
 * generated at query time so "haeuser"/"hauser" still find "Häuser".
 */

export function normalize(input: string): string {
  return input.normalize('NFC').trim().toLowerCase();
}

/** Fold German special characters to their ASCII digraph spelling. */
export function asciiFold(normalized: string): string {
  return normalized
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss');
}

const EXPANSIONS: ReadonlyArray<readonly [string, string]> = [
  ['ae', 'ä'],
  ['oe', 'ö'],
  ['ue', 'ü'],
  ['ss', 'ß'],
];

const MAX_VARIANTS = 8;

/**
 * Generate spelling variants of a query by expanding ASCII digraphs into
 * umlauts/ß ("haeuser" → "häuser"). Also strips digraph-free letters the other
 * way ("hauser" won't match — that case is handled by the folded-column
 * lookup instead). Returns unique variants excluding the input, capped to
 * keep the SQL IN() list small.
 */
export function umlautVariants(query: string): string[] {
  let variants = new Set<string>([query]);
  for (const [digraph, umlaut] of EXPANSIONS) {
    const next = new Set<string>();
    for (const v of variants) {
      next.add(v);
      // expand each occurrence combination: simplest is all-or-nothing plus
      // single-occurrence expansions, which covers real German words
      if (v.includes(digraph)) {
        next.add(v.replaceAll(digraph, umlaut));
        const idx = v.indexOf(digraph);
        next.add(v.slice(0, idx) + umlaut + v.slice(idx + digraph.length));
      }
    }
    variants = next;
    if (variants.size > MAX_VARIANTS * 4) break;
  }
  variants.delete(query);
  return [...variants].slice(0, MAX_VARIANTS);
}
