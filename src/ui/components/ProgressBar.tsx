import { StyleSheet, View } from 'react-native';

import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface ProgressBarProps {
  /** 0..1; clamped. */
  ratio: number;
  color?: string;
  height?: number;
}

/** Flat track/fill progress bar (the ring stays the animated element). */
export function ProgressBar({ ratio, color, height = 5 }: ProgressBarProps) {
  const t = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <View style={[styles.track, { backgroundColor: t.line, height }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color ?? t.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.chip, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.chip },
});
