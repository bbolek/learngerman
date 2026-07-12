import { create } from 'zustand';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Beginner-to-intermediate shown by default; B2/C1 opt-in. */
const DEFAULT_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1'];

interface ThemeFilterState {
  levels: CefrLevel[];
  toggle: (level: CefrLevel) => void;
}

export const useThemeFilter = create<ThemeFilterState>((set) => ({
  levels: DEFAULT_LEVELS,
  toggle: (level) =>
    set((s) => {
      const next = s.levels.includes(level)
        ? s.levels.filter((l) => l !== level)
        : [...s.levels, level];
      // Never leave the filter empty — fall back to the defaults.
      return { levels: next.length === 0 ? DEFAULT_LEVELS : next };
    }),
}));
