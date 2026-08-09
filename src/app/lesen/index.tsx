import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listReadingTexts, type ReadingTextRow } from '@/db/readingRepo';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const LEVEL_SECTIONS: { level: string; label: string }[] = [
  { level: 'A1', label: 'A1 · Erste Texte' },
  { level: 'A2', label: 'A2 · Kleine Geschichten' },
  { level: 'B1', label: 'B1 · Zum Eintauchen' },
];

export default function LesenScreen() {
  const t = useTheme();
  const [texts, setTexts] = useState<ReadingTextRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listReadingTexts().then(setTexts);
    }, [])
  );

  const readCount = texts.filter((row) => row.completed_at != null).length;

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="title">Leseecke</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {texts.length > 0
          ? `${readCount} von ${texts.length} Texten gelesen — tippe Wörter an, um sie nachzuschlagen.`
          : 'Kurze Texte auf Deutsch — mit Übersetzung und Vorlesen.'}
      </AppText>

      {LEVEL_SECTIONS.map(({ level, label }) => {
        const section = texts.filter((row) => row.level === level);
        if (section.length === 0) return null;
        return (
          <View key={level}>
            <AppText variant="label" muted style={styles.levelHeader}>
              {label}
            </AppText>
            <View style={{ gap: spacing.md }}>
              {section.map((row) => (
                <TextCard key={row.slug} row={row} />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

function TextCard({ row }: { row: ReadingTextRow }) {
  const t = useTheme();
  const done = row.completed_at != null;
  return (
    <Card style={styles.card} onPress={() => router.push(`/lesen/${row.slug}`)}>
      <View style={[styles.iconBox, { backgroundColor: done ? t.accentDim : t.primaryDim }]}>
        <AppText style={{ fontSize: 24 }}>{done ? '✅' : '📖'}</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="subtitle">{row.title}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }} numberOfLines={2}>
          {row.teaser}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.chip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              ≈ {row.word_count} Wörter
            </AppText>
          </View>
          {done && (
            <View style={[styles.chip, { backgroundColor: t.accentDim }]}>
              <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
                Gelesen
              </AppText>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  levelHeader: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
