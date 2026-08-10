/**
 * Home feed assembly — which hero action leads the screen and what the
 * "Weiter lernen" shelf offers. Pure rules, no RN imports, no clocks
 * (dayKey is injected); inputs are structural so repo rows and test
 * fixtures both fit.
 */

import type { GameKey } from '@/logic/games';
import { dayHash } from '@/logic/nextTopic';
import type { PathResume } from '@/logic/pathResume';

export type HeroAction =
  | { kind: 'review'; due: number; fresh: number }
  | { kind: 'path'; node: PathResume }
  | { kind: 'discover' };

/**
 * The single most important next step: due flashcards beat everything
 * (spaced repetition decays), then the Lernpfad, then open exploration.
 */
export function pickHeroAction(
  due: number,
  fresh: number,
  pathNext: PathResume | null
): HeroAction {
  if (due + fresh > 0) return { kind: 'review', due, fresh };
  if (pathNext) return { kind: 'path', node: pathNext };
  return { kind: 'discover' };
}

/** Shape-compatible with readingRepo's ReadingTextRow. */
export interface ReadingRowLike {
  slug: string;
  title: string;
  level: string;
  word_count: number;
  completed_at: string | null;
}

export type ResumeItem =
  | { kind: 'path'; node: PathResume }
  | { kind: 'review'; count: number }
  | { kind: 'reading'; slug: string; title: string; level: string; wordCount: number }
  | { kind: 'game'; key: GameKey; best: number };

/**
 * "Weiter lernen" shelf, stable order, deduped against the hero — whatever
 * the hero already offers never repeats one card below it.
 */
export function buildResumeShelf(input: {
  hero: HeroAction;
  due: number;
  fresh: number;
  pathNext: PathResume | null;
  nextReading: ReadingRowLike | null;
  lastGame: { key: GameKey; best: number } | null;
}): ResumeItem[] {
  const { hero, due, fresh, pathNext, nextReading, lastGame } = input;
  const items: ResumeItem[] = [];
  if (hero.kind !== 'path' && pathNext) items.push({ kind: 'path', node: pathNext });
  if (hero.kind !== 'review' && due + fresh > 0) items.push({ kind: 'review', count: due + fresh });
  if (nextReading) {
    items.push({
      kind: 'reading',
      slug: nextReading.slug,
      title: nextReading.title,
      level: nextReading.level,
      wordCount: nextReading.word_count,
    });
  }
  if (lastGame) items.push({ kind: 'game', key: lastGame.key, best: lastGame.best });
  return items;
}

/** First unread text in the repo's easiest-first order, or null when all read. */
export function nextUnreadText<T extends { completed_at: string | null }>(texts: T[]): T | null {
  return texts.find((t) => t.completed_at == null) ?? null;
}

/** The most recently played game and its record, or null before any round. */
export function lastPlayedGame(
  stats: Map<GameKey, { best: number; lastPlayed: string | null }>
): { key: GameKey; best: number } | null {
  let latest: { key: GameKey; best: number; playedAt: string } | null = null;
  for (const [key, s] of stats) {
    if (s.lastPlayed == null) continue;
    if (!latest || s.lastPlayed > latest.playedAt) {
      latest = { key, best: s.best, playedAt: s.lastPlayed };
    }
  }
  return latest ? { key: latest.key, best: latest.best } : null;
}

/** Daily-rotating suggestion, stable within a day (same hash as pickNextTopic). */
export function pickDailyTheme<T>(themes: T[], dayKey: string): T | null {
  if (themes.length === 0) return null;
  return themes[dayHash(dayKey) % themes.length];
}
