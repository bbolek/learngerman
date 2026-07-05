/**
 * Pure logic for the arcade games (Spiele tab): round building and scoring.
 * No RN imports, no Date.now() — seeds and elapsed time are injected by the
 * screens so everything here is deterministic and unit-testable.
 */

import { shuffled } from '@/logic/graders';

export type GameKey = 'wortblitz' | 'bilderraetsel' | 'derdiedas' | 'wortpaare';

export interface GameInfo {
  key: GameKey;
  emoji: string;
  title: string;
  tagline: string;
  rules: string;
}

export const GAMES: GameInfo[] = [
  {
    key: 'wortblitz',
    emoji: '⚡',
    title: 'Wort-Blitz',
    tagline: 'Wie viele Wörter schaffst du in 60 Sekunden?',
    rules:
      'Wähle die richtige Übersetzung — so schnell du kannst. Jede richtige Antwort bringt 10 Punkte, eine Serie bringt Bonuspunkte. Ein Fehler bricht die Serie.',
  },
  {
    key: 'bilderraetsel',
    emoji: '🖼️',
    title: 'Bilderrätsel',
    tagline: 'Erkennst du das Bild? Sag es auf Deutsch!',
    rules:
      'Wähle das deutsche Wort, das zum Bild passt — mit dem richtigen Artikel. 60 Sekunden, Serienbonus inklusive. Ein Fehler bricht die Serie.',
  },
  {
    key: 'derdiedas',
    emoji: '🎯',
    title: 'Der, die oder das?',
    tagline: 'Errate den Artikel — mit nur drei Leben.',
    rules:
      'Tippe den richtigen Artikel für jedes Nomen. Richtige Antworten bringen Punkte und verlängern deine Serie. Drei Fehler — und die Runde ist vorbei.',
  },
  {
    key: 'wortpaare',
    emoji: '🧩',
    title: 'Wortpaare',
    tagline: 'Finde die Paare — schnell und fehlerfrei.',
    rules:
      'Verbinde jedes deutsche Wort mit seiner Übersetzung. Drei Runden mit je sechs Paaren: je schneller und fehlerfreier, desto mehr Punkte.',
  },
];

export function gameInfo(key: GameKey): GameInfo {
  return GAMES.find((g) => g.key === key)!;
}

/** A word pulled from the dictionary for game rounds. */
export interface GameWord {
  id: number;
  lemma: string;
  gender: string | null;
  plural: string | null;
  gloss: string;
}

/** First gloss segment ("man; husband" → "man") — keeps game options compact. */
export function shortGloss(en: string): string {
  return en.split(';')[0].trim();
}

