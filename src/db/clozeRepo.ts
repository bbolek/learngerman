import { getDb } from '@/db/client';
import { buildCloze, type Cloze } from '@/logic/cloze';
import { normalizeToken } from '@/logic/exampleLinks';

interface ClozeSource {
  lemma_id: number;
  example_de: string | null;
}

/**
 * Build a cloze for each card that has an example sentence containing one of
 * the word's surface forms. Returns a map keyed by lemma_id; cards without a
 * usable sentence are simply absent (the caller falls back to a recall card).
 *
 * Forms for every card are fetched in a single query, so this stays one round
 * trip regardless of session size.
 */
export async function buildClozes(cards: ClozeSource[]): Promise<Map<number, Cloze>> {
  const withExample = cards.filter((c) => c.example_de && c.example_de.trim().length > 0);
  if (withExample.length === 0) return new Map();

  const ids = [...new Set(withExample.map((c) => c.lemma_id))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await getDb().getAllAsync<{ lemma_id: number; form_norm: string }>(
    `SELECT lemma_id, form_norm FROM forms WHERE lemma_id IN (${placeholders})
     UNION
     SELECT id AS lemma_id, lemma_norm AS form_norm FROM lemmas WHERE id IN (${placeholders})`,
    [...ids, ...ids]
  );

  const formsByLemma = new Map<number, Set<string>>();
  for (const r of rows) {
    let set = formsByLemma.get(r.lemma_id);
    if (!set) formsByLemma.set(r.lemma_id, (set = new Set()));
    set.add(normalizeToken(r.form_norm));
  }

  const out = new Map<number, Cloze>();
  for (const card of withExample) {
    const forms = formsByLemma.get(card.lemma_id);
    if (!forms) continue;
    const cloze = buildCloze(card.example_de as string, forms);
    if (cloze) out.set(card.lemma_id, cloze);
  }
  return out;
}
