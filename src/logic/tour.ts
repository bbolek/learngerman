/**
 * First-run interactive tour — pure step machine. No RN imports; the
 * runtime store (src/tour/tourStore.ts) feeds events in and renders the
 * overlay from the returned indices. All tour copy lives here.
 *
 * The tour is intentionally in ENGLISH (the rest of the app is German):
 * first-time users may not know German yet, so the guide teaches the
 * German labels as it goes.
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
  id: string;
  /** Key registered via useTourTarget; the overlay spotlights its rect. */
  targetId: string;
  /** Pathname (prefix) this step lives on — leaving it means "off route". */
  route: string;
  title: string;
  body: string;
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

/**
 * The word-detail steps resume at the dictionary search: the specific
 * entry the user had open is gone once they navigate away.
 */
export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'home-streak',
    targetId: 'home-streak',
    route: '/',
    title: 'Your streak',
    body:
      'Every day you practice keeps the flame alive. The dots show your last 7 days — try not to break the chain!',
    advance: { kind: 'next' },
  },
  {
    id: 'home-daily',
    targetId: 'home-daily',
    route: '/',
    title: 'Today’s cards',
    body:
      '“Heute fällig” means due today. Words you save become flashcards, and this card counts the ones ready for review. The ring fills as you finish them.',
    advance: { kind: 'next' },
  },
  {
    id: 'home-grammar',
    targetId: 'home-grammar',
    route: '/',
    title: 'Grammar topic of the day',
    body:
      'Deutschly recommends one grammar topic each day — new ones at first, later the ones you find hardest.',
    advance: { kind: 'next' },
  },
  {
    id: 'home-wotd',
    targetId: 'home-wotd',
    route: '/',
    title: 'Word of the day',
    body:
      'A fresh German word every day, with an example sentence. Tap it any time to see the full entry.',
    advance: { kind: 'next' },
  },
  {
    id: 'tab-dictionary',
    targetId: 'tab-dictionary',
    route: '/',
    title: 'The dictionary',
    body:
      '“Wörterbuch” is your dictionary — the entire Goethe A1/A2 vocabulary, fully offline. Tap it to open.',
    advance: { kind: 'route', pathname: '/dictionary' },
  },
  {
    id: 'dict-search',
    targetId: 'dict-search',
    route: '/dictionary',
    title: 'Look something up',
    body:
      'Try it: type “Haus” (house). Any German form works — even “gemacht” — and English words too.',
    advance: { kind: 'action', name: 'dict-results' },
  },
  {
    id: 'dict-first-result',
    targetId: 'dict-first-result',
    route: '/dictionary',
    title: 'Open the entry',
    body:
      'There it is! Tap the word to see its full entry. (The speaker icon pronounces it right from the list.)',
    advance: { kind: 'route', pathname: '/word' },
  },
  {
    id: 'word-entry',
    targetId: 'word-entry',
    route: '/word',
    title: 'Everything about a word',
    body:
      'Article, plural, level and meaning at a glance — with example sentences and full conjugation or case tables further down.',
    advance: { kind: 'next' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-tts',
    targetId: 'word-tts',
    route: '/word',
    title: 'Hear it spoken',
    body:
      'Tap the speaker to hear the word. Nouns are read with their article, so “das Haus” sticks together in your memory.',
    advance: { kind: 'action', name: 'tts-played' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-save',
    targetId: 'word-save',
    route: '/word',
    title: 'Save it to learn it',
    body:
      'Tap the heart to save this word. Saved words become flashcards and join your daily review queue.',
    advance: { kind: 'action', name: 'word-saved' },
    resumeTo: 'dict-search',
  },
  {
    id: 'word-back',
    targetId: 'word-back',
    route: '/word',
    title: 'Your first saved word!',
    body: 'Nice — it’s in your collection now. Tap “Zurück” to head back.',
    advance: { kind: 'route', pathname: '/dictionary' },
    resumeTo: 'dict-search',
  },
  {
    id: 'tab-words',
    targetId: 'tab-words',
    route: '/dictionary',
    title: 'Your word list',
    body: '“Wörter” holds every word you’ve saved. Tap it — your new word is already waiting there.',
    advance: { kind: 'route', pathname: '/words' },
  },
  {
    id: 'words-first-row',
    targetId: 'words-first-row',
    route: '/words',
    title: 'Your learning queue',
    body:
      'Each saved word shows its status — new, learning, or due for review. Tap the speaker to hear it; the trash icon removes it.',
    advance: { kind: 'next' },
  },
  {
    id: 'tab-practice',
    targetId: 'tab-practice',
    route: '/words',
    title: 'Time to practice',
    body: '“Üben” means practice — this is where the real learning happens. Tap it.',
    advance: { kind: 'route', pathname: '/practice' },
  },
  {
    id: 'practice-cards',
    targetId: 'practice-cards',
    route: '/practice',
    title: 'Flashcards & grammar',
    body:
      '“Karteikarten” quizzes your saved words with spaced repetition — rate yourself and Deutschly schedules the perfect next review. Below: grammar quizzes for every A1–B1 topic, with explanations.',
    advance: { kind: 'next' },
  },
  {
    id: 'tab-games',
    targetId: 'tab-games',
    route: '/practice',
    title: 'And for fun…',
    body: 'Tap “Spiele” for quick word games.',
    advance: { kind: 'route', pathname: '/games' },
  },
  {
    id: 'games-grid',
    targetId: 'games-grid',
    route: '/games',
    title: 'Play to remember',
    body:
      'Four quick games — Wort-Blitz, Bilderrätsel, Der-die-das and Wortpaare. They all count toward your streak.',
    advance: { kind: 'next' },
  },
  {
    id: 'tab-home',
    targetId: 'tab-home',
    route: '/games',
    title: 'Back to Start',
    body: 'One last thing — tap the home tab.',
    advance: { kind: 'route', pathname: '/' },
  },
  {
    id: 'home-header-icons',
    targetId: 'home-header-icons',
    route: '/',
    title: 'Progress & settings',
    body:
      'The chart icon opens your statistics — streak history, activity and accuracy. The gear holds settings: dark mode, daily limits, reminders… and this guide, any time you want a refresher.',
    advance: { kind: 'next' },
  },
];
