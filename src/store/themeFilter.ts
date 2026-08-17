import { create } from 'zustand';

import { CEFR_LEVELS, levelsUpTo, type CefrLevel } from '@/logic/levels';

export { CEFR_LEVELS, type CefrLevel };

/** Labels live in the catalogs under `wordType.*`. */
export const WORD_TYPES = [
  { key: 'all', labelKey: 'wordType.all' },
  { key: 'noun', labelKey: 'wordType.noun' },
  { key: 'verb', labelKey: 'wordType.verb' },
] as const;
export type WordType = (typeof WORD_TYPES)[number]['key'];

export const matchesWordType = (pos: string, type: WordType) => type === 'all' || pos === type;

interface ThemeFilterState {
  levels: CefrLevel[];
  wordType: WordType;
  /** The user tapped a chip — stop following the profile level. */
  touched: boolean;
  toggle: (level: CefrLevel) => void;
  setWordType: (type: WordType) => void;
}

export const useThemeFilter = create<ThemeFilterState>((set) => ({
  levels: levelsUpTo('A1'),
  wordType: 'all',
  touched: false,
  setWordType: (wordType) => set({ wordType }),
  toggle: (level) =>
    set((s) => {
      const next = s.levels.includes(level)
        ? s.levels.filter((l) => l !== level)
        : [...s.levels, level];
      // Never leave the filter empty — fall back to everything up to A1.
      return { levels: next.length === 0 ? levelsUpTo('A1') : next, touched: true };
    }),
}));

/**
 * Follow the user's Sprachniveau until they touch the filter themselves.
 * Called on settings hydration and whenever the level setting changes.
 */
export function seedThemeFilter(userLevel: CefrLevel) {
  if (!useThemeFilter.getState().touched) {
    useThemeFilter.setState({ levels: levelsUpTo(userLevel) });
  }
}