/** Drop words whose short gloss collides with an earlier one (ambiguous pairs/options). */
export function dedupeByGloss(words: GameWord[]): GameWord[] {
  const seen = new Set<string>();
  const out: GameWord[] = [];
  for (const w of words) {
    const key = shortGloss(w.gloss).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

// ---------- arcade scoring (Wort-Blitz & Der-die-das) ----------

export const BASE_POINTS = 10;
export const STREAK_BONUS_STEP = 2;
export const STREAK_BONUS_CAP = 5;
export const WORTBLITZ_MS = 60_000;
export const DERDIEDAS_LIVES = 3;

export interface ArcadeState {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  total: number;
  lives: number;
}

export function initialArcade(lives: number): ArcadeState {
  return { score: 0, streak: 0, bestStreak: 0, correct: 0, total: 0, lives };
}

/** Bonus for the answer that extends a run of `streak` prior correct answers. */
export function streakBonus(streak: number): number {
  return STREAK_BONUS_STEP * Math.min(Math.max(streak, 0), STREAK_BONUS_CAP);
}

export function applyArcadeAnswer(s: ArcadeState, correct: boolean): ArcadeState {
  if (correct) {
    const streak = s.streak + 1;
    return {
      ...s,
      score: s.score + BASE_POINTS + streakBonus(s.streak),
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      correct: s.correct + 1,
      total: s.total + 1,
    };
  }
  return { ...s, streak: 0, total: s.total + 1, lives: s.lives - 1 };
}

// ---------- multiple-choice rounds (Wort-Blitz & Bilderrätsel) ----------

export const BLITZ_OPTIONS = 4;

export interface ChoiceQuestion<W extends GameWord = GameWord> {
  word: W;
  options: string[];
  correctIndex: number;
}

export type BlitzQuestion = ChoiceQuestion;

/**
 * One question per word: its label plus three distractor labels from other
 * pool words. Deterministic for a given (pool, seed).
 */
function buildChoiceQuestions<W extends GameWord>(
  words: W[],
  seed: number,
  label: (w: W) => string
): ChoiceQuestion<W>[] {
  if (words.length < BLITZ_OPTIONS) return [];
  return words.map((word, i) => {
    const others = shuffled(
      words.filter((w) => w.id !== word.id),
      seed * 31 + i + 1
    );
    const distractors = others.slice(0, BLITZ_OPTIONS - 1).map(label);
    const options = shuffled([label(word), ...distractors], seed + i * 7 + 3);
    return { word, options, correctIndex: options.indexOf(label(word)) };
  });
}

/** German word → pick the English gloss. */
export function buildBlitzQuestions(pool: GameWord[], seed: number): BlitzQuestion[] {
  return buildChoiceQuestions(dedupeByGloss(pool), seed, (w) => shortGloss(w.gloss));
}

// ---------- Bilderrätsel rounds ----------

/** A game word that ships with a bundled emoji SVG. */
export interface ImageWord extends GameWord {
  svg: string;
}

export function articleFor(gender: string | null): string | null {
  if (gender === 'm') return 'der';
  if (gender === 'f') return 'die';
  if (gender === 'n') return 'das';
  if (gender === 'pl') return 'die';
  return null;
}

/** "das Haus" for nouns, bare lemma otherwise. */
export function withArticle(w: { lemma: string; gender: string | null }): string {
  const article = articleFor(w.gender);
  return article ? `${article} ${w.lemma}` : w.lemma;
}

/** Picture → pick the German noun (with article). */
export function buildImageQuestions(pool: ImageWord[], seed: number): ChoiceQuestion<ImageWord>[] {
  const seen = new Set<string>();
  const words = pool.filter((w) => {
    const key = w.lemma.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return buildChoiceQuestions(words, seed, withArticle);
}

// ---------- Wortpaare rounds ----------

export const PAIRS_PER_BOARD = 6;
export const PAIRS_BOARDS = 3;
export const PAIRS_BASE_POINTS = 20;
export const PAIRS_MISTAKE_PENALTY = 5;

export interface PairTile {
  pairId: number;
  text: string;
}

export interface PairsBoard {
  /** German tiles (lemmas), shuffled. */
  de: PairTile[];
  /** English tiles (short glosses), shuffled independently. */
  en: PairTile[];
}

/** Chunk deduped words into up to PAIRS_BOARDS boards of PAIRS_PER_BOARD pairs. */
export function buildPairsBoards(pool: GameWord[], seed: number): PairsBoard[] {
  const words = shuffled(dedupeByGloss(pool), seed);
  const boards: PairsBoard[] = [];
  for (let b = 0; b < PAIRS_BOARDS; b++) {
    const chunk = words.slice(b * PAIRS_PER_BOARD, (b + 1) * PAIRS_PER_BOARD);
    if (chunk.length < PAIRS_PER_BOARD) break;
    boards.push({
      de: shuffled(
        chunk.map((w) => ({ pairId: w.id, text: w.lemma })),
        seed * 13 + b + 1
      ),
      en: shuffled(
        chunk.map((w) => ({ pairId: w.id, text: shortGloss(w.gloss) })),
        seed * 17 + b + 2
      ),
    });
  }
  return boards;
}

/**
 * Board score: 20 points per pair, −5 per mismatch, plus a speed bonus of up
 * to 30 (full bonus under 15s, gone after 45s). Never below 5 per pair.
 */
export function pairsBoardScore(pairCount: number, mistakes: number, elapsedMs: number): number {
  const seconds = elapsedMs / 1000;
  const timeBonus = Math.min(30, Math.max(0, Math.round(45 - seconds)));
  const raw = pairCount * PAIRS_BASE_POINTS - mistakes * PAIRS_MISTAKE_PENALTY + timeBonus;
  return Math.max(pairCount * 5, raw);
}
