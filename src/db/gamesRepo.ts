import { getDb } from '@/db/client';
import { type GameKey, type GameWord, type ImageWord } from '@/logic/games';

// ---------- word pools ----------

const WORD_SELECT = `
  SELECT l.id, l.lemma, l.gender, l.plural, s.en AS gloss
  FROM lemmas l JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1`;

/** Random words with a first-sense gloss (any part of speech). */
export async function fetchGameWords(limit: number): Promise<GameWord[]> {
  return getDb().getAllAsync<GameWord>(`${WORD_SELECT} ORDER BY RANDOM() LIMIT ?`, [limit]);
}

/** Random nouns with a der/die/das article (pl-only nouns excluded). */
export async function fetchGenderNouns(limit: number): Promise<GameWord[]> {
  return getDb().getAllAsync<GameWord>(
    `${WORD_SELECT} WHERE l.pos = 'noun' AND l.gender IN ('m', 'f', 'n')
     ORDER BY RANDOM() LIMIT ?`,
    [limit]
  );
}

/**
 * Random words with a bundled emoji image (Bilderrätsel). Guarded like
 * getLemmaImage: lemma_images only exists from content version 4 on, so
 * degrade to an empty pool instead of crashing on an older content schema.
 */
export async function fetchImageWords(limit: number): Promise<ImageWord[]> {
  try {
    return await getDb().getAllAsync<ImageWord>(
      `SELECT l.id, l.lemma, l.gender, l.plural, s.en AS gloss, i.svg
       FROM lemma_images i
       JOIN lemmas l ON l.id = i.lemma_id
       JOIN senses s ON s.lemma_id = l.id AND s.sense_order = 1
       ORDER BY RANDOM() LIMIT ?`,
      [limit]
    );
  } catch {
    return [];
  }
}

// ---------- results & stats ----------

export interface GameResultInput {
  gameKey: GameKey;
  score: number;
  correct: number;
  total: number;
  bestStreak: number;
  durationMs: number;
}

export interface RecordOutcome {
  /** True when this run beat every previous score for the game. */
  newRecord: boolean;
  previousBest: number;
}

/** Persist a finished round, bump daily activity (feeds the streak). */
export async function recordGameResult(r: GameResultInput, now: Date): Promise<RecordOutcome> {
  const db = getDb();
  const prev = await db.getFirstAsync<{ best: number | null }>(
    'SELECT MAX(score) AS best FROM game_results WHERE game_key = ?',
    [r.gameKey]
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO game_results (game_key, score, correct, total, best_streak, duration_ms, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.gameKey, r.score, r.correct, r.total, r.bestStreak, r.durationMs, now.toISOString()]
    );
    await db.runAsync(
      `INSERT INTO daily_activity (day, games_played) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET games_played = games_played + 1`,
      [now.toISOString().slice(0, 10)]
    );
  });
  const previousBest = prev?.best ?? 0;
  return { newRecord: r.score > previousBest, previousBest };
}

export interface GameStats {
  plays: number;
  best: number;
  totalScore: number;
  bestStreak: number;
  lastPlayed: string | null;
}

/** Aggregated stats per game (games never played are absent from the map). */
export async function statsByGame(): Promise<Map<GameKey, GameStats>> {
  const rows = await getDb().getAllAsync<{
    game_key: GameKey;
    plays: number;
    best: number;
    total_score: number;
    best_streak: number;
    last_played: string | null;
  }>(
    `SELECT game_key, COUNT(*) AS plays, MAX(score) AS best, SUM(score) AS total_score,
            MAX(best_streak) AS best_streak, MAX(played_at) AS last_played
     FROM game_results GROUP BY game_key`
  );
  return new Map(
    rows.map((r) => [
      r.game_key,
      {
        plays: r.plays,
        best: r.best,
        totalScore: r.total_score,
        bestStreak: r.best_streak,
        lastPlayed: r.last_played,
      },
    ])
  );
}

export interface TopResult {
  score: number;
  correct: number;
  total: number;
  played_at: string;
}

/** Best runs for one game, highest score first. */
export async function topResults(gameKey: GameKey, limit: number): Promise<TopResult[]> {
  return getDb().getAllAsync<TopResult>(
    `SELECT score, correct, total, played_at FROM game_results
     WHERE game_key = ? ORDER BY score DESC, played_at DESC LIMIT ?`,
    [gameKey, limit]
  );
}
