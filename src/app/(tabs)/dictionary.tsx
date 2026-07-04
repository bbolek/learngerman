import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { formLabel } from '@/logic/formLabels';
import { lookupEnglish, lookupGerman, type LemmaHit } from '@/logic/lookup';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { SearchBar } from '@/ui/components/SearchBar';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Row =
  | { type: 'header'; key: string; title: string }
  | { type: 'hit'; key: string; hit: LemmaHit };

export default function DictionaryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
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
      const next: Row[] = [];
      if (de.length) {
        next.push({ type: 'header', key: 'h-de', title: 'Deutsch → English' });
        next.push(...de.map((hit): Row => ({ type: 'hit', key: `de-${hit.lemmaId}`, hit })));
      }
      const deIds = new Set(de.map((h) => h.lemmaId));
      const enOnly = en.filter((h) => !deIds.has(h.lemmaId));
      if (enOnly.length) {
        next.push({ type: 'header', key: 'h-en', title: 'English → Deutsch' });
        next.push(...enOnly.map((hit): Row => ({ type: 'hit', key: `en-${hit.lemmaId}`, hit })));
      }
      setRows(next);
      setSearched(true);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.pad}>
        <AppText variant="section">Wörterbuch</AppText>
        <View style={{ height: spacing.md }} />
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Deutsch oder English…"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={[styles.pad, { paddingBottom: spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <AppText variant="label" muted style={styles.header}>
              {item.title}
            </AppText>
          ) : (
            <ResultRow hit={item.hit} />
          )
        }
        ListEmptyComponent={
          searched ? (
            <View style={styles.empty}>
              <AppText variant="subtitle" muted>
                Nichts gefunden 🕵️
              </AppText>
              <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
                Prüfe die Schreibweise — oder das Wort ist noch nicht im A1/A2-Wortschatz.
              </AppText>
            </View>
          ) : (
            <View style={styles.empty}>
              <AppText variant="secondary" muted style={{ textAlign: 'center' }}>
                Tippe ein deutsches Wort in jeder Form („macht“, „gemacht“)
                oder ein englisches Wort.
              </AppText>
            </View>
          )
        }
      />
    </View>
  );
}

function ResultRow({ hit }: { hit: LemmaHit }) {
  const t = useTheme();
  const label = formLabel(hit.matchedTag);
  return (
    <Card
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: String(hit.lemmaId) } })}
      style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <AppText variant="subtitle" style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 19 }}>
            {hit.gender && hit.gender !== 'pl' ? `${genderArticle(hit.gender)} ` : ''}
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

function genderArticle(g: string): string {
  return g === 'm' ? 'der' : g === 'f' ? 'die' : 'das';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: spacing.lg },
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
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl },
});
