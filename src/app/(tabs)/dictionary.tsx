import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTr } from '@/i18n';
import { scannerAvailable } from '@/services/scanner';
import { tourEmit } from '@/tour/tourStore';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { SearchBar, type SearchBarHandle } from '@/ui/components/SearchBar';
import {
  SearchHeaderRow,
  SearchResultRow,
  useDictionarySearch,
} from '@/ui/components/SearchResults';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function DictionaryScreen() {
  const t = useTheme();
  const tr = useTr();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { rows, searched } = useDictionarySearch(query);
  const searchRef = useRef<SearchBarHandle>(null);

  // Focus the search field on every tab switch, slightly delayed so the
  // keyboard opens after the screen transition instead of fighting it.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => searchRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }, [])
  );

  const firstHitKey = rows.find((r) => r.type === 'hit')?.key;
  useEffect(() => {
    if (firstHitKey) tourEmit('dict-results');
  }, [firstHitKey]);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.pad}>
        <View style={styles.headerRow}>
          <AppText variant="section">{tr('dict.title')}</AppText>
          <View style={styles.headerActions}>
            {scannerAvailable() && (
              <Pressable
                onPress={() => router.push('/scan')}
                hitSlop={8}
                style={[styles.scanBtn, { backgroundColor: t.accentDim }]}>
                <Ionicons name="camera" size={16} color={t.onAccentDim} />
              </Pressable>
            )}
            <TourTarget id="dict-saved">
              <Pressable
                onPress={() => router.push('/words')}
                hitSlop={8}
                style={[styles.savedLink, { backgroundColor: t.primaryDim }]}>
                <Ionicons name="heart" size={15} color={t.onPrimaryDim} />
                <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  {tr('dict.savedLink')}
                </AppText>
              </Pressable>
            </TourTarget>
          </View>
        </View>
        <View style={{ height: spacing.md }} />
        <TourTarget id="dict-search">
          <SearchBar
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder={tr('dict.searchPlaceholder')}
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
                {tr('dict.empty.title')}
              </AppText>
              <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
                {tr('dict.empty.body')}
              </AppText>
            </View>
          ) : (
            <View style={styles.empty}>
              <AppText variant="secondary" muted style={{ textAlign: 'center' }}>
                {tr('dict.hint')}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl },
});
