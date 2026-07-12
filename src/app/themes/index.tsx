import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { savedThemeKeys, THEMES, type Theme } from '@/db/themesRepo';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function ThemesScreen() {
  const t = useTheme();
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      savedThemeKeys().then(setSavedKeys);
    }, [])
  );

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="title">Themen</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        Wortschatz nach Thema — lerne ganze Wortfelder auf einmal.
      </AppText>

      <View style={styles.grid}>
        {THEMES.map((theme) => (
          <ThemeCard key={theme.slug} theme={theme} savedKeys={savedKeys} />
        ))}
      </View>
    </Screen>
  );
}

function ThemeCard({ theme, savedKeys }: { theme: Theme; savedKeys: Set<string> }) {
  const t = useTheme();
  const total = theme.words.length;
  const learned = theme.words.reduce(
    (n, w) => n + (savedKeys.has(`${w.lemma}|${w.pos}`) ? 1 : 0),
    0
  );
  const progress = total === 0 ? 0 : learned / total;
  const done = learned === total;

  return (
    <Card
      style={styles.card}
      onPress={() => router.push({ pathname: '/themes/[slug]', params: { slug: theme.slug } })}>
      <AppText style={{ fontSize: 34 }}>{theme.emoji}</AppText>
      <AppText variant="subtitle" numberOfLines={2} style={{ marginTop: spacing.sm, fontSize: 16 }}>
        {theme.title}
      </AppText>
      <AppText variant="caption" muted style={{ marginTop: 2 }}>
        {learned} / {total} gelernt
      </AppText>
      <View style={[styles.track, { backgroundColor: t.line }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: done ? t.accent : t.primary },
          ]}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  card: { width: '47.5%', flexGrow: 1 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 999 },
});
