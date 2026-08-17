import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listReadingTexts, type ReadingTextRow } from '@/db/readingRepo';
import { useTr, type TranslationKey } from '@/i18n';
import { withinLevel } from '@/logic/levels';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const LEVEL_SECTIONS: { level: string; labelKey: TranslationKey }[] = [
  { level: 'A1', labelKey: 'reading.level.A1' },
  { level: 'A2', labelKey: 'reading.level.A2' },
  { level: 'B1', labelKey: 'reading.level.B1' },
  { level: 'B2', labelKey: 'reading.level.B2' },
  { level: 'C1', labelKey: 'reading.level.C1' },
  { level: 'C2', labelKey: 'reading.level.C2' },
];

export default function LesenScreen() {
  const t = useTheme();
  const tr = useTr();
  const [allTexts, setAllTexts] = useState<ReadingTextRow[]>([]);
  const userLevel = useSettings((s) => s.userLevel);

  useFocusEffect(
    useCallback(() => {
      listReadingTexts().then(setAllTexts);
    }, [])
  );

  // Show texts at the user's Sprachniveau — but never hide a level the
  // reader already started, so finished stories stay reachable.
  const texts = allTexts.filter(
    (row) => withinLevel(row.level, userLevel) || row.completed_at != null
  );
  const readCount = texts.filter((row) => row.completed_at != null).length;

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          {tr('common.back')}
        </AppText>
      </Pressable>
      <AppText variant="title">{tr('reading.title')}</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {texts.length > 0
          ? tr('reading.progress', { read: readCount, total: texts.length })
          : tr('reading.subtitle')}
      </AppText>

      {LEVEL_SECTIONS.map(({ level, labelKey }) => {
        const section = texts.filter((row) => row.level === level);
        if (section.length === 0) return null;
        return (
          <View key={level}>
            <AppText variant="label" muted style={styles.levelHeader}>
              {tr(labelKey)}
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
  const tr = useTr();
  const done = row.completed_at != null;
  return (
    <Card style={styles.card} onPress={() => router.push(`/lesen/${row.slug}`)}>
      {row.illustration_svg ? (
        <VocabImage svg={row.illustration_svg} gender={null} size={54} />
      ) : (
        <View style={[styles.iconBox, { backgroundColor: done ? t.accentDim : t.primaryDim }]}>
          <AppText style={{ fontSize: 24 }}>{done ? '✅' : '📖'}</AppText>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AppText variant="subtitle">{row.title}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }} numberOfLines={2}>
          {row.teaser}
        </AppText>
        <View style={styles.meta}>
          <View style={[styles.chip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              {tr('reading.wordCount', { count: row.word_count })}
            </AppText>
          </View>
          {done && (
            <View style={[styles.chip, { backgroundColor: t.accentDim }]}>
              <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
                {tr('reading.read')}
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
