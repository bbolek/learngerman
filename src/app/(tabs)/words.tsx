import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLemmaImages } from '@/db/dictionaryRepo';
import { listSavedWords, setLearned, unsaveWord, type SavedWordRow } from '@/db/vocabRepo';
import { phaseOf } from '@/logic/sm2';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { VocabImage } from '@/ui/components/VocabImage';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function WordsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<SavedWordRow[] | null>(null);
  const [images, setImages] = useState<Map<number, string>>(new Map());
  const showLearned = useSettings((s) => s.showLearnedWords);

  const reload = useCallback(() => {
    listSavedWords(showLearned).then(async (rows) => {
      setImages(await getLemmaImages(rows.map((w) => w.lemma_id)));
      setWords(rows);
    });
  }, [showLearned]);
  useFocusEffect(reload);

  const remove = async (lemmaId: number) => {
    await unsaveWord(lemmaId);
    reload();
  };

  const toggleLearned = async (lemmaId: number, learned: boolean) => {
    await setLearned(lemmaId, learned, new Date());
    reload();
  };

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.pad}>
        <AppText variant="section">Meine Wörter</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 2 }}>
          {words ? `${words.length} gespeichert` : ' '}
        </AppText>
      </View>
      <FlatList
        data={words ?? []}
        keyExtractor={(w) => String(w.lemma_id)}
        contentContainerStyle={[styles.pad, { paddingBottom: spacing.xxl, paddingTop: spacing.md }]}
        renderItem={({ item }) => (
          <WordRow
            word={item}
            image={images.get(item.lemma_id) ?? null}
            onRemove={remove}
            onToggleLearned={toggleLearned}
          />
        )}
        ListEmptyComponent={
          words ? (
            <View style={styles.empty}>
              <AppText style={{ fontSize: 44 }}>📖</AppText>
              <AppText variant="subtitle" muted style={{ marginTop: spacing.md }}>
                Noch keine Wörter
              </AppText>
              <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 4 }}>
                Suche ein Wort im Wörterbuch und tippe auf das Herz, um es zu speichern.
              </AppText>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function WordRow({
  word,
  image,
  onRemove,
  onToggleLearned,
}: {
  word: SavedWordRow;
  image: string | null;
  onRemove: (id: number) => void;
  onToggleLearned: (id: number, learned: boolean) => void;
}) {
  const t = useTheme();
  const isLearned = word.learned_at != null;
  const state =
    word.reps == null
      ? null
      : { ease: 2.5, intervalDays: 0, reps: word.reps, lapses: word.lapses ?? 0 };

  let srsChip: { label: string; kind: 'new' | 'learning' | 'due' } = { label: 'Neu', kind: 'new' };
  if (state && word.due_at) {
    const due = new Date(word.due_at);
    if (state.reps > 0 && due.getTime() <= Date.now()) srsChip = { label: 'Fällig', kind: 'due' };
    else if (phaseOf({ ...state, intervalDays: 22 }) === 'review' && state.reps >= 6)
      srsChip = { label: 'Reif', kind: 'learning' };
    else if (state.reps > 0) srsChip = { label: 'Lernen', kind: 'learning' };
  }

  return (
    <Card
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: String(word.lemma_id) } })}
      style={[styles.row, isLearned && { opacity: 0.55 }]}>
      <View style={styles.rowInner}>
        {image && <VocabImage svg={image} gender={word.gender} size={44} />}
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 19 }}>
            {word.gender === 'm' ? 'der ' : word.gender === 'f' ? 'die ' : word.gender === 'n' ? 'das ' : ''}
            {word.lemma}
          </AppText>
          <AppText variant="secondary" muted numberOfLines={1}>
            {word.gloss}
          </AppText>
        </View>
        <View style={styles.chips}>
          <GenderChip gender={word.gender} small />
          {isLearned ? <Chip label="Gelernt" kind="learning" small /> : <Chip label={srsChip.label} kind={srsChip.kind} small />}
        </View>
        <Pressable hitSlop={10} onPress={() => onToggleLearned(word.lemma_id, !isLearned)}>
          <Ionicons
            name={isLearned ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={20}
            color={isLearned ? t.accent : t.inkFaint}
          />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => onRemove(word.lemma_id)}>
          <Ionicons name="trash-outline" size={19} color={t.inkFaint} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: spacing.lg },
  row: { marginBottom: spacing.sm, paddingVertical: 13 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', gap: 6 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
});
