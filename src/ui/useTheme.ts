import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { palettes, type Palette, type ThemeName } from '@/ui/theme';

export function useThemeName(): ThemeName {
  const system = useColorScheme();
  const pref = useSettings((s) => s.themePreference);
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

export function useTheme(): Palette {
  return palettes[useThemeName()];
}
