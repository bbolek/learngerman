import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getLemmaImage, getWordOfTheDay } from '@/db/dictionaryRepo';
import { listTopics, type TopicRow } from '@/db/grammarRepo';
import { grammarDueSlugs } from '@/db/grammarSrsRepo';
import { dailyQuests, type DailyQuestState } from '@/db/questsRepo';
import { dueCounts, recentActivity, type DayActivity } from '@/db/srsRepo';
import {
  frozenDays,
  grantFreeze,
  lastCelebratedMilestone,
  repairStreak,
  setLastCelebratedMilestone,
  streakState,
  type StreakState,
} from '@/db/streakRepo';
import { savedCount } from '@/db/vocabRepo';
import { xpTotals } from '@/db/xpRepo';
import { pickNextTopic, type NextTopic } from '@/logic/nextTopic';
import { isStreakMilestone, levelProgress, levelTitle, type LevelProgress } from '@/logic/xp';
import { settleRewards } from '@/services/rewards';
import { celebrate } from '@/store/celebration';
import { TourTarget } from '@/tour/TourTarget';
import { useTourTarget } from '@/tour/useTourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, radius, spacing, streakGradient } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface HomeData {
  streakInfo: StreakState;
  frozen: Set<string>;
  level: LevelProgress;
  quests: DailyQuestState[];
  due: number;
  fresh: number;
  doneToday: number;
  saved: number;
  week: DayActivity[];
  next: NextTopic<TopicRow> | null;
  wotd: Awaited<ReturnType<typeof getWordOfTheDay>>;
  wotdImage: string | null;
}

