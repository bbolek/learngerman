import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';

import { useCelebration, type QueuedCelebration } from '@/store/celebration';
import { AppText } from '@/ui/components/AppText';
import { confetti, fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/**
 * Global reward overlay (issue #38): confetti rain + a centered banner for
 * level-ups, streak milestones, badge unlocks, new records and finished
 * Tagesziele. Mounted once in the root layout; screens enqueue moments via
 * `celebrate()`. Non-interactive — it never blocks the flow underneath.
 */
const DURATION_MS = 2400;
const PIECES = 42;

export function CelebrationOverlay() {
  const current = useCelebration((s) => s.current);
  if (!current) return null;
  return <Burst key={current.id} event={current} />;
}

function Burst({ event }: { event: QueuedCelebration }) {
  const t = useTheme();
  const advance = useCelebration((s) => s.advance);
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.linear });
    const timer = setTimeout(advance, DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} index={i} progress={progress} width={width} height={height} />
      ))}
      <View style={styles.center}>
        <Animated.View
          entering={ZoomIn.springify().damping(14)}
          exiting={FadeOut.duration(200)}
          style={[
            styles.banner,
            { backgroundColor: t.surface, borderColor: t.primary, shadowColor: t.shadow },
          ]}>
          <AppText style={{ fontSize: 44 }}>{event.emoji}</AppText>
          <AppText
            variant="section"
            style={{ fontFamily: fonts.serif, marginTop: spacing.sm, textAlign: 'center' }}>
            {event.title}
          </AppText>
          {event.subtitle ? (
            <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
              {event.subtitle}
            </AppText>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

/** Deterministic pseudo-random per piece — no Math.random in render. */
function pieceParams(index: number, width: number, height: number) {
  const rnd = (n: number) => {
    const x = Math.sin(index * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    x: rnd(1) * width,
    delay: rnd(2) * 0.35,
    fall: height * (0.75 + rnd(3) * 0.45),
    drift: (rnd(4) - 0.5) * 90,
    spin: (rnd(5) - 0.5) * 900,
    size: 7 + rnd(6) * 6,
    round: rnd(7) > 0.5,
    color: confetti[index % confetti.length],
  };
}

function Piece({
  index,
  progress,
  width,
  height,
}: {
  index: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
}) {
  const p = useMemo(() => pieceParams(index, width, height), [index, width, height]);
  const style = useAnimatedStyle(() => {
    const local = interpolate(progress.value, [p.delay, 1], [0, 1], 'clamp');
    return {
      opacity: interpolate(local, [0, 0.05, 0.8, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: p.x + Math.sin(local * 6 + index) * 14 + local * p.drift },
        { translateY: -30 + local * local * p.fall },
        { rotate: `${local * p.spin}deg` },
        { rotateX: `${local * p.spin * 1.4}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: p.size,
          height: p.round ? p.size : p.size * 1.7,
          borderRadius: p.round ? p.size / 2 : 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  banner: {
    alignItems: 'center',
    borderRadius: radius.card + 4,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    maxWidth: 320,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  piece: { position: 'absolute', top: 0, left: 0 },
});
