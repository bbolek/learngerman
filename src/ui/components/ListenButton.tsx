import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { speakGerman } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/ui/useTheme';

/** Upper bound on how long the icon may stay tinted if the speech engine
 * never reports back (e.g. TTS service died), scaled by text length. */
function speakingMillisCap(text: string): number {
  return 3 * Math.min(4000, 900 + text.length * 55);
}

/**
 * Speaker button that pronounces German text with a press animation:
 * the icon pops, then stays tinted (filled icon) while the word is spoken.
 */
export function ListenButton({
  text,
  size = 20,
  color,
  activeColor,
  style,
  onSpoken,
}: {
  /** German text to speak. */
  text: string;
  size?: number;
  /** Idle icon color (defaults to faint ink). */
  color?: string;
  /** Color while speaking (defaults to theme primary). */
  activeColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Called after speech starts (e.g. tour events). */
  onSpoken?: () => void;
}) {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const press = () => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated via `.value` by design
    scale.value = withSequence(
      withTiming(0.75, { duration: 80 }),
      withSpring(1.3, { damping: 5, stiffness: 320 }),
      withSpring(1, { damping: 14, stiffness: 220 })
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSpeaking(false), speakingMillisCap(text));
    speakGerman(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        if (timer.current) clearTimeout(timer.current);
        setSpeaking(false);
      },
    });
    onSpoken?.();
  };

  return (
    <Pressable hitSlop={10} onPress={press} style={style}>
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={speaking ? 'volume-high' : 'volume-high-outline'}
          size={size}
          color={speaking ? (activeColor ?? t.primary) : (color ?? t.inkFaint)}
        />
      </Animated.View>
    </Pressable>
  );
}
