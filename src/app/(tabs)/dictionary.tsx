import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tourEmit } from '@/tour/tourStore';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { SearchBar } from '@/ui/components/SearchBar';
import {
  SearchHeaderRow,
  SearchResultRow,
  useDictionarySearch,
} from '@/ui/components/SearchResults';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function DictionaryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { rows, searched } = useDictionarySearch(query);

  const firstHitKey = rows.find((r) => r.type === 'hit')?.key;
  useEffect(() => {
    if (firstHitKey) tourEmit('dict-results');
  }, [firstHitKey]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.pad}>
        <AppText variant="section">Wörterbuch</AppText>
        <View style={{ height: spacing.md }} />
        <TourTarget id="dict-search">
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Deutsch oder English…"
          />
        </TourTarget>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={[styles.pad, { paddingBottom: spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <SearchHeaderRow title={item.title} />
          ) : item.key === firstHitKey ? (
            <TourTarget id="dict-first-result">
              <SearchResultRow hit={item.hit} image={item.image} />
            </TourTarget>
          ) : (
            <SearchResultRow hit={item.hit} image={item.image} />
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: spacing.lg },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl },
});
