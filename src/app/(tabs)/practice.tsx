import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listTopics, type TopicRow } from '@/db/grammarRepo';
import { grammarDueSlugs } from '@/db/grammarSrsRepo';
import { dueCounts } from '@/db/srsRepo';
import { useTr, type TranslationKey } from '@/i18n';
import { withinLevel } from '@/logic/levels';
import { useSettings } from '@/store/settings';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { SearchBar } from '@/ui/components/SearchBar';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const LEVEL_SECTIONS: { level: TopicRow['level']; labelKey: TranslationKey }[] = [
  { level: 'A1', labelKey: 'practice.level.A1' },
  { level: 'A2', labelKey: 'practice.level.A2' },
  { level: 'B1', labelKey: 'practice.level.B1' },
  { level: 'B2', labelKey: 'practice.level.B2' },
  { level: 'C1', labelKey: 'practice.level.C1' },
  { level: 'C2', labelKey: 'practice.level.C2' },
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
  const tr = useTr();
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [due, setDue] = useState({ due: 0, fresh: 0 });
  const [dueSlugs, setDueSlugs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const userLevel = useSettings((s) => s.userLevel);

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
      <AppText variant="section">{tr('practice.title')}</AppText>

      <TourTarget id="practice-cards">
        <Card style={[styles.flashcards, { backgroundColor: t.primary }]} onPress={() => router.push('/review')}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle" color="#fff">
              {tr('practice.flashcards')}
            </AppText>
            <AppText variant="secondary" color="#FFFFFFDD" style={{ marginTop: 2 }}>
              {pending > 0
                ? tr('practice.flashcards.pending', { count: pending })
                : tr('practice.flashcards.none')}
            </AppText>
          </View>
          <Ionicons name="arrow-forward-circle" size={34} color="#fff" />
        </Card>
      </TourTarget>

      <Card style={styles.themes} onPress={() => router.push('/themes')}>
        <View style={[styles.themesIcon, { backgroundColor: t.accentDim }]}>
          <AppText style={{ fontSize: 20 }}>🗂️</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">{tr('practice.themes')}</AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            {tr('practice.themes.caption')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.inkFaint} />
      </Card>

      <Card style={styles.themes} onPress={() => router.push('/lesen')}>
        <View style={[styles.themesIcon, { backgroundColor: t.primaryDim }]}>
          <AppText style={{ fontSize: 20 }}>📖</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">{tr('practice.reading')}</AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            {tr('practice.reading.caption')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.inkFaint} />
      </Card>

      <AppText variant="label" muted style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {dueSlugs.size > 0
          ? tr('practice.grammar.due', { count: dueSlugs.size })
          : tr('practice.grammar')}
      </AppText>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={tr('practice.searchPlaceholder')}
      />

      {LEVEL_SECTIONS.map(({ level, labelKey }) => {
        // Browsing stays at the user's Sprachniveau; an explicit search
        // still finds topics of every level.
        if (query.trim().length === 0 && !withinLevel(level, userLevel)) return null;
        const sectionTopics = filtered.filter((topic) => topic.level === level);
        if (sectionTopics.length === 0) return null;
        return (
          <View key={level}>
            <AppText variant="label" muted style={styles.levelHeader}>
              {tr(labelKey)}
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
            {tr('practice.empty.title')}
          </AppText>
          <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 4 }}>
            {tr('practice.empty.body')}
          </AppText>
        </View>
      )}
    </Screen>
  );
}

function TopicCard({ topic, due }: { topic: TopicRow; due: boolean }) {
  const t = useTheme();
  const tr = useTr();
  // Coverage of the topic (questions ever mastered), not accuracy — a few
  // perfect answers on a 48-question topic shouldn't read as "100% done".
  const progress = topic.question_count > 0 ? topic.mastered_count / topic.question_count : 0;
  const mastered = topic.question_count > 0 && topic.mastered_count === topic.question_count;
  return (
    <Card
      style={styles.topic}
      onPress={() => router.push({ pathname: '/quiz/[topicId]', params: { topicId: String(topic.id) } })}>
      <View style={styles.topicTop}>
        <ProgressRing
          progress={progress}
          size={54}
          strokeWidth={6}
          color={progress >= 0.7 ? t.accent : t.primary}>
          <AppText variant="caption" color={progress >= 0.7 ? t.onAccentDim : t.onPrimaryDim}>
            {topic.attempts === 0 ? '–' : `${Math.round(progress * 100)}%`}
          </AppText>
        </ProgressRing>
        {due ? (
          <Chip label={tr('practice.chip.due')} kind="due" small />
        ) : mastered ? (
          <Chip label={tr('practice.chip.mastered')} kind="new" small />
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
        {tr('practice.topic.questions', { count: topic.question_count })}
        {topic.vocab_count > 0
          ? ` · ${tr('practice.topic.words', { count: topic.vocab_count })}`
          : ''}
        {topic.attempts > 0
          ? ` · ${tr('practice.topic.attempts', { count: topic.attempts })}`
          : ''}
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
  themes: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  themesIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
