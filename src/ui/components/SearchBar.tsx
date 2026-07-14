import Ionicons from '@expo/vector-icons/Ionicons';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

export interface SearchBarHandle {
  focus: () => void;
}

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ref?: Ref<SearchBarHandle>;
}

/** Search field with umlaut helper keys for keyboards without them. */
export function SearchBar({ value, onChangeText, placeholder, autoFocus, ref }: SearchBarProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const pulse = useSharedValue(1);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View>
      <Animated.View
        style={[
          styles.bar,
          pulseStyle,
          { backgroundColor: t.surface, borderColor: focused ? t.primary : t.line },
        ]}>
        <Ionicons name="search" size={19} color={focused ? t.primary : t.inkMuted} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.inkFaint}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => {
            setFocused(true);
            // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated via `.value` by design
            pulse.value = withSequence(
              withTiming(1.03, { duration: 110 }),
              withTiming(1, { duration: 160 })
            );
          }}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: t.ink }]}
        />
        {value.length > 0 && (
          <Pressable hitSlop={8} onPress={() => onChangeText('')}>
            <Ionicons name="close-circle" size={19} color={t.inkFaint} />
          </Pressable>
        )}
      </Animated.View>
      <View style={styles.umlautRow}>
        {UMLAUTS.map((u) => (
          <Pressable
            key={u}
            onPress={() => {
              onChangeText(value + u);
              inputRef.current?.focus();
            }}
            style={({ pressed }) => [
              styles.umlautKey,
              { backgroundColor: t.surface, borderColor: t.line },
              pressed && { backgroundColor: t.primaryDim, borderColor: t.primary },
            ]}>
            <AppText variant="subtitle">{u}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, padding: 0 },
  umlautRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  umlautKey: {
    width: 46,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
