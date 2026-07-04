import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listTopics, topicAccuracy, type TopicRow } from '@/db/grammarRepo';
import { dueCounts } from '@/db/srsRepo';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function PracticeScreen() {
  const t = useTheme();
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [due, setDue] = useState({ due: 0, fresh: 0 });

  useFocusEffect(
    useCallback(() => {
      listTopics().then(setTopics);
      dueCounts(new Date()).then(setDue);
    }, [])
  );

  const pending = due.due + due.fresh;

  return (
    <Screen>
      <AppText variant="section">Üben</AppText>

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

      <AppText variant="label" muted style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        Grammatik · Fälle
      </AppText>
      <View style={styles.grid}>
        {topics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </View>
    </Screen>
  );
}

function TopicCard({ topic }: { topic: TopicRow }) {
  const t = useTheme();
  const accuracy = topicAccuracy(topic);
  return (
    <Card
      style={styles.topic}
      onPress={() => router.push({ pathname: '/quiz/[topicId]', params: { topicId: String(topic.id) } })}>
      <ProgressRing
        progress={accuracy ?? 0}
        size={54}
        strokeWidth={6}
        color={accuracy != null && accuracy >= 0.7 ? t.accent : t.primary}>
        <AppText variant="caption" color={accuracy != null && accuracy >= 0.7 ? t.onAccentDim : t.onPrimaryDim}>
          {accuracy == null ? '–' : `${Math.round(accuracy * 100)}%`}
        </AppText>
      </ProgressRing>
      <AppText variant="subtitle" style={{ marginTop: spacing.md, fontSize: 16 }}>
        {topic.title}
      </AppText>
      <AppText variant="caption" muted style={{ marginTop: 2 }}>
        {topic.question_count} Fragen
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  topic: { width: '47.5%', flexGrow: 1 },
});