export default function HomeScreen() {
  const t = useTheme();
  const [data, setData] = useState<HomeData | null>(null);
  const { ref: streakRef, onLayout: streakOnLayout } = useTourTarget('home-streak');

  const load = useCallback(async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Pay out anything earned since the last visit (quests finished off-screen,
    // badges crossed) before reading the state we render.
    await settleRewards(now);
    const streakInfo = await streakState(now); // may auto-spend freezes
    const [counts, week, saved, topics, wotd, dueSlugs, quests, totals, frozen] =
      await Promise.all([
        dueCounts(now),
        recentActivity(7, now),
        savedCount(),
        listTopics(),
        getWordOfTheDay(today),
        grammarDueSlugs(now),
        dailyQuests(now),
        xpTotals(),
        frozenDays(),
      ]);
    const doneToday = week.find((a) => a.day === today)?.reviews_done ?? 0;
    const wotdImage = wotd ? await getLemmaImage(wotd.id) : null;
    const topicsWithDue = topics.map((tp) => ({ ...tp, due: dueSlugs.has(tp.slug) }));

    // Streak milestone reached today → one-time celebration + a bonus freeze.
    if (isStreakMilestone(streakInfo.streak) && (await lastCelebratedMilestone()) < streakInfo.streak) {
      await setLastCelebratedMilestone(streakInfo.streak);
      const freezeGranted = await grantFreeze();
      if (freezeGranted) streakInfo.freezes += 1;
      celebrate({
        kind: 'streakMilestone',
        emoji: '🔥',
        title: `${streakInfo.streak} Tage am Stück!`,
        subtitle: freezeGranted ? 'Stark! · +1 Streak-Retter 🧊' : 'Weiter so!',
      });
    }

    setData({
      streakInfo,
      frozen,
      level: levelProgress(totals.lifetime),
      quests,
      due: counts.due,
      fresh: counts.fresh,
      doneToday,
      saved,
      week,
      next: pickNextTopic(topicsWithDue, today),
      wotd,
      wotdImage,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
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
      active:
        (a?.reviews_done ?? 0) + (a?.quiz_done ?? 0) + (a?.words_saved ?? 0) + (a?.games_played ?? 0) >
        0,
      frozen: data?.frozen.has(key) ?? false,
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
        <TourTarget id="home-header-icons" style={styles.headerIcons}>
          <Pressable hitSlop={8} onPress={() => router.push('/achievements')} style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="trophy-outline" size={20} color={t.inkMuted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/stats')} style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="bar-chart-outline" size={20} color={t.inkMuted} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/settings')} style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="settings-outline" size={20} color={t.inkMuted} />
          </Pressable>
        </TourTarget>
      </View>

      <Pressable
        ref={streakRef}
        onLayout={streakOnLayout}
        onPress={() => router.push('/stats')}
        style={[styles.streak, { backgroundColor: streakGradient[0] }]}>
        <View style={styles.streakTop}>
          <AppText style={{ fontSize: 30 }}>🔥</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="section" color="#fff">
              {data ? `${data.streakInfo.streak} ${data.streakInfo.streak === 1 ? 'Tag' : 'Tage'}` : '…'}
            </AppText>
            <AppText variant="secondary" color="#FFFFFFEB">
              Lernserie — weiter so!
            </AppText>
          </View>
          {data != null && data.streakInfo.freezes > 0 && (
            <View style={styles.freezeChip}>
              <AppText variant="caption" color="#fff" style={{ fontFamily: fonts.extrabold }}>
                🧊 ×{data.streakInfo.freezes}
              </AppText>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="#FFFFFFB0" />
        </View>
        <View style={styles.weekRow}>
          {weekDays.map((d) => (
            <View key={d.key} style={styles.weekCol}>
              <View
                style={[
                  styles.weekDot,
                  d.active || d.frozen
                    ? { backgroundColor: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF3C' },
                  d.isToday && { borderWidth: 2, borderColor: '#FFFFFF' },
                ]}>
                {d.frozen && !d.active ? (
                  <Ionicons name="snow" size={12} color="#4A6B99" />
                ) : d.active ? (
                  <Ionicons name="checkmark" size={13} color={streakGradient[0]} />
                ) : null}
              </View>
              <AppText variant="caption" color={d.isToday ? '#FFFFFF' : '#FFFFFFB0'}>
                {d.initial}
              </AppText>
            </View>
          ))}
        </View>
      </Pressable>

      {data?.streakInfo.justProtected && (
        <Card style={styles.noticeCard}>
          <AppText style={{ fontSize: 22 }}>🧊</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">Streak-Retter eingesetzt!</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {data.streakInfo.justProtected.length === 1
                ? 'Ein verpasster Tag wurde überbrückt — deine Serie lebt weiter.'
                : `${data.streakInfo.justProtected.length} verpasste Tage wurden überbrückt — deine Serie lebt weiter.`}
            </AppText>
          </View>
        </Card>
      )}

      {data?.streakInfo.repair && (
        <RepairCard repair={data.streakInfo.repair} onRepaired={load} />
      )}

      {data && <LevelCard level={data.level} />}

      {data && data.quests.length > 0 && <QuestsCard quests={data.quests} />}

      <TourTarget id="home-daily">
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
      </TourTarget>

      {data?.next && (
        <TourTarget id="home-grammar">
          <GrammarCard next={data.next} />
        </TourTarget>
      )}

      <Card style={styles.miniWide} onPress={() => router.push('/words')}>
        <View style={[styles.miniIcon, { backgroundColor: t.primaryDim }]}>
          <Ionicons name="heart" size={16} color={t.onPrimaryDim} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 24 }}>
            {data?.saved ?? '…'}
          </AppText>
          <AppText variant="caption" muted>
            Meine Wörter
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.inkFaint} />
      </Card>

      <Card style={styles.miniWide} onPress={() => router.push('/themes')}>
        <View style={[styles.themesIcon, { backgroundColor: t.accentDim }]}>
          <AppText style={{ fontSize: 20 }}>🗂️</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">Themen</AppText>
          <AppText variant="secondary" muted style={{ marginTop: 2 }}>
            Wortschatz nach Thema lernen
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.inkFaint} />
      </Card>

      {data?.wotd && (
        <TourTarget id="home-wotd">
          <WordOfTheDay wotd={data.wotd} image={data.wotdImage} />
        </TourTarget>
      )}
    </Screen>
  );
}

function LevelCard({ level }: { level: LevelProgress }) {
  const t = useTheme();
  return (
    <Card style={styles.levelCard} onPress={() => router.push('/stats')}>
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
          {level.span - level.into} XP bis Level {level.level + 1}
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
      <Ionicons name="chevron-forward" size={18} color={t.inkFaint} />
    </Card>
  );
}

