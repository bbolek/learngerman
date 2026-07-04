import { type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip: () => void;
}

/** Tap-to-flip card with a rotateY spring — the review screen centerpiece. */
export function FlipCard({ front, back, flipped, onFlip }: FlipCardProps) {
  const t = useTheme();
  const rotation = useSharedValue(0);

  if (flipped && rotation.value === 0) rotation.value = withSpring(180, { damping: 15 });
  if (!flipped && rotation.value === 180) rotation.value = withSpring(0, { damping: 15 });

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.value}deg` }],
    opacity: interpolate(rotation.value, [0, 89, 90], [1, 1, 0]),
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.value - 180}deg` }],
    opacity: interpolate(rotation.value, [90, 91, 180], [0, 1, 1]),
  }));

  return (
    <Pressable style={styles.fill} onPress={onFlip}>
      <Animated.View
        style={[
          styles.face,
          { backgroundColor: t.surface, borderColor: t.line, shadowColor: t.shadow },
          frontStyle,
        ]}>
        {front}
      </Animated.View>
      <Animated.View
        style={[
          styles.face,
          styles.back,
          { backgroundColor: t.surface, borderColor: t.line, shadowColor: t.shadow },
          backStyle,
        ]}>
        {back}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.screen,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backfaceVisibility: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 4,
  },
  back: {},
});
