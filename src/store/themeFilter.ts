import { create } from 'zustand';

import { CEFR_LEVELS, levelPool, type CefrLevel } from '@/logic/levels';

export { CEFR_LEVELS, type CefrLevel };

export const WORD_TYPES = [
  { key: 'all', label: 'Alle' },
  { key: 'noun', label: 'Nomen' },
  { key: 'verb', label: 'Verben' },
] as const;
export type WordType = (typeof WORD_TYPES)[number]['key'];

export const matchesWordType = (pos: string, type: WordType) => type === 'all' || pos === type;

interface ThemeFilterState {
  levels: CefrLevel[];
  wordType: WordType;
  /** The user tapped a chip — stop following the profile level. */
  touched: boolean;
  /** Last seeded Sprachniveau — the fallback when the filter would go empty. */
  seededLevel: CefrLevel;
  toggle: (level: CefrLevel) => void;
  setWordType: (type: WordType) => void;
}

export const useThemeFilter = create<ThemeFilterState>((set) => ({
  levels: levelPool('A1'),
  wordType: 'all',
  touched: false,
  seededLevel: 'A1',
  setWordType: (wordType) => set({ wordType }),
  toggle: (level) =>
    set((s) => {
      const next = s.levels.includes(level)
        ? s.levels.filter((l) => l !== level)
        : [...s.levels, level];
      // Never leave the filter empty — fall back to the profile level.
      return { levels: next.length === 0 ? levelPool(s.seededLevel) : next, touched: true };
    }),
}));

/**
 * Follow the user's Sprachniveau until they touch the filter themselves.
 * Called on settings hydration and whenever the level setting changes.
 */
export function seedThemeFilter(userLevel: CefrLevel) {
  const touched = useThemeFilter.getState().touched;
  useThemeFilter.setState(
    touched ? { seededLevel: userLevel } : { seededLevel: userLevel, levels: levelPool(userLevel) }
  );
}
