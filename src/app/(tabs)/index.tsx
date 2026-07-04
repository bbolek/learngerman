import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getWordOfTheDay } from '@/db/dictionaryRepo';
import { currentStreak, dueCounts, recentActivity } from '@/db/srsRepo';
import { savedCount } from '@/db/vocabRepo';
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
  wotd: Awaited<ReturnType<typeof getWordOfTheDay>>;
}

export default function HomeScreen() {
  const t = useTheme();
  const [data, setData] = useState<HomeData | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      Promise.all([
        currentStreak(now),
        dueCounts(now),
        recentActivity(1, now),
        savedCount(),
        getWordOfTheDay(now.toISOString().slice(0, 10)),
      ]).then(([streak, counts, activity, saved, wotd]) => {
        const today = now.toISOString().slice(0, 10);
        const doneToday = activity.find((a) => a.day === today)?.reviews_done ?? 0;
        setData({ streak, due: counts.due, fresh: counts.fresh, doneToday, saved, wotd });
      });
    }, [])
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? 'Guten Morgen! ☀️' : hour < 18 ? 'Guten Tag! 👋' : 'Guten Abend! 🌙';
  const dateLabel = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const pending = (data?.due ?? 0) + (data?.fresh ?? 0);
  const planned = pending + (data?.doneToday ?? 0);
  const progress = planned === 0 ? 1 : (data?.doneToday ?? 0) / planned;

  return (
    <Screen>
      <AppText variant="title" style={{ fontSize: 26 }}>
        {greeting}
      </AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {dateLabel}
      </AppText>

      <View style={[styles.streak, { backgroundColor: streakGradient[0] }]}>
        <AppText style={{ fontSize: 30 }}>🔥</AppText>
        <View>
          <AppText variant="section" color="#fff">
            {data ? `${data.streak} ${data.streak === 1 ? 'Tag' : 'Tage'}` : '…'}
          </AppText>
          <AppText variant="secondary" color="#FFFFFFEB">
            Lernserie — weiter so!
          </AppText>
        </View>
      </View>

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
              ? 'Alles geschafft für heute!'
              : `${data?.due ?? 0} fällig · ${data?.fresh ?? 0} neu`}
          </AppText>
          {pending > 0 && (
            <Pressable
              onPress={() => router.push('/review')}
              style={[styles.cta, { backgroundColor: t.primary }]}>
              <AppText variant="secondary" color="#fff" style={{ fontFamily: fonts.extrabold }}>
                {pending} Karten üben →
              </AppText>
            </Pressable>
          )}
        </View>
      </Card>

      <View style={styles.twoCol}>
        <Card style={styles.mini} onPress={() => router.push('/practice')}>
          <AppText variant="label" muted>
            Grammatik
          </AppText>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 19, marginTop: 6 }}>
            Akkusativ &amp; Dativ
          </AppText>
          <View style={[styles.badge, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim}>
              Jetzt üben
            </AppText>
          </View>
        </Card>
        <Card style={styles.mini} onPress={() => router.push('/words')}>
          <AppText variant="label" muted>
            Meine Wörter
          </AppText>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 19, marginTop: 6 }}>
            {data?.saved ?? '…'}
          </AppText>
          <View style={[styles.badge, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim}>
              Ansehen
            </AppText>
          </View>
        </Card>
      </View>

      {data?.wotd && (
        <Card
          style={styles.wotd}
          onPress={() =>
            router.push({ pathname: '/word/[id]', params: { id: String(data.wotd!.id) } })
          }>
          <AppText variant="label" muted>
            Wort des Tages
          </AppText>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 22, marginTop: 6 }}>
            {data.wotd.gender === 'm' ? (
              <AppText color={t.success} style={{ fontFamily: fonts.serif, fontSize: 22 }}>der </AppText>
            ) : data.wotd.gender === 'f' ? (
              <AppText color={t.success} style={{ fontFamily: fonts.serif, fontSize: 22 }}>die </AppText>
            ) : data.wotd.gender === 'n' ? (
              <AppText color={t.success} style={{ fontFamily: fonts.serif, fontSize: 22 }}>das </AppText>
            ) : null}
            {data.wotd.lemma}
          </AppText>
          <AppText variant="secondary" muted>
            {data.wotd.gloss}
          </AppText>
          {data.wotd.example_de && (
            <AppText variant="secondary" style={{ marginTop: 6 }}>
              {data.wotd.example_de}{' '}
              {data.wotd.example_en && (
                <AppText variant="secondary" muted>
                  — {data.wotd.example_en}
                </AppText>
              )}
            </AppText>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.card + 2,
    padding: spacing.lg,
    marginTop: spacing.lg,
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
  twoCol: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  mini: { flex: 1 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
  wotd: { marginTop: spacing.md },
});
