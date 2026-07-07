import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface TourFinishProps {
  visible: boolean;
  onClose: () => void;
}

/** Celebratory closing screen of the first-run tour. */
export function TourFinish({ visible, onClose }: TourFinishProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const bounce = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    bounce.value = 0;
    bounce.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withSpring(1, { damping: 5, stiffness: 160 }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })
        ),
        3
      )
    );
  }, [visible, bounce]);
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + bounce.value * 0.18 }, { rotate: `${bounce.value * -6}deg` }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: t.bg,
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}>
        <View style={styles.center}>
          <Animated.View entering={FadeInDown.duration(500).springify().damping(14)}>
            <Animated.View style={[styles.mark, { backgroundColor: t.successDim }, emojiStyle]}>
              <AppText style={styles.markEmoji}>🎉</AppText>
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(500)}>
            <AppText variant="title" style={styles.headline}>
              Du schaffst das!
            </AppText>
            <AppText variant="secondary" muted style={styles.sub}>
              (“You’ve got this!”)
            </AppText>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(500)}>
            <AppText variant="body" muted style={styles.blurb}>
              You’ve seen it all — dictionary, flashcards, grammar and games. Your first saved word
              is already in your review queue.
            </AppText>
            <AppText variant="body" muted style={[styles.blurb, { marginTop: spacing.md }]}>
              Learn a few words a day, keep the streak alive, and German will come to you.
            </AppText>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(420).duration(500)}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneBtn,
              { backgroundColor: t.primary, shadowColor: t.shadow },
              pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
            ]}>
            <AppText variant="subtitle" color="#FFFFFF" style={{ fontFamily: fonts.extrabold }}>
              Start learning →
            </AppText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: {
    width: 108,
    height: 108,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markEmoji: { fontSize: 52, lineHeight: 62 },
  headline: { textAlign: 'center', marginTop: spacing.xl },
  sub: { textAlign: 'center', marginTop: spacing.xs },
  blurb: { textAlign: 'center', marginTop: spacing.lg, lineHeight: 24, maxWidth: 320 },
  doneBtn: {
    borderRadius: radius.button + 4,
    paddingVertical: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
});
