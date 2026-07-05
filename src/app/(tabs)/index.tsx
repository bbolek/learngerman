import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getWordOfTheDay } from '@/db/dictionaryRepo';
import { listTopics, type TopicRow } from '@/db/grammarRepo';
import { currentStreak, dueCounts, recentActivity, type DayActivity } from '@/db/srsRepo';
import { learnedCount, savedCount } from '@/db/vocabRepo';
import { pickNextTopic, type NextTopic } from '@/logic/nextTopic';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { fonts, radius, spacing, streakGradient } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface HomeData {
  streak: number;
  due: number;
  fresh: number;
  doneToday: number;
  saved: number;
  learned: number;
  week: DayActivity[];
  next: NextTopic<TopicRow> | null;
  wotd: Awaited<ReturnType<typeof getWordOfTheDay>>;
}

export default function HomeScreen() {
  const t = useTheme();
  const [data, setData] = useState<HomeData | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      Promise.all([
        currentStreak(now),
        dueCounts(now),
        recentActivity(7, now),
        savedCount(),
        learnedCount(),
        listTopics(),
        getWordOfTheDay(today),
      ]).then(([streak, counts, week, saved, learned, topics, wotd]) => {
        const doneToday = week.find((a) => a.day === today)?.reviews_done ?? 0;
        setData({
          streak,
          due: counts.due,
          fresh: counts.fresh,
          doneToday,
          saved,
          learned,
          week,
          next: pickNextTopic(topics, today),
          wotd,
        });
      });
    }, [])
  );

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 11 ? 'Guten Morgen! ☀️' : hour < 18 ? 'Guten Tag! 👋' : 'Guten Abend! 🌙';
  const dateLabel = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const pending = (data?.due ?? 0) + (data?.fresh ?? 0);
  const planned = pending + (data?.doneToday ?? 0);
  const progress = planned === 0 ? 1 : (data?.doneToday ?? 0) / planned;

  // Last 7 days for the streak card's weekday row (oldest → today).
  const byDay = new Map((data?.week ?? []).map((a) => [a.day, a]));
  const DAY_MS = 24 * 60 * 60 * 1000;
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const a = byDay.get(key);
    return {
      key,
      initial: d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2),
      active: ((a?.reviews_done ?? 0) + (a?.quiz_done ?? 0) + (a?.words_saved ?? 0)) > 0,
      isToday: i === 6,
    };
  });

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="title" style={{ fontSize: 26 }}>
            {greeting}
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            {dateLabel}
          </AppText>
        </View>
        <Pressable hitSlop={8} onPress={() => router.push('/stats')} style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Ionicons name="bar-chart-outline" size={20} color={t.inkMuted} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => router.push('/settings')} style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Ionicons name="settings-outline" size={20} color={t.inkMuted} />
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/stats')} style={[styles.streak, { backgroundColor: streakGradient[0] }]}>
        <View style={styles.streakTop}>
          <AppText style={{ fontSize: 30 }}>🔥</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="section" color="#fff">
              {data ? `${data.streak} ${data.streak === 1 ? 'Tag' : 'Tage'}` : '…'}
            </AppText>
            <AppText variant="secondary" color="#FFFFFFEB">
              Lernserie — weiter so!
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFFB0" />
        </View>
        <View style={styles.weekRow}>
          {weekDays.map((d) => (
            <View key={d.key} style={styles.weekCol}>
              <View
                style={[
                  styles.weekDot,
                  d.active
                    ? { backgroundColor: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF3C' },
                  d.isToday && { borderWidth: 2, borderColor: '#FFFFFF' },
                ]}>
                {d.active && <Ionicons name="checkmark" size={13} color={streakGradient[0]} />}
              </View>
              <AppText variant="caption" color={d.isToday ? '#FFFFFF' : '#FFFFFFB0'}>
                {d.initial}
              </AppText>
            </View>
          ))}
        </View>
      </Pressable>

      <Card style={styles.daily}>
        <ProgressRing progress={progress} size={86}>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 19 }}>
            {data ? `${data.doneToday}/${planned}` : '…'}
          </AppText>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">Heute fällig</AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            {pending === 0
              ? 'Alles geschafft für heute! 🎉'
              : `${data?.due ?? 0} fällig · ${data?.fresh ?? 0} neu`}
          </AppText>
          {pending > 0 ? (
            <Pressable
              onPress={() => router.push('/review')}
              style={[styles.cta, { backgroundColor: t.primary }]}>
              <AppText variant="secondary" color="#fff" style={{ fontFamily: fonts.extrabold }}>
                {pending} Karten üben →
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/dictionary')}
              style={[styles.cta, { backgroundColor: t.accentDim }]}>
              <AppText variant="secondary" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
                Neue Wörter entdecken →
              </AppText>
            </Pressable>
          )}
        </View>
      </Card>

      {data?.next && <GrammarCard next={data.next} />}

      <View style={styles.twoCol}>
        <Card style={styles.mini} onPress={() => router.push('/words')}>
          <View style={[styles.miniIcon, { backgroundColor: t.primaryDim }]}>
            <Ionicons name="heart" size={16} color={t.onPrimaryDim} />
          </View>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 24, marginTop: spacing.sm }}>
            {data?.saved ?? '…'}
          </AppText>
          <AppText variant="caption" muted>
            Meine Wörter
          </AppText>
        </Card>
        <Card style={styles.mini} onPress={() => router.push('/words')}>
          <View style={[styles.miniIcon, { backgroundColor: t.successDim }]}>
            <Ionicons name="checkmark-done" size={16} color={t.onSuccessDim} />
          </View>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 24, marginTop: spacing.sm }}>
            {data?.learned ?? '…'}
          </AppText>
          <AppText variant="caption" muted>
            Gelernt
          </AppText>
        </Card>
      </View>

      {data?.wotd && <WordOfTheDay wotd={data.wotd} />}
    </Screen>
  );
}

