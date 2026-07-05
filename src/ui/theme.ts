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

/** Gender colors are theme-independent accents (used on gradients/rings). */
export const gender = {
  der: '#6C8EBF',
  die: '#C97B84',
  das: '#7FA96B',
} as const;

export const streakGradient = ['#E8871E', '#F49B3F'] as const;

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
