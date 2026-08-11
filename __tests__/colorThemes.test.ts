import {
  colorThemeNames,
  colorThemes,
  DEFAULT_COLOR_THEME,
  palettes,
  resolvePalette,
} from '@/ui/theme';

const HEX = /^#[0-9A-F]{6}$/i;
const TOKEN_KEYS = [
  'primary',
  'primaryDim',
  'onPrimaryDim',
  'accent',
  'accentDim',
  'onAccentDim',
] as const;

describe('color themes', () => {
  it('every theme defines valid hex values for all six tokens in both modes', () => {
    for (const name of colorThemeNames) {
      for (const mode of ['light', 'dark'] as const) {
        for (const key of TOKEN_KEYS) {
          expect(colorThemes[name][mode][key]).toMatch(HEX);
        }
      }
    }
  });

  it('marigold (default) reproduces the base palette exactly', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(resolvePalette(mode, DEFAULT_COLOR_THEME)).toEqual(palettes[mode]);
    }
  });

  it('resolvePalette overrides only the six color tokens', () => {
    const base = palettes.light;
    const themed = resolvePalette('light', 'rose');
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      if ((TOKEN_KEYS as readonly string[]).includes(key)) continue;
      expect(themed[key]).toBe(base[key]);
    }
    expect(themed.primary).toBe(colorThemes.rose.light.primary);
  });

  it('falls back to the default theme for unknown or missing names', () => {
    expect(resolvePalette('dark', 'no-such-theme')).toEqual(palettes.dark);
    expect(resolvePalette('light', undefined)).toEqual(palettes.light);
  });
});
