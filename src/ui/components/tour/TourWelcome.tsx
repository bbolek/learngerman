import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface TourWelcomeProps {
  visible: boolean;
  onStart: () => void;
  onSkip: () => void;
}

/** First-launch greeting: offers the interactive tour before anything else. */
export function TourWelcome({ visible, onStart, onSkip }: TourWelcomeProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
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
          <Animated.View entering={FadeInDown.duration(500).springify().damping(16)}>
            <View style={[styles.mark, { backgroundColor: t.primaryDim }]}>
              <AppText style={styles.markEmoji}>🇩🇪</AppText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)}>
            <AppText variant="title" style={styles.appName}>
              Deutschly
            </AppText>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(500)}>
            <AppText variant="subtitle" style={styles.hello} color={t.primary}>
              Willkommen! 👋
            </AppText>
            <AppText variant="body" muted style={styles.blurb}>
              Your offline German companion — a full A1/A2 dictionary, smart flashcards, grammar
              practice and word games.
            </AppText>
            <AppText variant="body" muted style={[styles.blurb, { marginTop: spacing.md }]}>
              Take a 2-minute tour and learn the app by actually using it.
            </AppText>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(380).duration(500)} style={styles.actions}>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: t.primary, shadowColor: t.shadow },
              pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
            ]}>
            <AppText variant="subtitle" color="#FFFFFF" style={{ fontFamily: fonts.extrabold }}>
              Take the tour
            </AppText>
          </Pressable>
          <Animated.View entering={FadeIn.delay(600)}>
            <Pressable onPress={onSkip} hitSlop={10} style={styles.skipBtn}>
              <AppText variant="secondary" muted>
                Skip for now
              </AppText>
            </Pressable>
          </Animated.View>
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
  appName: { textAlign: 'center', marginTop: spacing.xl },
  hello: { textAlign: 'center', marginTop: spacing.sm },
  blurb: { textAlign: 'center', marginTop: spacing.lg, lineHeight: 24, maxWidth: 320 },
  actions: { gap: spacing.md, alignItems: 'stretch' },
  startBtn: {
    borderRadius: radius.button + 4,
    paddingVertical: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
});
