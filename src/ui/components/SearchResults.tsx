import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getDb } from '@/db/client';
import { getLemmaImages } from '@/db/dictionaryRepo';
import { articleFor, formLabel } from '@/logic/formLabels';
import { lookupEnglish, lookupGerman, type LemmaHit } from '@/logic/lookup';
import { speakGerman } from '@/services/speech';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { VocabImage } from '@/ui/components/VocabImage';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export type SearchRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'hit'; key: string; hit: LemmaHit; image: string | null };

/** Debounced German+English dictionary lookup shared by search surfaces. */
export function useDictionarySearch(query: string): { rows: SearchRow[]; searched: boolean } {
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRows([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      const db = getDb();
      const [de, en] = await Promise.all([lookupGerman(db, q), lookupEnglish(db, q)]);
      if (cancelled) return;
      const images = await getLemmaImages([...new Set([...de, ...en].map((h) => h.lemmaId))]);
      if (cancelled) return;
      const toRow = (prefix: string) => (hit: LemmaHit): SearchRow => ({
        type: 'hit',
        key: `${prefix}-${hit.lemmaId}`,
        hit,
        image: images.get(hit.lemmaId) ?? null,
      });
      const next: SearchRow[] = [];
      if (de.length) {
        next.push({ type: 'header', key: 'h-de', title: 'Deutsch → English' });
        next.push(...de.map(toRow('de')));
      }
      const deIds = new Set(de.map((h) => h.lemmaId));
      const enOnly = en.filter((h) => !deIds.has(h.lemmaId));
      if (enOnly.length) {
        next.push({ type: 'header', key: 'h-en', title: 'English → Deutsch' });
        next.push(...enOnly.map(toRow('en')));
      }
      setRows(next);
      setSearched(true);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return { rows, searched };
}

export function SearchResultRow({
  hit,
  image,
  onPress,
}: {
  hit: LemmaHit;
  image: string | null;
  onPress?: () => void;
}) {
  const t = useTheme();
  const label = formLabel(hit.matchedTag);
  const article = hit.gender && hit.gender !== 'pl' ? articleFor(hit.gender) : null;
  const spoken = article ? `${article} ${hit.lemma}` : hit.lemma;
  return (
    <Card
      onPress={
        onPress ??
        (() => router.push({ pathname: '/word/[id]', params: { id: String(hit.lemmaId) } }))
      }
      style={styles.row}>
      <View style={styles.rowTop}>
        {image && <VocabImage svg={image} gender={hit.gender} size={44} />}
        <View style={styles.rowText}>
          <AppText variant="subtitle" style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 19 }}>
            {article ? `${article} ` : ''}
            {hit.lemma}
          </AppText>
          <AppText variant="secondary" muted numberOfLines={1}>
            {hit.gloss}
          </AppText>
        </View>
        <View style={styles.chips}>
          <GenderChip gender={hit.gender} small />
          <Chip label={hit.level} kind="level" small />
        </View>
        <Pressable hitSlop={10} onPress={() => speakGerman(spoken)}>
          <Ionicons name="volume-high-outline" size={20} color={t.inkFaint} />
        </Pressable>
      </View>
      {hit.via === 'form' && hit.matchedForm && (
        <View style={[styles.formOf, { backgroundColor: t.primaryDim }]}>
          <AppText variant="caption" color={t.onPrimaryDim}>
            {hit.matchedForm} → {label ?? 'Form'} von „{hit.lemma}“
          </AppText>
        </View>
      )}
    </Card>
  );
}

export function SearchHeaderRow({ title }: { title: string }) {
  return (
    <AppText variant="label" muted style={styles.header}>
      {title}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { marginBottom: spacing.sm, paddingVertical: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { flex: 1 },
  chips: { flexDirection: 'row', gap: 6 },
  formOf: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
});
