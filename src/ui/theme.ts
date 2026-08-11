/**
 * Deutschly design tokens — "paper & marigold".
 * Mirrors design/ previews; keep both in sync when tuning.
 */

const light = {
    bg: '#FBF7F0',
    surface: '#FFFFFF',
    primary: '#E8871E',
    primaryDim: '#FCE8D2',
    onPrimaryDim: '#B05F06',
    accent: '#2A9D8F',
    accentDim: '#D8EEEB',
    onAccentDim: '#1D7269',
    danger: '#E76F51',
    dangerDim: '#FBE3DC',
    onDangerDim: '#C0492B',
    success: '#7FA96B',
    successDim: '#E3EFDC',
    onSuccessDim: '#4C7639',
    ink: '#2B2118',
    inkMuted: '#8A7B6E',
    inkFaint: '#B5A99C',
    line: '#EFE7DB',
    caseChip: '#EDE6F4',
    onCaseChip: '#6B4C93',
    derChip: '#E4EBF4',
    onDerChip: '#4A6B99',
    dieChip: '#F4E4E7',
    onDieChip: '#A75560',
    dasChip: '#E9F1E3',
    onDasChip: '#5C8447',
  shadow: '#2B2118',
};

export type Palette = { [K in keyof typeof light]: string };
export type ThemeName = 'light' | 'dark';

export const palettes: Record<ThemeName, Palette> = {
  light,
  dark: {
    bg: '#1C1814',
    surface: '#26211B',
    primary: '#F49B3F',
    primaryDim: '#3A2C1B',
    onPrimaryDim: '#F8C98F',
    accent: '#43B3A5',
    accentDim: '#173B36',
    onAccentDim: '#9FDCD3',
    danger: '#F2836B',
    dangerDim: '#4A2A20',
    onDangerDim: '#F8B4A3',
    success: '#93BD7F',
    successDim: '#2A3A22',
    onSuccessDim: '#BCDCA6',
    ink: '#F2EAE0',
    inkMuted: '#A69684',
    inkFaint: '#7A6D5F',
    line: '#3A322A',
    caseChip: '#332B41',
    onCaseChip: '#C7B3E3',
    derChip: '#26303E',
    onDerChip: '#A3BEDE',
    dieChip: '#3E2A2E',
    onDieChip: '#E3AEB6',
    dasChip: '#2B3626',
    onDasChip: '#B4D0A3',
    shadow: '#000000',
  },
};

/**
 * Color themes — user-selectable primary/accent pairs layered over the base
 * palette (Einstellungen → Aussehen). Marigold is the classic default; the
 * rest are pastel pairings. Every theme overrides the same six tokens per
 * mode; everything else (ink, surfaces, semantic colors, chips) stays put.
 * Keys are persisted in user settings (and backups) — never rename existing
 * ones, only add.
 */
export type ColorTokens = Pick<
  Palette,
  'primary' | 'primaryDim' | 'onPrimaryDim' | 'accent' | 'accentDim' | 'onAccentDim'
>;

export type ColorThemeName =
  | 'marigold'
  | 'rose'
  | 'flieder'
  | 'blaubeere'
  | 'himmel'
  | 'petrol'
  | 'minze'
  | 'salbei'
  | 'pfirsich';

export const DEFAULT_COLOR_THEME: ColorThemeName = 'marigold';

const colorTokensOf = (p: Palette): ColorTokens => ({
  primary: p.primary,
  primaryDim: p.primaryDim,
  onPrimaryDim: p.onPrimaryDim,
  accent: p.accent,
  accentDim: p.accentDim,
  onAccentDim: p.onAccentDim,
});

export const colorThemes: Record<
  ColorThemeName,
  { label: string; light: ColorTokens; dark: ColorTokens }
