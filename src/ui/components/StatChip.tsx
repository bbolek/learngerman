import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface StatChipProps {
  /** Emoji glyph in front of the label. */
  emoji?: string;
  /** Custom leading element (e.g. a tiny ProgressRing); wins over emoji. */
  leading?: ReactNode;
  label: string;
  onPress?: () => void;
}

/** Small stat pill (streak, level, game record) — quiet by design. */
export function StatChip({ emoji, leading, label, onPress }: StatChipProps) {
  const t = useTheme();
  const inner = (
    <>
      {leading ?? (emoji ? <AppText style={{ fontSize: 13 }}>{emoji}</AppText> : null)}
      <AppText variant="caption" style={{ fontFamily: fonts.extrabold }}>
        {label}
      </AppText>
    </>
  );
  const base = [styles.chip, { backgroundColor: t.surface, borderColor: t.line }];
  if (!onPress) return <View style={base}>{inner}</View>;
  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 }]}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
});
