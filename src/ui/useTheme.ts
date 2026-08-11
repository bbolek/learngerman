import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { resolvePalette, type Palette, type ThemeName } from '@/ui/theme';

export function useThemeName(): ThemeName {
  const system = useColorScheme();
  const pref = useSettings((s) => s.themePreference);
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

export function useTheme(): Palette {
  const name = useThemeName();
  const color = useSettings((s) => s.colorTheme);
  return useMemo(() => resolvePalette(name, color), [name, color]);
}
