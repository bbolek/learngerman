import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Search field with umlaut helper keys for keyboards without them. */
export function SearchBar({ value, onChangeText, placeholder, autoFocus }: SearchBarProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  return (
    <View>
      <View
        style={[
          styles.bar,
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: t.ink }]}
        />
        {value.length > 0 && (
          <Pressable hitSlop={8} onPress={() => onChangeText('')}>
            <Ionicons name="close-circle" size={19} color={t.inkFaint} />
          </Pressable>
        )}
      </View>
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