> = {
  marigold: {
    label: 'Marigold',
    light: colorTokensOf(light),
    dark: colorTokensOf(palettes.dark),
  },
  rose: {
    label: 'Rosé',
    light: {
      primary: '#D96C8A',
      primaryDim: '#FAE3EA',
      onPrimaryDim: '#A83D5C',
      accent: '#2A9D8F',
      accentDim: '#D8EEEB',
      onAccentDim: '#1D7269',
    },
    dark: {
      primary: '#E68CA5',
      primaryDim: '#3F2530',
      onPrimaryDim: '#F4BFCE',
      accent: '#43B3A5',
      accentDim: '#173B36',
      onAccentDim: '#9FDCD3',
    },
  },
  flieder: {
    label: 'Flieder',
    light: {
      primary: '#9678C9',
      primaryDim: '#ECE5F7',
      onPrimaryDim: '#6A4A9E',
      accent: '#BE8A24',
      accentDim: '#F6EBD3',
      onAccentDim: '#8A6210',
    },
    dark: {
      primary: '#B199DC',
      primaryDim: '#322944',
      onPrimaryDim: '#D6C6F0',
      accent: '#D3A64B',
      accentDim: '#3C3117',
      onAccentDim: '#EBD3A0',
    },
  },
  blaubeere: {
    label: 'Blaubeere',
    light: {
      primary: '#6D83C9',
      primaryDim: '#E5E9F7',
      onPrimaryDim: '#45599E',
      accent: '#CF8A45',
      accentDim: '#F8EAD9',
      onAccentDim: '#99601E',
    },
    dark: {
      primary: '#93A5DC',
      primaryDim: '#282E45',
      onPrimaryDim: '#C4CEF0',
      accent: '#E0A566',
      accentDim: '#3E2E1B',
      onAccentDim: '#F0CDA2',
    },
  },
  himmel: {
    label: 'Himmelblau',
    light: {
      primary: '#5495CE',
      primaryDim: '#DEEBF8',
      onPrimaryDim: '#2F659B',
      accent: '#C96C87',
      accentDim: '#F7E1E8',
      onAccentDim: '#99425C',
    },
    dark: {
      primary: '#7DB1E0',
      primaryDim: '#21334A',
      onPrimaryDim: '#B9D6F0',
      accent: '#DE8CA4',
      accentDim: '#3D2630',
      onAccentDim: '#EEBECB',
    },
  },
  petrol: {
    label: 'Petrol',
    light: {
      primary: '#2F9BA4',
      primaryDim: '#D7EEF0',
      onPrimaryDim: '#196E76',
      accent: '#BE8A24',
      accentDim: '#F6EBD3',
      onAccentDim: '#8A6210',
    },
    dark: {
      primary: '#56B6BF',
      primaryDim: '#163A3E',
      onPrimaryDim: '#A0DCE2',
      accent: '#D3A64B',
      accentDim: '#3C3117',
      onAccentDim: '#EBD3A0',
    },
  },
  minze: {
    label: 'Minze',
    light: {
      primary: '#43A47E',
      primaryDim: '#DCF0E8',
      onPrimaryDim: '#276F52',
      accent: '#5C88BE',
      accentDim: '#E0E9F4',
      onAccentDim: '#3A5E8F',
    },
    dark: {
      primary: '#6CC0A0',
      primaryDim: '#1C382D',
      onPrimaryDim: '#AADFCA',
      accent: '#84A8D6',
      accentDim: '#22303F',
      onAccentDim: '#BCD2EA',
    },
  },
  salbei: {
    label: 'Salbei',
    light: {
      primary: '#85984D',
      primaryDim: '#EBEFDA',
      onPrimaryDim: '#59682C',
      accent: '#9A6AAE',
      accentDim: '#EFE3F3',
      onAccentDim: '#6E4482',
    },
    dark: {
      primary: '#A5B871',
      primaryDim: '#2C331C',
      onPrimaryDim: '#CEDCA5',
      accent: '#B78BC9',
      accentDim: '#34273B',
      onAccentDim: '#DCC2E6',
    },
  },
  pfirsich: {
    label: 'Pfirsich',
    light: {
      primary: '#E08268',
      primaryDim: '#FAE6DF',
      onPrimaryDim: '#AB4E2E',
      accent: '#2A9D8F',
      accentDim: '#D8EEEB',
      onAccentDim: '#1D7269',
    },
    dark: {
      primary: '#ECA189',
      primaryDim: '#422A21',
      onPrimaryDim: '#F5C9B6',
      accent: '#43B3A5',
      accentDim: '#173B36',
      onAccentDim: '#9FDCD3',
    },
  },
};

export const colorThemeNames = Object.keys(colorThemes) as ColorThemeName[];

/** Base palette with the chosen color theme applied; unknown names fall back to marigold. */
export function resolvePalette(theme: ThemeName, color: string | undefined): Palette {
  const tokens = colorThemes[color as ColorThemeName] ?? colorThemes[DEFAULT_COLOR_THEME];
  return { ...palettes[theme], ...tokens[theme] };
}

/** Gender colors are theme-independent accents (used on gradients/rings). */
export const gender = {
  der: '#6C8EBF',
  die: '#C97B84',
  das: '#7FA96B',
} as const;

export const streakGradient = ['#E8871E', '#F49B3F'] as const;

/** Confetti colors for reward moments — festive accents, theme-independent. */
export const confetti = [
  '#E8871E',
  '#2A9D8F',
  '#F4C430',
  '#E76F51',
  '#7FA96B',
  '#6C8EBF',
  '#C97B84',
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  card: 16,
  button: 12,
  chip: 999,
  screen: 24,
} as const;

export const fonts = {
  /** German headwords & screen titles */
  serif: 'Fraunces_600SemiBold',
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const type = {
  headword: 40,
  title: 32,
  section: 24,
  subtitle: 18,
  body: 16,
  secondary: 14,
  caption: 12,
} as const;