function QuestsCard({ quests }: { quests: DailyQuestState[] }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: spacing.md }}>
      <View style={styles.questHead}>
        <AppText variant="label" muted>
          Tagesziele
        </AppText>
        <AppText variant="caption" muted>
          {quests.filter((q) => q.claimed).length}/{quests.length} geschafft
        </AppText>
      </View>
      <View style={{ marginTop: spacing.sm, gap: spacing.md }}>
        {quests.map((q) => {
          const ratio = q.target === 0 ? 1 : q.current / q.target;
          return (
            <View key={q.key} style={styles.questRow}>
              <View
                style={[
                  styles.questIcon,
                  { backgroundColor: q.claimed ? t.successDim : t.primaryDim },
                ]}>
                <AppText style={{ fontSize: 16 }}>{q.claimed ? '✅' : q.emoji}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.questTitleRow}>
                  <AppText
                    variant="secondary"
                    style={[{ flex: 1 }, q.claimed && { opacity: 0.55 }]}>
                    {q.title}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={q.claimed ? t.onSuccessDim : t.onPrimaryDim}
                    style={{ fontFamily: fonts.extrabold }}>
                    {q.claimed ? `+${q.xp} XP` : `${q.current}/${q.target}`}
                  </AppText>
                </View>
                <View style={[styles.questTrack, { backgroundColor: t.line }]}>
                  <View
                    style={[
                      styles.questFill,
                      {
                        width: `${Math.round(Math.min(1, ratio) * 100)}%`,
                        backgroundColor: q.claimed ? t.success : t.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function RepairCard({
  repair,
  onRepaired,
}: {
  repair: NonNullable<StreakState['repair']>;
  onRepaired: () => Promise<void>;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const doRepair = async () => {
    if (busy) return;
    setBusy(true);
    const revived = await repairStreak(new Date()).catch(() => null);
    if (revived != null) {
      celebrate({
        kind: 'streakMilestone',
        emoji: '🔥',
        title: 'Serie gerettet!',
        subtitle: `Deine ${revived}-Tage-Serie lebt weiter.`,
      });
    }
    await onRepaired();
    setBusy(false);
  };
  return (
    <Card style={styles.noticeCard}>
      <AppText style={{ fontSize: 22 }}>💔</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="subtitle">Deine {repair.lostStreak}-Tage-Serie ist gerissen</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {repair.affordable
            ? `Nur heute: repariere gestern für ${repair.cost} XP.`
            : `Mit ${repair.cost} XP könntest du sie retten — dir fehlen noch ein paar.`}
        </AppText>
        {repair.affordable && (
          <Pressable
            disabled={busy}
            onPress={doRepair}
            style={[styles.repairBtn, { backgroundColor: t.primary, opacity: busy ? 0.6 : 1 }]}>
            <AppText variant="secondary" color="#fff" style={{ fontFamily: fonts.extrabold }}>
              Serie reparieren · {repair.cost} XP
            </AppText>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function GrammarCard({ next }: { next: NextTopic<TopicRow> }) {
  const t = useTheme();
  const { topic, reason, accuracy } = next;
  const pct = accuracy == null ? null : Math.round(accuracy * 100);
  const reasonText =
    reason === 'due'
      ? pct != null
        ? `Fällig zur Wiederholung · ${pct} % richtig`
        : 'Fällig zur Wiederholung'
      : reason === 'weak'
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

function WordOfTheDay({
  wotd,
  image,
}: {
  wotd: NonNullable<HomeData['wotd']>;
  image: string | null;
}) {
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
      <View style={styles.wotdBody}>
        <View style={{ flex: 1 }}>
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
        </View>
        {image && <VocabImage svg={image} gender={wotd.gender} size={64} />}
      </View>
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
  headerIcons: { flexDirection: 'row', gap: 10 },
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
  freezeChip: {
    backgroundColor: '#FFFFFF2E',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  repairBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  xpTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: spacing.sm },
  xpFill: { height: '100%', borderRadius: 999 },
  questHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  questIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questTrack: { height: 5, borderRadius: 999, overflow: 'hidden', marginTop: 5 },
  questFill: { height: '100%', borderRadius: 999 },
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
  miniWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  miniIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themesIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  wotdBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wotdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, marginBottom: 2 },
  articleChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  example: {
    borderLeftWidth: 3,
    paddingLeft: spacing.md,
    marginTop: spacing.sm,
    gap: 2,
  },
});
