import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { unlockedCount } from '@/db/achievementsRepo';
import { listTopics, topicAccuracy, type TopicRow } from '@/db/grammarRepo';
import { currentStreak, recentActivity, upcomingDueDates, type DayActivity } from '@/db/srsRepo';
import { savedCount } from '@/db/vocabRepo';
import { xpTotals } from '@/db/xpRepo';
import { ACHIEVEMENTS } from '@/logic/achievements';
import {
  bucketDueDates,
  buildHeatmap,
  dayKeyOf,
  FORECAST_DAYS,
  forecastLabel,
  HEATMAP_WEEKS,
  type ForecastDay,
  type HeatWeek,
} from '@/logic/heatmap';
import { levelProgress, levelTitle, type LevelProgress } from '@/logic/xp';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const DAYS = 14;
const HEAT_DAYS = HEATMAP_WEEKS * 7;

export default function StatsScreen() {
  const t = useTheme();
  const [streak, setStreak] = useState(0);
  const [activity, setActivity] = useState<DayActivity[]>([]);
  const [saved, setSaved] = useState(0);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [level, setLevel] = useState<LevelProgress | null>(null);
  const [totalXp, setTotalXp] = useState(0);
  const [badges, setBadges] = useState(0);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const nowDate = new Date(now);
    currentStreak(nowDate).then(setStreak);
    recentActivity(HEAT_DAYS, nowDate).then(setActivity);
    upcomingDueDates(nowDate, FORECAST_DAYS).then((dates) =>
      setForecast(bucketDueDates(dates, nowDate))
    );
    savedCount().then(setSaved);
    listTopics().then(setTopics);
    xpTotals().then((tot) => {
      setTotalXp(tot.lifetime);
      setLevel(levelProgress(tot.lifetime));
    });
    unlockedCount().then(setBadges);
  }, [now]);

  const dayTotal = (a: DayActivity) =>
    a.reviews_done +
    a.quiz_done +
    a.games_played +
    a.words_saved +
    (a.texts_read ?? 0) +
    (a.path_lessons_done ?? 0);
  const heatmap = buildHeatmap(
    new Map(activity.map((a) => [a.day, dayTotal(a)])),
    new Date(now)
  );
  const twoWeeksAgo = new Date(now - DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recent = activity.filter((a) => a.day >= twoWeeksAgo);
  const totalReviews = recent.reduce((sum, a) => sum + a.reviews_done, 0);
  const totalQuiz = recent.reduce((sum, a) => sum + a.quiz_done, 0);
  const totalGames = recent.reduce((sum, a) => sum + a.games_played, 0);
  const forecastMax = Math.max(1, ...forecast.map((d) => d.count));
  const forecastTotal = forecast.reduce((sum, d) => sum + d.count, 0);

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
        <AppText variant="subtitle">Aktivität · letzte {HEATMAP_WEEKS} Wochen</AppText>
        <View style={styles.heatRow}>
          <View style={styles.heatLabels}>
            {['Mo', 'Mi', 'Fr'].map((label, i) => (
              <AppText
                key={label}
                variant="caption"
                muted
                style={[styles.heatLabel, { top: i * 2 * (HEAT_CELL + HEAT_GAP) - 1 }]}>
                {label}
              </AppText>
            ))}
          </View>
          <View style={styles.heatGrid}>
            {heatmap.map((week, w) => (
              <HeatColumn key={w} week={week} />
            ))}
          </View>
        </View>
        <View style={styles.chartLabels}>
          <AppText variant="caption" muted>
            vor {HEATMAP_WEEKS} Wochen
          </AppText>
          <AppText variant="caption" muted>
            heute
          </AppText>
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <AppText variant="subtitle">Fällige Karten · nächste {FORECAST_DAYS} Tage</AppText>
        {forecastTotal === 0 ? (
          <AppText variant="secondary" muted style={{ marginTop: spacing.md }}>
            Nichts fällig — alle Karten sind gelernt. 🎉
          </AppText>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {forecast.map((d) => (
              <View key={d.day} style={styles.forecastRow}>
                <AppText variant="caption" muted style={styles.forecastLabel}>
                  {forecastLabel(d.day, dayKeyOf(new Date(now)))}
                </AppText>
                <View style={[styles.forecastTrack, { backgroundColor: t.line }]}>
                  <View
                    style={[
                      styles.forecastFill,
                      {
                        width: `${Math.round((d.count / forecastMax) * 100)}%`,
                        backgroundColor: d.day === dayKeyOf(new Date(now)) ? t.primary : t.accent,
                      },
                    ]}
                  />
                </View>
                <AppText variant="caption" style={styles.forecastCount}>
                  {d.count}
                </AppText>
              </View>
            ))}
          </View>
        )}
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

const HEAT_CELL = 13;
const HEAT_GAP = 3;

/** One heatmap week column; extracted so the cell colors can use the theme hook. */
function HeatColumn({ week }: { week: HeatWeek }) {
  const t = useTheme();
  const colorFor = (level: number) => {
    if (level === 0) return { backgroundColor: t.line, opacity: 0.6 };
    if (level === 1) return { backgroundColor: t.primaryDim, opacity: 1 };
    if (level === 2) return { backgroundColor: t.primary, opacity: 0.55 };
    return { backgroundColor: t.primary, opacity: 1 };
  };
  return (
    <View style={styles.heatCol}>
      {week.map((day, i) =>
        day == null ? (
          <View key={i} style={styles.heatCell} />
        ) : (
          <View key={i} style={[styles.heatCell, colorFor(day.level)]} />
        )
      )}
    </View>
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
  heatRow: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  heatLabels: { width: 20, position: 'relative' },
  heatLabel: { position: 'absolute', left: 0 },
  heatGrid: { flex: 1, flexDirection: 'row', gap: HEAT_GAP, justifyContent: 'space-between' },
  heatCol: { gap: HEAT_GAP },
  heatCell: { width: HEAT_CELL, height: HEAT_CELL, borderRadius: 3.5 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  forecastLabel: { width: 48 },
  forecastTrack: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  forecastFill: { height: '100%', borderRadius: 999 },
  forecastCount: { width: 34, textAlign: 'right', fontFamily: fonts.extrabold },
  accRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  accTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  accFill: { height: '100%', borderRadius: 999 },
});
