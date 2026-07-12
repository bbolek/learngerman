import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listTopics, topicAccuracy, type TopicRow } from '@/db/grammarRepo';
import { grammarDueSlugs } from '@/db/grammarSrsRepo';
import { dueCounts } from '@/db/srsRepo';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { SearchBar } from '@/ui/components/SearchBar';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const LEVEL_SECTIONS: { level: TopicRow['level']; label: string }[] = [
  { level: 'A1', label: 'A1 · Grundlagen' },
  { level: 'A2', label: 'A2 · Aufbau' },
  { level: 'B1', label: 'B1 · Fortgeschritten' },
];

/** Lowercase + fold umlauts so "prasens" finds "Präsens". */
function searchFold(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ä', 'a')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ß', 's');
}

export default function PracticeScreen() {
  const t = useTheme();
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [due, setDue] = useState({ due: 0, fresh: 0 });
  const [dueSlugs, setDueSlugs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      listTopics().then(setTopics);
      dueCounts(new Date()).then(setDue);
      grammarDueSlugs(new Date()).then(setDueSlugs);
    }, [])
  );

  const filtered = useMemo(() => {
    const q = searchFold(query.trim());
    if (!q) return topics;
    return topics.filter(
      (topic) =>
        searchFold(topic.title).includes(q) ||
        searchFold(topic.slug).includes(q) ||
        searchFold(topic.level).includes(q)
    );
  }, [topics, query]);

  const pending = due.due + due.fresh;

  return (
    <Screen>
      <AppText variant="section">Üben</AppText>

      <TourTarget id="practice-cards">
        <Card style={[styles.flashcards, { backgroundColor: t.primary }]} onPress={() => router.push('/review')}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle" color="#fff">
              Karteikarten 🃏
            </AppText>
            <AppText variant="secondary" color="#FFFFFFDD" style={{ marginTop: 2 }}>
              {pending > 0
                ? `${pending} Karten warten auf dich`
                : 'Keine Karten fällig — super!'}
            </AppText>
          </View>
          <Ionicons name="arrow-forward-circle" size={34} color="#fff" />
        </Card>
      </TourTarget>

      <AppText variant="label" muted style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {dueSlugs.size > 0 ? `Grammatik · ${dueSlugs.size} fällig` : 'Grammatik'}
      </AppText>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Thema suchen…" />

      {LEVEL_SECTIONS.map(({ level, label }) => {
        const sectionTopics = filtered.filter((topic) => topic.level === level);
        if (sectionTopics.length === 0) return null;
        return (
          <View key={level}>
            <AppText variant="label" muted style={styles.levelHeader}>
              {label}
            </AppText>
            <View style={styles.grid}>
              {sectionTopics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} due={dueSlugs.has(topic.slug)} />
              ))}
            </View>
          </View>
        );
      })}

      {query.trim().length > 0 && filtered.length === 0 && (
        <View style={styles.empty}>
          <AppText variant="subtitle" muted style={{ textAlign: 'center' }}>
            Keine Themen gefunden
          </AppText>
          <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 4 }}>
            Versuch es z. B. mit „Dativ“ oder „Perfekt“.
          </AppText>
        </View>
      )}
    </Screen>
  );
}

function TopicCard({ topic, due }: { topic: TopicRow; due: boolean }) {
  const t = useTheme();
  const accuracy = topicAccuracy(topic);
  return (
    <Card
      style={styles.topic}
      onPress={() => router.push({ pathname: '/quiz/[topicId]', params: { topicId: String(topic.id) } })}>
      <View style={styles.topicTop}>
        <ProgressRing
          progress={accuracy ?? 0}
          size={54}
          strokeWidth={6}
          color={accuracy != null && accuracy >= 0.7 ? t.accent : t.primary}>
          <AppText variant="caption" color={accuracy != null && accuracy >= 0.7 ? t.onAccentDim : t.onPrimaryDim}>
            {accuracy == null ? '–' : `${Math.round(accuracy * 100)}%`}
          </AppText>
        </ProgressRing>
        {due ? (
          <Chip label="Fällig" kind="due" small />
        ) : (
          <View style={[styles.levelBadge, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              {topic.level}
            </AppText>
          </View>
        )}
      </View>
      <AppText variant="subtitle" style={{ marginTop: spacing.md, fontSize: 16 }}>
        {topic.title}
      </AppText>
      <AppText variant="caption" muted style={{ marginTop: 2 }}>
        {topic.question_count} Fragen
        {topic.vocab_count > 0 ? ` · ${topic.vocab_count} Wörter` : ''}
        {topic.attempts > 0 ? ` · ${topic.attempts} geübt` : ''}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flashcards: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 0,
  },
  levelHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  topic: { width: '47.5%', flexGrow: 1 },
  topicTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  levelBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  empty: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
