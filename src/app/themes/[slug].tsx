import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getLemmaImages } from '@/db/dictionaryRepo';
import { enrollThemeWords, getTheme, themeWords, type ThemeWordRow } from '@/db/themesRepo';
import { useThemeFilter } from '@/store/themeFilter';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { LevelFilter } from '@/ui/components/LevelFilter';
import { ListenButton } from '@/ui/components/ListenButton';
import { Screen } from '@/ui/components/Screen';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function ThemeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const theme = getTheme(slug);

  const [rows, setRows] = useState<ThemeWordRow[] | null>(null);
  const [images, setImages] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const levels = useThemeFilter((s) => s.levels);
  const selectedLevels = new Set<string>(levels);

  const reload = useCallback(() => {
    if (!theme) return;
    themeWords(theme).then(async (r) => {
      setImages(await getLemmaImages(r.map((w) => w.lemma_id)));
      setRows(r);
    });
  }, [theme]);
  useFocusEffect(reload);

  if (!theme) {
    return (
      <Screen>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
          <AppText variant="secondary" muted>
            Zurück
          </AppText>
        </Pressable>
        <AppText variant="subtitle" muted style={{ marginTop: spacing.xl }}>
          Thema nicht gefunden.
        </AppText>
      </Screen>
    );
  }

  const visibleRows = rows?.filter((r) => selectedLevels.has(r.level)) ?? null;
  const learned = visibleRows?.filter((r) => r.saved).length ?? 0;
  const total = visibleRows?.length ?? 0;
  const unsaved = visibleRows?.filter((r) => !r.saved).map((r) => r.lemma_id) ?? [];

  const enroll = async () => {
    if (busy || unsaved.length === 0) return;
    setBusy(true);
    await enrollThemeWords(unsaved, new Date());
    setBusy(false);
    reload();
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Themen
        </AppText>
      </Pressable>

      <View style={styles.header}>
        <AppText style={{ fontSize: 40 }}>{theme.emoji}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="title" style={{ fontSize: 24 }}>
            {theme.title}
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            {learned} / {total} gelernt
          </AppText>
        </View>
      </View>

      <LevelFilter />

      {visibleRows && total === 0 ? (
        <View style={[styles.cta, { backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }]}>
          <AppText variant="secondary" muted>
            Keine Wörter in dieser Stufe
          </AppText>
        </View>
      ) : unsaved.length > 0 ? (
        <Pressable
          onPress={enroll}
          disabled={busy}
          style={[styles.cta, { backgroundColor: busy ? t.primaryDim : t.primary }]}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <AppText variant="subtitle" color="#fff">
            {busy ? 'Wird hinzugefügt…' : `${unsaved.length} Wörter lernen`}
          </AppText>
        </Pressable>
      ) : visibleRows ? (
        <View style={[styles.cta, { backgroundColor: t.accentDim }]}>
          <Ionicons name="checkmark-circle" size={20} color={t.onAccentDim} />
          <AppText variant="subtitle" color={t.onAccentDim}>
            Alle Wörter gespeichert 🎉
          </AppText>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        {visibleRows?.map((w) => (
          <WordRow key={w.lemma_id} word={w} image={images.get(w.lemma_id) ?? null} />
        ))}
      </View>
    </Screen>
  );
}

function WordRow({ word, image }: { word: ThemeWordRow; image: string | null }) {
  const t = useTheme();
  const spokenArticle =
    word.gender === 'm' ? 'der ' : word.gender === 'f' ? 'die ' : word.gender === 'n' ? 'das ' : '';
  return (
    <Card
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: String(word.lemma_id) } })}
      style={styles.row}>
      <View style={styles.rowInner}>
        {image && <VocabImage svg={image} gender={word.gender} size={40} />}
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 18 }}>
            {spokenArticle}
            {word.lemma}
          </AppText>
          <AppText variant="secondary" muted numberOfLines={1}>
            {word.gloss}
          </AppText>
        </View>
        <Chip label={word.level} kind="level" small />
        <GenderChip gender={word.gender} small />
        {word.saved && <Ionicons name="heart" size={16} color={t.primary} />}
        <ListenButton text={`${spokenArticle}${word.lemma}`} size={19} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  row: { paddingVertical: 11 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
