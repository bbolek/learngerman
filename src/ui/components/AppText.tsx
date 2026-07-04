import { Text, type TextProps, type TextStyle } from 'react-native';

import { fonts, type as typeScale } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Variant = 'headword' | 'title' | 'section' | 'subtitle' | 'body' | 'secondary' | 'caption' | 'label';

const variantStyle: Record<Variant, TextStyle> = {
  headword: { fontFamily: fonts.serif, fontSize: typeScale.headword },
  title: { fontFamily: fonts.serif, fontSize: typeScale.title },
  section: { fontFamily: fonts.serif, fontSize: typeScale.section },
  subtitle: { fontFamily: fonts.bold, fontSize: typeScale.subtitle },
  body: { fontFamily: fonts.regular, fontSize: typeScale.body },
  secondary: { fontFamily: fonts.semibold, fontSize: typeScale.secondary },
  caption: { fontFamily: fonts.bold, fontSize: typeScale.caption },
  label: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
};

interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  color?: string;
}

export function AppText({ variant = 'body', muted, color, style, ...rest }: AppTextProps) {
  const t = useTheme();
  return (
    <Text
      style={[variantStyle[variant], { color: color ?? (muted ? t.inkMuted : t.ink) }, style]}
      {...rest}
    />
  );
}
