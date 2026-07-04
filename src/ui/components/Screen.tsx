import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface ScreenProps {
  children: ReactNode;
  /** Scrollable content (default true). */
  scroll?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = true, style }: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const base = [
    styles.content,
    { paddingTop: insets.top + spacing.md, backgroundColor: t.bg },
    style,
  ];
  if (!scroll) return <View style={[styles.fill, ...base]}>{children}</View>;
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: t.bg }]}
      contentContainerStyle={[...base, styles.scrollInner]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: spacing.lg },
  scrollInner: { paddingBottom: spacing.xxl },
});
