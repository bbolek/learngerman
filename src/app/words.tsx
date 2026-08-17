import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLemmaImages } from '@/db/dictionaryRepo';
import { listSavedWords, unsaveWord, type SavedWordRow } from '@/db/vocabRepo';
import { useTr } from '@/i18n';
import { phaseOf } from '@/logic/sm2';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { ListenButton } from '@/ui/components/ListenButton';
import { VocabImage } from '@/ui/components/VocabImage';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function WordsScreen() {
  const t = useTheme();
  const tr = useTr();
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<SavedWordRow[] | null>(null);
  const [images, setImages] = useState<Map<number, string>>(new Map());
  const [now, setNow] = useState(0);

  const reload = useCallback(() => {
    listSavedWords().then(async (rows) => {
      setImages(await getLemmaImages(rows.map((w) => w.lemma_id)));
      setWords(rows);
      setNow(Date.now());
    });
  }, []);
  useFocusEffect(reload);

  const remove = async (lemmaId: number) => {
    await unsaveWord(lemmaId);
    reload();
  };

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.pad}>
        <TourTarget id="words-back">
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
            <AppText variant="secondary" muted>
              {tr('common.back')}
            </AppText>
          </Pressable>
        </TourTarget>
        <AppText variant="section">{tr('words.title')}</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 2 }}>
          {words ? tr('words.savedCount', { count: words.length }) : ' '}
        </AppText>
      </View>
      <FlatList
        data={words ?? []}
        keyExtractor={(w) => String(w.lemma_id)}
        contentContainerStyle={[styles.pad, { paddingBottom: spacing.xxl, paddingTop: spacing.md }]}
        renderItem={({ item, index }) => {
          const row = (
            <WordRow
              word={item}
              image={images.get(item.lemma_id) ?? null}
              now={now}
              onRemove={remove}
            />
          );
          return index === 0 ? <TourTarget id="words-first-row">{row}</TourTarget> : row;
        }}
        ListEmptyComponent={
          words ? (
            <View style={styles.empty}>
              <AppText style={{ fontSize: 44 }}>📖</AppText>
              <AppText variant="subtitle" muted style={{ marginTop: spacing.md }}>
                {tr('words.empty.title')}
              </AppText>
              <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 4 }}>
                {tr('words.empty.body')}
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
  now,
  onRemove,
}: {
  word: SavedWordRow;
  image: string | null;
  now: number;
  onRemove: (id: number) => void;
}) {
  const t = useTheme();
  const tr = useTr();
  const state =
    word.reps == null
      ? null
      : { ease: 2.5, intervalDays: 0, reps: word.reps, lapses: word.lapses ?? 0 };

  const spokenArticle =
    word.gender === 'm' ? 'der ' : word.gender === 'f' ? 'die ' : word.gender === 'n' ? 'das ' : '';

  let srsChip: { label: string; kind: 'new' | 'learning' | 'due' } = {
    label: tr('words.state.new'),
    kind: 'new',
  };
  if (state && word.due_at) {
    const due = new Date(word.due_at);
    if (state.reps > 0 && due.getTime() <= now) {
      srsChip = { label: tr('words.state.due'), kind: 'due' };
    } else if (phaseOf({ ...state, intervalDays: 22 }) === 'review' && state.reps >= 6) {
      srsChip = { label: tr('words.state.mature'), kind: 'learning' };
    } else if (state.reps > 0) {
      srsChip = { label: tr('words.state.learning'), kind: 'learning' };
    }
  }

  return (
    <Card
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: String(word.lemma_id) } })}
      style={styles.row}>
      <View style={styles.rowInner}>
        {image && <VocabImage svg={image} gender={word.gender} size={44} />}
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 19 }}>
            {spokenArticle}
            {word.lemma}
          </AppText>
          <AppText variant="secondary" muted numberOfLines={1}>
            {word.gloss}
          </AppText>
        </View>
        <View style={styles.chips}>
          {word.source === 'mistake' && <Chip label="🎮" kind="neutral" small />}
          <GenderChip gender={word.gender} small />
          <Chip label={srsChip.label} kind={srsChip.kind} small />
        </View>
        <ListenButton text={`${spokenArticle}${word.lemma}`} size={20} />
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  row: { marginBottom: spacing.sm, paddingVertical: 13 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', gap: 6 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
});
