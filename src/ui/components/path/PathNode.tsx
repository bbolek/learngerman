import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { type NodeState } from '@/logic/path';
import { AppText } from '@/ui/components/AppText';
import { fonts } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export const NODE_SIZE = 56;

/**
 * One stop on the Lernpfad map. Done nodes are filled and show their stars,
 * the active node pulses ("Du bist hier"), placement-skipped nodes are
 * outlined, locked ones muted.
 */
export function PathNode({
  state,
  stars,
  kind,
  onPress,
}: {
  state: NodeState;
  stars: number;
  kind: 'lesson' | 'review';
  onPress: () => void;
}) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== 'active') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const icon = kind === 'review' ? 'refresh' : state === 'done' ? 'checkmark' : 'star';
  let bg = t.surface;
  let border = t.line;
  let fg = t.inkFaint;
  if (state === 'done') {
    bg = t.accent;
    border = t.accent;
    fg = '#fff';
  } else if (state === 'active') {
    bg = t.primary;
    border = t.primary;
    fg = '#fff';
  } else if (state === 'open') {
    bg = t.surface;
    border = t.primary;
    fg = t.primary;
  }

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ scale: state === 'active' ? pulse : 1 }] }}>
        <Pressable
          disabled={state === 'locked'}
          onPress={onPress}
          style={({ pressed }) => [
            styles.circle,
            { backgroundColor: bg, borderColor: border },
            state === 'locked' && { opacity: 0.55 },
            pressed && { transform: [{ scale: 0.93 }] },
          ]}>
          <Ionicons
            name={state === 'locked' ? 'lock-closed' : icon}
            size={state === 'locked' ? 20 : 26}
            color={fg}
          />
        </Pressable>
      </Animated.View>
      {state === 'done' && (
        <View style={styles.starRow}>
          {[1, 2, 3].map((s) => (
            <Ionicons
              key={s}
              name="star"
              size={11}
              color={s <= stars ? t.accent : t.inkFaint}
              style={s > stars ? { opacity: 0.4 } : undefined}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** The floating "you are here" pill above the active node. */
export function HerePill({ level }: { level: string }) {
  const t = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: t.primary }]}>
      <AppText variant="caption" color="#fff" style={{ fontFamily: fonts.extrabold }}>
        Du bist hier · {level}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starRow: { flexDirection: 'row', gap: 1, marginTop: 3 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});
