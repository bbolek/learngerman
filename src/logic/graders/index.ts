/**
 * Pure graders for the four grammar question types. Payload shapes are
 * validated at build time by scripts/build-dictionary.ts.
 */

// ---------- payload types ----------

export interface McPayload {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface FillPayload {
  prompt: string;
  accept: string[];
  hint?: string;
  explanation: string;
}

export interface OrderPayload {
  tokens: string[];
  solutions: string[][];
  translation?: string;
  explanation: string;
}

export interface CaseIdPayload {
  sentence: string;
  correctCase: 'nominativ' | 'akkusativ' | 'dativ' | 'genitiv';
  reasons: string[];
  correctReasonIndex: number;
  explanation: string;
}

export type QuestionPayload = McPayload | FillPayload | OrderPayload | CaseIdPayload;

// ---------- graders ----------

export function gradeMultipleChoice(payload: McPayload, selectedIndex: number): boolean {
  return selectedIndex === payload.correctIndex;
}

export interface FillResult {
  correct: boolean;
  /** Right word, wrong umlaut spelling ("grosse" for "große"). */
  nearMiss: boolean;
  expected: string;
}

function foldUmlauts(s: string): string {
  return s
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss');
}

function cleanAnswer(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeFillBlank(payload: FillPayload, answer: string): FillResult {
  const given = cleanAnswer(answer);
  const expected = payload.accept[0];
  for (const acc of payload.accept) {
    if (cleanAnswer(acc) === given) return { correct: true, nearMiss: false, expected };
  }
  for (const acc of payload.accept) {
    if (foldUmlauts(cleanAnswer(acc)) === foldUmlauts(given))
      return { correct: true, nearMiss: true, expected };
  }
  return { correct: false, nearMiss: false, expected };
}

export function gradeOrdering(payload: OrderPayload, sequence: string[]): boolean {
  return payload.solutions.some(
    (sol) => sol.length === sequence.length && sol.every((tok, i) => tok === sequence[i])
  );
}

export interface CaseIdResult {
  caseCorrect: boolean;
  reasonCorrect: boolean;
  correct: boolean;
}

export function gradeCaseId(
  payload: CaseIdPayload,
  caseChoice: string,
  reasonIndex: number
): CaseIdResult {
  const caseCorrect = caseChoice === payload.correctCase;
  const reasonCorrect = reasonIndex === payload.correctReasonIndex;
  return { caseCorrect, reasonCorrect, correct: caseCorrect && reasonCorrect };
}

/** Split a case_id sentence on the **highlighted** phrase: [before, target, after]. */
export function splitHighlight(sentence: string): [string, string, string] {
  const match = /\*\*(.+?)\*\*/.exec(sentence);
  if (!match) return [sentence, '', ''];
  const start = match.index;
  return [sentence.slice(0, start), match[1], sentence.slice(start + match[0].length)];
}

/** Deterministic in-place-free shuffle for token pools (seeded by question id). */
export function shuffled<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