function GrammarCard({ next }: { next: NextTopic<TopicRow> }) {
  const t = useTheme();
  const { topic, reason, accuracy } = next;
  const pct = accuracy == null ? null : Math.round(accuracy * 100);
  const reasonText =
    reason === 'weak'
      ? `Dein schwächstes Thema · ${pct} % richtig`
      : reason === 'new'
        ? 'Heutige Empfehlung — noch nicht geübt'
        : `Zum Auffrischen · ${pct} % richtig`;
  return (
    <Card
      style={styles.grammar}
      onPress={() =>
        router.push({ pathname: '/quiz/[topicId]', params: { topicId: String(topic.id) } })
      }>
      <View style={styles.grammarHead}>
        <AppText variant="label" muted>
          Grammatik · Thema des Tages
        </AppText>
        <View style={[styles.levelBadge, { backgroundColor: t.caseChip }]}>
          <AppText variant="caption" color={t.onCaseChip} style={{ fontFamily: fonts.extrabold }}>
            {topic.level}
          </AppText>
        </View>
      </View>
      <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 21, marginTop: spacing.sm }}>
        {topic.title}
      </AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {reasonText}
      </AppText>
      {pct != null && (
        <View style={[styles.accTrack, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.accFill,
              {
                width: `${pct}%`,
                backgroundColor: accuracy != null && accuracy >= 0.7 ? t.accent : t.primary,
              },
            ]}
          />
        </View>
      )}
      <View style={styles.grammarFoot}>
        <View style={[styles.badge, { backgroundColor: t.primaryDim }]}>
          <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
            Jetzt üben →
          </AppText>
        </View>
        <Pressable hitSlop={8} onPress={() => router.push('/practice')}>
          <AppText variant="secondary" muted>
            Alle Themen
          </AppText>
        </Pressable>
      </View>
    </Card>
  );
}

function WordOfTheDay({ wotd }: { wotd: NonNullable<HomeData['wotd']> }) {
  const t = useTheme();
  const article =
    wotd.gender === 'm' ? 'der' : wotd.gender === 'f' ? 'die' : wotd.gender === 'n' ? 'das' : null;
  const articleColors =
    article === 'der'
      ? { bg: t.derChip, fg: t.onDerChip }
      : article === 'die'
        ? { bg: t.dieChip, fg: t.onDieChip }
        : { bg: t.dasChip, fg: t.onDasChip };
  return (
    <Card
      style={styles.wotd}
      onPress={() => router.push({ pathname: '/word/[id]', params: { id: String(wotd.id) } })}>
      <AppText variant="label" muted>
        Wort des Tages
      </AppText>
      <View style={styles.wotdRow}>
        {article && (
          <View style={[styles.articleChip, { backgroundColor: articleColors.bg }]}>
            <AppText variant="caption" color={articleColors.fg} style={{ fontFamily: fonts.extrabold }}>
              {article}
            </AppText>
          </View>
        )}
        <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 24 }}>
          {wotd.lemma}
        </AppText>
      </View>
      <AppText variant="secondary" muted>
        {wotd.gloss}
      </AppText>
      {wotd.example_de && (
        <View style={[styles.example, { borderLeftColor: t.primaryDim }]}>
          <AppText variant="secondary">{wotd.example_de}</AppText>
          {wotd.example_en && (
            <AppText variant="secondary" muted>
              {wotd.example_en}
            </AppText>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streak: {
    borderRadius: radius.card + 2,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF2E',
    paddingTop: spacing.md,
  },
  weekCol: { alignItems: 'center', gap: 4, minWidth: 26 },
  weekDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daily: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  cta: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  grammar: { marginTop: spacing.md },
  grammarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  accTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: spacing.sm },
  accFill: { height: '100%', borderRadius: 999 },
  grammarFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  twoCol: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  mini: { flex: 1 },
  miniIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  wotd: { marginTop: spacing.md },
  wotdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, marginBottom: 2 },
  articleChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  example: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    marginTop: spacing.sm,
    gap: 2,
  },
});
