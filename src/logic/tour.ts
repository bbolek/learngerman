/**
 * First-run interactive tour — pure step machine. No RN imports; the
 * runtime store (src/tour/tourStore.ts) feeds events in and renders the
 * overlay from the returned indices.
 *
 * Step copy lives in the translation catalogs under `tour.<id>.title` and
 * `tour.<id>.body`, so the guide speaks whatever language the UI is set to.
 * Each translation teaches the German words the app itself uses (Lernpfad,
 * Wörterbuch, …) alongside the localized labels.
 */

export type TourActionName = 'dict-results' | 'tts-played' | 'word-saved';

export type TourEvent =
  | { type: 'route'; pathname: string }
  | { type: 'action'; name: TourActionName }
  | { type: 'next' };

export type TourAdvance =
  | { kind: 'next' }
  | { kind: 'route'; pathname: string }
  | { kind: 'action'; name: TourActionName };

export interface TourStepDef {
  /** Also the catalog key stem: `tour.<id>.title` / `tour.<id>.body`. */
  id: string;
  /** Key registered via useTourTarget; the overlay spotlights its rect. */
  targetId: string;
  /** Pathname (prefix) this step lives on — leaving it means "off route". */
  route: string;
  advance: TourAdvance;
  /** Step id to resume at after wandering off route (default: this step). */
  resumeTo?: string;
}

/** Action steps keep the spotlight hole open so the user really does it. */
export function isActionStep(step: TourStepDef): boolean {
  return step.advance.kind !== 'next';
}

/** `/word` matches `/word/12`; `/` only matches `/` exactly. */
export function matchesRoute(route: string, pathname: string): boolean {
  if (route === '/') return pathname === '/' || pathname === '/index';
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isOffRoute(step: TourStepDef, pathname: string): boolean {
  return !matchesRoute(step.route, pathname);
}

/**
 * Next step index if `event` advances step `index`, else null.
 * An index of `steps.length` means the tour is finished.
 */
export function nextIndexForEvent(
  steps: TourStepDef[],
  index: number,
  event: TourEvent
): number | null {
  const step = steps[index];
  if (!step) return null;
  const a = step.advance;
  switch (event.type) {
    case 'next':
      return a.kind === 'next' ? index + 1 : null;
    case 'route':
      return a.kind === 'route' && matchesRoute(a.pathname, event.pathname) ? index + 1 : null;
    case 'action':
      return a.kind === 'action' && a.name === event.name ? index + 1 : null;
  }
}

/** Where to restart after the user wandered off route during step `index`. */
export function resumeIndexFor(steps: TourStepDef[], index: number): number {
  const step = steps[index];
  if (!step?.resumeTo) return index;
  const target = steps.findIndex((s) => s.id === step.resumeTo);
  return target >= 0 ? target : index;
}

/** Destinations that need a dynamic segment (a word id) — skipping can't
 * navigate there on the user's behalf. */
const DYNAMIC_ROUTES = new Set(['/word']);

export type SkipAdvance =
  | { kind: 'navigate'; pathname: string }
  | { kind: 'jump'; index: number };

/**
 * What "Next" does on an action step when the user skips the interaction
 * instead of performing it. Route steps complete themselves by navigating
 * (the route event then advances the tour exactly as a real tap would);
 * everything else jumps to the next step reachable from the current screen —
 * which skips e.g. the whole word-detail block when no entry is open.
 * A jump index of `steps.length` means "finish the tour".
 */
export function skipAdvanceFor(
  steps: TourStepDef[],
  index: number,
  pathname: string
): SkipAdvance {
  const a = steps[index]?.advance;
  if (a?.kind === 'route' && !DYNAMIC_ROUTES.has(a.pathname)) {
    return { kind: 'navigate', pathname: a.pathname };
  }
  for (let i = index + 1; i < steps.length; i++) {
    if (matchesRoute(steps[i].route, pathname)) return { kind: 'jump', index: i };
  }
  return { kind: 'jump', index: steps.length };
}

/**
 * The word-detail steps resume at the dictionary search: the specific
 * entry the user had open is gone once they navigate away.
 */
export const TOUR_STEPS: TourStepDef[] = [
  { id: 'home-streak', targetId: 'home-streak', route: '/', advance: { kind: 'next' } },
  { id: 'home-daily', targetId: 'home-daily', route: '/', advance: { kind: 'next' } },
  { id: 'home-grammar', targetId: 'home-grammar', route: '/', advance: { kind: 'next' } },
  { id: 'home-wotd', targetId: 'home-wotd', route: '/', advance: { kind: 'next' } },
  { id: 'tab-path', targetId: 'tab-path', route: '/', advance: { kind: 'route', pathname: '/path' } },
  { id: 'path-map', targetId: 'path-map', route: '/path', advance: { kind: 'next' } },
  {
    id: 'tab-dictionary',
    targetId: 'tab-dictionary',
    route: '/path',
    advance: { kind: 'route', pathname: '/dictionary' },
  },
  {
    id: 'dict-search',
    targetId: 'dict-search',
    route: '/dictionary',
    advance: { kind: 'action', name: 'dict-results' },
  },
  {
    id: 'dict-first-result',
    targetId: 'dict-first-result',
    route: '/dictionary',
    advance: { kind: 'route', pathname: '/word' },
  },
  {
    id: 'word-entry',
    targetId: 'word-entry',
    route: '/word',
    advance: { kind: 'next' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-tts',
    targetId: 'word-tts',
    route: '/word',
    advance: { kind: 'action', name: 'tts-played' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-save',
    targetId: 'word-save',
    route: '/word',
    advance: { kind: 'action', name: 'word-saved' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-back',
    targetId: 'word-back',
    route: '/word',
    advance: { kind: 'route', pathname: '/dictionary' },
    resumeTo: 'dict-search',
  },
  {
    id: 'dict-saved',
    targetId: 'dict-saved',
    route: '/dictionary',
    advance: { kind: 'route', pathname: '/words' },
  },
  { id: 'words-first-row', targetId: 'words-first-row', route: '/words', advance: { kind: 'next' } },
  {
    id: 'words-back',
    targetId: 'words-back',
    route: '/words',
    advance: { kind: 'route', pathname: '/dictionary' },
  },
  {
    id: 'tab-practice',
    targetId: 'tab-practice',
    route: '/dictionary',
    advance: { kind: 'route', pathname: '/practice' },
  },
  { id: 'practice-cards', targetId: 'practice-cards', route: '/practice', advance: { kind: 'next' } },
  {
    id: 'tab-games',
    targetId: 'tab-games',
    route: '/practice',
    advance: { kind: 'route', pathname: '/games' },
  },
  { id: 'games-grid', targetId: 'games-grid', route: '/games', advance: { kind: 'next' } },
  { id: 'tab-home', targetId: 'tab-home', route: '/games', advance: { kind: 'route', pathname: '/' } },
  {
    id: 'home-header-icons',
    targetId: 'home-header-icons',
    route: '/',
    advance: { kind: 'next' },
  },
];
