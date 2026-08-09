/**
 * Lernpfad lesson & review session assembly — pure, seeded, RN-free.
 *
 * A lesson plan walks every new word through three exposures
 * (intro flip card → recognize → produce), spaced apart Duolingo-style,
 * with grammar questions interleaved into the back of the session.
 * Wrong answers are re-queued by the screen; the plan itself is fixed.
 */

export type McDirection = 'de_en' | 'en_de';

export type PathExercise =
  | { kind: 'intro'; lemmaId: number }
  | { kind: 'vocab_mc'; lemmaId: number; direction: McDirection; optionIds: number[] }
  | { kind: 'vocab_type'; lemmaId: number }
  | { kind: 'grammar'; questionId: number };

export interface PlanWord {
  lemmaId: number;
  pos: string;
}

/** Deterministic PRNG (mulberry32) so a lesson replays identically per seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed from a string (lesson slug). */
export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 3 distractors + the word itself, same-POS preferred, shuffled. */
function mcOptions(
  word: PlanWord,
  pool: PlanWord[],
  rng: () => number
): number[] {
  const others = pool.filter((w) => w.lemmaId !== word.lemmaId);
  const samePos = others.filter((w) => w.pos === word.pos);
  const rest = others.filter((w) => w.pos !== word.pos);
  const picked = [...shuffle(samePos, rng), ...shuffle(rest, rng)]
    .slice(0, 3)
    .map((w) => w.lemmaId);
  return shuffle([word.lemmaId, ...picked], rng);
}

/**
 * Full lesson: chunks of 2–3 words get introduced then immediately
 * recognized; afterwards every word is produced once more (typed recall or
 * reversed MC), in shuffled order, with grammar questions interleaved into
 * the back two-thirds. Invariant: the same word never appears in two
 * consecutive exercises.
 */
export function buildLessonPlan(
  words: PlanWord[],
  distractors: PlanWord[],
  grammarQuestionIds: number[],
  seed: number
): PathExercise[] {
  const rng = seededRng(seed);
  const optionPool = [...words, ...distractors];
  const canMc = optionPool.length >= 4;

  // Phase 1 — teach: intro chunk, then recognize the same chunk in order.
  // Chunks of 2 keep the "just learned it" gap small; a lone trailing word
  // is folded into the previous chunk (size 3) so nothing sits adjacent.
  const phase1: PathExercise[] = [];
  const chunks: PlanWord[][] = [];
  for (let i = 0; i < words.length; i += 2) chunks.push(words.slice(i, i + 2));
  if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) {
    const lone = chunks.pop()!;
    chunks[chunks.length - 1].push(...lone);
  }
  for (const chunk of chunks) {
    for (const w of chunk) phase1.push({ kind: 'intro', lemmaId: w.lemmaId });
    for (const w of chunk) {
      phase1.push(
        canMc
          ? { kind: 'vocab_mc', lemmaId: w.lemmaId, direction: 'de_en', optionIds: mcOptions(w, optionPool, rng) }
          : { kind: 'vocab_type', lemmaId: w.lemmaId }
      );
    }
  }

  // Phase 2 — produce: each word once more, shuffled; never starting with
  // the word phase 1 just ended on.
  let order = shuffle(words, rng);
  const lastP1 = words[words.length - 1]?.lemmaId;
  if (order.length > 1 && order[0].lemmaId === lastP1) {
    order = [...order.slice(1), order[0]];
  }
  const phase2: PathExercise[] = order.map((w, i) =>
    i % 2 === 0 || !canMc
      ? { kind: 'vocab_type', lemmaId: w.lemmaId }
      : { kind: 'vocab_mc', lemmaId: w.lemmaId, direction: 'en_de', optionIds: mcOptions(w, optionPool, rng) }
  );

  // Grammar — spread through the back two-thirds of the combined session.
  const combined = [...phase1, ...phase2];
  if (grammarQuestionIds.length > 0) {
    const start = Math.floor(combined.length / 3);
    const span = combined.length - start;
    grammarQuestionIds.forEach((questionId, i) => {
      const at = start + Math.floor(((i + 1) * span) / (grammarQuestionIds.length + 1)) + i;
      combined.splice(Math.min(at, combined.length), 0, { kind: 'grammar', questionId });
    });
  }
  return combined;
}

/**
 * Review node: no intros — due vocabulary first (then the freshest cards to
 * fill up to `cap`), one production exercise each, grammar questions from
 * due topics interleaved. Alternates typed recall and reversed MC.
 */
export function buildReviewPlan(
  dueWords: PlanWord[],
  fillWords: PlanWord[],
  grammarQuestionIds: number[],
  cap: number,
  seed: number
): PathExercise[] {
  const rng = seededRng(seed);
  const selected = [...dueWords, ...fillWords.filter((w) => !dueWords.some((d) => d.lemmaId === w.lemmaId))].slice(
    0,
    Math.max(0, cap)
  );
  const poolById = new Map<number, PlanWord>();
  for (const w of [...selected, ...fillWords, ...dueWords]) poolById.set(w.lemmaId, w);
  const optionPool = [...poolById.values()];
  const canMc = optionPool.length >= 4;

  const vocab: PathExercise[] = shuffle(selected, rng).map((w, i) =>
    i % 2 === 0 && canMc
      ? {
          kind: 'vocab_mc',
          lemmaId: w.lemmaId,
          direction: i % 4 === 0 ? 'de_en' : 'en_de',
          optionIds: mcOptions(w, optionPool, rng),
        }
      : { kind: 'vocab_type', lemmaId: w.lemmaId }
  );

  const combined: PathExercise[] = [...vocab];
  grammarQuestionIds.forEach((questionId, i) => {
    const at = Math.floor(((i + 1) * vocab.length) / (grammarQuestionIds.length + 1)) + i;
    combined.splice(Math.min(at, combined.length), 0, { kind: 'grammar', questionId });
  });
  return combined;
}
