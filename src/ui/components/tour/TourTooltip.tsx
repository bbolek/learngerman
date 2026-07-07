import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface TourTooltipProps {
  title: string;
  body: string;
  /** 0-based step index and total, for the progress bar. */
  index: number;
  total: number;
  /** Info steps get a "Next" pill; action steps a "Try it" hint chip. */
  showNext: boolean;
  onNext: () => void;
  onSkip: () => void;
  /** Caret pointing at the spotlight: where the tooltip sits relative to it. */
  caret?: 'above' | 'below';
  /** Horizontal center of the caret, in tooltip-local coordinates. */
  caretX?: number;
  style?: StyleProp<ViewStyle>;
}

const CARET = 10;

/** The floating explanation card of the first-run tour. */
export function TourTooltip({
  title,
  body,
  index,
  total,
  showNext,
  onNext,
  onSkip,
  caret,
  caretX,
  style,
}: TourTooltipProps) {
  const t = useTheme();

  const caretStyle = caret && caretX != null && (
    <View
      style={[
        styles.caret,
        {
          backgroundColor: t.surface,
          borderColor: t.line,
          left: caretX - CARET,
          ...(caret === 'below'
            ? { top: -CARET + 1, borderLeftWidth: 1, borderTopWidth: 1 }
            : { bottom: -CARET + 1, borderRightWidth: 1, borderBottomWidth: 1 }),
        },
      ]}
    />
  );

  return (
    <Animated.View
      key={`${index}-${title}`}
      entering={FadeInDown.springify().damping(18)}
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.line, shadowColor: t.shadow },
        style,
      ]}>
      {caretStyle}
      <AppText variant="section" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" style={[styles.body, { color: t.ink }]}>
        {body}
      </AppText>

      <View style={styles.progressRow}>
        <View style={[styles.track, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: t.primary, width: `${((index + 1) / total) * 100}%` },
            ]}
          />
        </View>
        <AppText variant="caption" muted>
          {index + 1} / {total}
        </AppText>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onSkip} hitSlop={10}>
          <AppText variant="secondary" muted>
            Skip tour
          </AppText>
        </Pressable>
        {showNext ? (
          <Pressable
            onPress={onNext}
            hitSlop={6}
            style={({ pressed }) => [
              styles.nextBtn,
              { backgroundColor: t.primary },
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}>
            <AppText variant="secondary" color="#FFFFFF" style={{ fontFamily: fonts.extrabold }}>
              Next →
            </AppText>
          </Pressable>
        ) : (
          <View style={[styles.tryChip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              Try it 👆
            </AppText>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  caret: {
    position: 'absolute',
    width: CARET * 2,
    height: CARET * 2,
    transform: [{ rotate: '45deg' }],
    borderRadius: 3,
  },
  title: { fontSize: 21 },
  body: { marginTop: spacing.sm, fontSize: 15, lineHeight: 22 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  track: { flex: 1, height: 4, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 999 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  nextBtn: {
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  tryChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
});
