import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { unlockedCount } from '@/db/achievementsRepo';
import { listTopics, topicAccuracy, type TopicRow } from '@/db/grammarRepo';
import { currentStreak, recentActivity, type DayActivity } from '@/db/srsRepo';
import { savedCount } from '@/db/vocabRepo';
import { xpTotals } from '@/db/xpRepo';
import { ACHIEVEMENTS } from '@/logic/achievements';
import { levelProgress, levelTitle, type LevelProgress } from '@/logic/xp';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const DAYS = 14;

export default function StatsScreen() {
  const t = useTheme();
  const [streak, setStreak] = useState(0);
  const [activity, setActivity] = useState<DayActivity[]>([]);
  const [saved, setSaved] = useState(0);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [level, setLevel] = useState<LevelProgress | null>(null);
  const [totalXp, setTotalXp] = useState(0);
  const [badges, setBadges] = useState(0);

  useEffect(() => {
    const now = new Date();
    currentStreak(now).then(setStreak);
    recentActivity(DAYS, now).then(setActivity);
    savedCount().then(setSaved);
    listTopics().then(setTopics);
    xpTotals().then((tot) => {
      setTotalXp(tot.lifetime);
      setLevel(levelProgress(tot.lifetime));
    });
    unlockedCount().then(setBadges);
  }, []);

  const byDay = new Map(activity.map((a) => [a.day, a]));
  const days: { day: string; total: number; reviews: number }[] = [];
  const now = Date.now();
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const a = byDay.get(day);
    days.push({
      day,
      reviews: a?.reviews_done ?? 0,
      total: (a?.reviews_done ?? 0) + (a?.quiz_done ?? 0) + (a?.games_played ?? 0),
    });
  }
  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const totalReviews = activity.reduce((sum, a) => sum + a.reviews_done, 0);
  const totalQuiz = activity.reduce((sum, a) => sum + a.quiz_done, 0);
  const totalGames = activity.reduce((sum, a) => sum + a.games_played, 0);

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="title">Fortschritt</AppText>

      {level && (
        <Card style={styles.levelCard}>
          <ProgressRing progress={level.ratio} size={62} strokeWidth={6} color={t.accent}>
            <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 20 }}>
              {level.level}
            </AppText>
          </ProgressRing>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">
              Level {level.level} · {levelTitle(level.level)}
            </AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {totalXp} XP gesamt · noch {level.span - level.into} XP bis Level {level.level + 1}
            </AppText>
            <View style={[styles.xpTrack, { backgroundColor: t.line }]}>
              <View
                style={[
                  styles.xpFill,
                  { width: `${Math.round(level.ratio * 100)}%`, backgroundColor: t.accent },
                ]}
              />
            </View>
          </View>
        </Card>
      )}

      <Card style={styles.badgeCard} onPress={() => router.push('/achievements')}>
        <AppText style={{ fontSize: 22 }}>🏅</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">Abzeichen</AppText>
          <AppText variant="caption" muted style={{ marginTop: 2 }}>
            {badges} von {ACHIEVEMENTS.length} freigeschaltet
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.inkMuted} />
      </Card>

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>🔥</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {streak}
          </AppText>
          <AppText variant="caption" muted>
            Tage-Serie
          </AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>📖</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {saved}
          </AppText>
          <AppText variant="caption" muted>
            Wörter
          </AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>✅</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {totalReviews + totalQuiz + totalGames}
          </AppText>
          <AppText variant="caption" muted>
            Übungen (14 T.)
          </AppText>
        </Card>
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <AppText variant="subtitle">Aktivität · letzte {DAYS} Tage</AppText>
        <View style={styles.chart}>
          {days.map((d) => {
            const isToday = d.day === new Date().toISOString().slice(0, 10);
            const h = d.total === 0 ? 3 : Math.max(6, Math.round((d.total / maxTotal) * 84));
            return (
              <View key={d.day} style={styles.barCol}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: h,
                      backgroundColor: d.total === 0 ? t.line : isToday ? t.primary : t.primaryDim,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.chartLabels}>
          <AppText variant="caption" muted>
            vor {DAYS} Tagen
          </AppText>
          <AppText variant="caption" muted>
            heute
          </AppText>
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <AppText variant="subtitle">Grammatik-Genauigkeit</AppText>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          {topics.map((topic) => {
            const acc = topicAccuracy(topic);
            return (
              <View key={topic.id}>
                <View style={styles.accRow}>
                  <AppText variant="secondary" style={{ flex: 1 }}>
                    {topic.title}
                  </AppText>
                  <AppText variant="secondary" muted>
                    {acc == null ? 'noch nicht geübt' : `${Math.round(acc * 100)}%`}
                  </AppText>
                </View>
                <View style={[styles.accTrack, { backgroundColor: t.line }]}>
                  <View
                    style={[
                      styles.accFill,
                      {
                        width: `${Math.round((acc ?? 0) * 100)}%`,
                        backgroundColor: acc != null && acc >= 0.7 ? t.accent : t.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  xpTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: spacing.sm },
  xpFill: { height: '100%', borderRadius: 999 },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  tile: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 90,
    marginTop: spacing.md,
  },
  barCol: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  chartBar: { borderRadius: 4 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  accRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  accTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  accFill: { height: '100%', borderRadius: 999 },
});
