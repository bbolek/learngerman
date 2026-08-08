import { create } from 'zustand';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Beginner-to-intermediate shown by default; B2/C1/C2 opt-in. */
const DEFAULT_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1'];

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
  toggle: (level: CefrLevel) => void;
  setWordType: (type: WordType) => void;
}

export const useThemeFilter = create<ThemeFilterState>((set) => ({
  levels: DEFAULT_LEVELS,
  wordType: 'all',
  setWordType: (wordType) => set({ wordType }),
  toggle: (level) =>
    set((s) => {
      const next = s.levels.includes(level)
        ? s.levels.filter((l) => l !== level)
        : [...s.levels, level];
      // Never leave the filter empty — fall back to the defaults.
      return { levels: next.length === 0 ? DEFAULT_LEVELS : next };
    }),
}));
