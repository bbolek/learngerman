import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { getLemmaImage, getWordOfTheDay } from '@/db/dictionaryRepo';
import { statsByGame, type GameStats } from '@/db/gamesRepo';
import { listTopics, type TopicRow } from '@/db/grammarRepo';
import { grammarDueSlugs } from '@/db/grammarSrsRepo';
import { getPlacement, listPath } from '@/db/pathRepo';
import { dailyQuests, type DailyQuestState } from '@/db/questsRepo';
import { listReadingTexts } from '@/db/readingRepo';
import { dueCounts, recentActivity } from '@/db/srsRepo';
import {
  grantFreeze,
  lastCelebratedMilestone,
  repairStreak,
  setLastCelebratedMilestone,
  streakState,
  type StreakState,
} from '@/db/streakRepo';
import { savedCount } from '@/db/vocabRepo';
import { xpTotals } from '@/db/xpRepo';
import { THEMES, type Theme } from '@/data/themes.generated';
import { GAMES, gameInfo, type GameKey } from '@/logic/games';
import {
  buildResumeShelf,
  lastPlayedGame,
  nextUnreadText,
  pickDailyTheme,
  pickHeroAction,
  type HeroAction,
  type ResumeItem,
} from '@/logic/homeFeed';
import { pickNextTopic, type NextTopic } from '@/logic/nextTopic';
import { findPathResume, resolveBoundaryOrder } from '@/logic/pathResume';
import { isStreakMilestone, levelProgress, levelTitle, type LevelProgress } from '@/logic/xp';
import { settleRewards } from '@/services/rewards';
import { celebrate } from '@/store/celebration';
import { TourTarget } from '@/tour/TourTarget';
import { useTourTarget } from '@/tour/useTourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Screen } from '@/ui/components/Screen';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { Shelf } from '@/ui/components/Shelf';
import { StatChip } from '@/ui/components/StatChip';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface HomeData {
  streakInfo: StreakState;
  level: LevelProgress;
  quests: DailyQuestState[];
  due: number;
  fresh: number;
  doneToday: number;
  saved: number;
  topicsCount: number;
  next: NextTopic<TopicRow> | null;
  wotd: Awaited<ReturnType<typeof getWordOfTheDay>>;
  wotdImage: string | null;
  hero: HeroAction;
  resume: ResumeItem[];
  gameStats: Map<GameKey, GameStats>;
  readingRead: number;
  readingTotal: number;
  themeTip: Theme | null;
}

/** Staggered entrance for the top-level blocks — subtle, mount-only. */
function blockEntering(i: number) {
  return FadeInUp.delay(i * 60).duration(400);
}

export default function HomeScreen() {
  const t = useTheme();
  const [data, setData] = useState<HomeData | null>(null);
  const { ref: streakRef, onLayout: streakOnLayout } = useTourTarget('home-streak');
  const { width: winW } = useWindowDimensions();
  const shelfW = Math.min(280, Math.round(winW * 0.72));

  const load = useCallback(async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Pay out anything earned since the last visit (quests finished off-screen,
    // badges crossed) before reading the state we render.
    await settleRewards(now);
    const streakInfo = await streakState(now); // may auto-spend freezes
    const [
      counts,
      week,
      saved,
      topics,
      wotd,
      dueSlugs,
      quests,
      totals,
      gameStats,
      readingTexts,
      pathUnits,
      placement,
    ] = await Promise.all([
      dueCounts(now),
      recentActivity(1, now),
      savedCount(),
      listTopics(),
      getWordOfTheDay(today),
      grammarDueSlugs(now),
      dailyQuests(now),
      xpTotals(),
      statsByGame(),
      listReadingTexts(),
      listPath(),
      getPlacement(),
    ]);
    const doneToday = week.find((a) => a.day === today)?.reviews_done ?? 0;
    const wotdImage = wotd ? await getLemmaImage(wotd.id) : null;
    const topicsWithDue = topics.map((tp) => ({ ...tp, due: dueSlugs.has(tp.slug) }));

    const pathNext = findPathResume(pathUnits, resolveBoundaryOrder(pathUnits, placement));
    const hero = pickHeroAction(counts.due, counts.fresh, pathNext);
    const nextReading = nextUnreadText(readingTexts);
    const resume = buildResumeShelf({
      hero,
      due: counts.due,
      fresh: counts.fresh,
      pathNext,
      nextReading,
      lastGame: lastPlayedGame(gameStats),
    });

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
      level: levelProgress(totals.lifetime),
      quests,
      due: counts.due,
      fresh: counts.fresh,
      doneToday,
      saved,
      topicsCount: topics.length,
      next: pickNextTopic(topicsWithDue, today),
      wotd,
      wotdImage,
      hero,
      resume,
      gameStats,
      readingRead: readingTexts.filter((r) => r.completed_at != null).length,
      readingTotal: readingTexts.length,
      themeTip: pickDailyTheme(THEMES, today),
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

      {data && (
        <>
          <Animated.View entering={blockEntering(0)}>
            <View
              ref={streakRef}
              onLayout={streakOnLayout}
              collapsable={false}
              style={styles.chipRow}>
              <StatChip
                emoji="🔥"
                label={`${data.streakInfo.streak} ${data.streakInfo.streak === 1 ? 'Tag' : 'Tage'}${
                  data.streakInfo.freezes > 0 ? ` · 🧊×${data.streakInfo.freezes}` : ''
                }`}
                onPress={() => router.push('/stats')}
              />
              <StatChip
                emoji="⭐"
                label={`Lv ${data.level.level} · ${levelTitle(data.level.level)}`}
                onPress={() => router.push('/stats')}
              />
            </View>
          </Animated.View>

          {data.streakInfo.justProtected && (
            <Animated.View entering={blockEntering(1)}>
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
            </Animated.View>
          )}

          {data.streakInfo.repair && (
            <Animated.View entering={blockEntering(1)}>
              <RepairCard repair={data.streakInfo.repair} onRepaired={load} />
            </Animated.View>
          )}

          <Animated.View entering={blockEntering(2)}>
            <TourTarget id="home-daily">
              <HeroCard
                hero={data.hero}
                due={data.due}
                fresh={data.fresh}
                doneToday={data.doneToday}
                quests={data.quests}
              />
            </TourTarget>
          </Animated.View>

          {data.resume.length > 0 && (
            <Animated.View entering={blockEntering(3)}>
              <SectionHeader title="Weiter lernen" onAction={() => router.push('/path')} />
              <Shelf cardWidth={shelfW}>
                {data.resume.map((item) => (
                  <ResumeCard key={item.kind} item={item} width={shelfW} />
                ))}
              </Shelf>
            </Animated.View>
          )}

          <Animated.View entering={blockEntering(4)}>
            <TourTarget id="home-grammar">
              <SectionHeader title="Entdecken" onAction={() => router.push('/dictionary')} />
              <Shelf cardWidth={shelfW}>
                {data.wotd && (
                  <TourTarget id="home-wotd">
                    <WotdCard wotd={data.wotd} image={data.wotdImage} width={shelfW} />
                  </TourTarget>
                )}
                {data.next && <GrammarCard next={data.next} width={shelfW} />}
                {data.themeTip && <ThemeCard theme={data.themeTip} width={shelfW} />}
              </Shelf>
            </TourTarget>
          </Animated.View>

          <Animated.View entering={blockEntering(5)}>
            <SectionHeader title="Spiele" onAction={() => router.push('/games')} />
            <Shelf cardWidth={120}>
              {GAMES.map((g) => (
                <GameTile key={g.key} gameKey={g.key} stats={data.gameStats.get(g.key) ?? null} />
              ))}
              <GameTile gameKey={null} stats={null} />
            </Shelf>
          </Animated.View>

          <Animated.View entering={blockEntering(6)}>
            <SectionHeader title="Deine Sammlung" />
            <View style={styles.collectionGrid}>
              <CollectionCard
                emoji="❤️"
                title="Meine Wörter"
                caption={`${data.saved} gespeichert`}
                onPress={() => router.push('/words')}
              />
              <CollectionCard
                emoji="🗂️"
                title="Themen"
                caption={`${THEMES.length} Wortfelder`}
                onPress={() => router.push('/themes')}
              />
              {data.readingTotal > 0 && (
                <CollectionCard
                  emoji="📖"
                  title="Leseecke"
                  caption={`${data.readingRead}/${data.readingTotal} gelesen`}
                  onPress={() => router.push('/lesen')}
                />
              )}
              <CollectionCard
                emoji="🧠"
                title="Grammatik"
                caption={`${data.topicsCount} Themen`}
                onPress={() => router.push('/practice')}
              />
            </View>
          </Animated.View>
        </>
      )}
    </Screen>
  );
}

function heroRoute(hero: HeroAction) {
  if (hero.kind === 'review') router.push('/review');
  else if (hero.kind === 'path')
    router.push({ pathname: '/lesson/[slug]', params: { slug: hero.node.slug } });
  else router.push('/dictionary');
}

function HeroCard({
  hero,
  due,
  fresh,
  doneToday,
  quests,
}: {
  hero: HeroAction;
  due: number;
  fresh: number;
  doneToday: number;
  quests: DailyQuestState[];
}) {
  const t = useTheme();
  const pending = due + fresh;
  const planned = pending + doneToday;
  const progress = planned === 0 ? 1 : doneToday / planned;

  const label =
    hero.kind === 'review' ? 'Heute fällig' : hero.kind === 'path' ? 'Weiter im Lernpfad' : 'Als Nächstes';
  const title =
    hero.kind === 'review'
      ? `${pending} ${pending === 1 ? 'Karte wartet' : 'Karten warten'}`
      : hero.kind === 'path'
        ? hero.node.title
        : 'Alles geschafft! 🎉';
  const subtitle =
    hero.kind === 'review'
      ? `${due} fällig · ${fresh} neu`
      : hero.kind === 'path'
        ? `${hero.node.unitEmoji} ${hero.node.unitTitle} · ${hero.node.unitLevel}`
        : 'Zeit, Neues zu entdecken';
  const cta =
    hero.kind === 'review' ? 'Jetzt üben →' : hero.kind === 'path' ? 'Weiter →' : 'Neue Wörter entdecken →';
  const ctaColors =
    hero.kind === 'discover'
      ? { bg: t.accentDim, fg: t.onAccentDim }
      : { bg: t.primary, fg: '#fff' };
  const claimed = quests.filter((q) => q.claimed).length;

  return (
    <Card style={styles.hero} onPress={() => heroRoute(hero)}>
      <View style={styles.heroBody}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" muted>
            {label}
          </AppText>
          <AppText
            variant="subtitle"
            numberOfLines={2}
            style={{ fontFamily: fonts.serif, fontSize: 23, marginTop: spacing.sm }}>
            {title}
          </AppText>
          <AppText variant="secondary" muted numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
          <View style={[styles.cta, { backgroundColor: ctaColors.bg }]}>
            <AppText variant="secondary" color={ctaColors.fg} style={{ fontFamily: fonts.extrabold }}>
              {cta}
            </AppText>
          </View>
        </View>
        <ProgressRing progress={progress} size={96}>
          <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 20 }}>
            {doneToday}/{planned}
          </AppText>
          <AppText variant="caption" muted>
            heute
          </AppText>
        </ProgressRing>
      </View>
      {quests.length > 0 && (
        <View style={[styles.questStrip, { borderTopColor: t.line }]}>
          <AppText variant="label" muted>
            Tagesziele
          </AppText>
          <View style={styles.questTokens}>
            {quests.map((q) => (
              <View
                key={q.key}
                style={[
                  styles.questToken,
                  { backgroundColor: q.claimed ? t.successDim : t.primaryDim },
                ]}>
                <AppText style={{ fontSize: 13 }}>{q.claimed ? '✅' : q.emoji}</AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" muted style={{ fontFamily: fonts.extrabold }}>
            {claimed}/{quests.length}
          </AppText>
        </View>
      )}
    </Card>
  );
}

function ResumeCard({ item, width }: { item: ResumeItem; width: number }) {
  const t = useTheme();
  const view =
    item.kind === 'path'
      ? {
          emoji: item.node.unitEmoji,
          tile: t.primaryDim,
          label: 'Weiter im Lernpfad',
          title: item.node.title,
          caption: `${item.node.unitTitle} · ${item.node.unitLevel}`,
          go: () => router.push({ pathname: '/lesson/[slug]', params: { slug: item.node.slug } }),
        }
      : item.kind === 'review'
        ? {
            emoji: '📇',
            tile: t.primaryDim,
            label: 'Karteikarten',
            title: `${item.count} ${item.count === 1 ? 'Karte' : 'Karten'} fällig`,
            caption: 'Kurz wiederholen',
            go: () => router.push('/review'),
          }
        : item.kind === 'reading'
          ? {
              emoji: '📖',
              tile: t.accentDim,
              label: 'Weiterlesen',
              title: item.title,
              caption: `${item.level} · ${item.wordCount} Wörter · Leseecke`,
              go: () => router.push({ pathname: '/lesen/[slug]', params: { slug: item.slug } }),
            }
          : {
              emoji: gameInfo(item.key).emoji,
              tile: t.accentDim,
              label: 'Letztes Spiel',
              title: gameInfo(item.key).title,
              caption: `Rekord ${item.best}`,
              go: () => router.push(`/game/${item.key}`),
            };
  return (
    <Card style={[styles.resumeCard, { width }]} onPress={view.go}>
      <View style={[styles.resumeIcon, { backgroundColor: view.tile }]}>
        <AppText style={{ fontSize: 20 }}>{view.emoji}</AppText>
      </View>
      <AppText variant="label" muted style={{ marginTop: spacing.md }}>
        {view.label}
      </AppText>
      <AppText variant="subtitle" numberOfLines={1} style={{ marginTop: 2 }}>
        {view.title}
      </AppText>
      <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
        {view.caption}
      </AppText>
    </Card>
  );
}

function GrammarCard({ next, width }: { next: NextTopic<TopicRow>; width: number }) {
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
      style={[styles.discoverCard, { width }]}
      onPress={() =>
        router.push({ pathname: '/quiz/[topicId]', params: { topicId: String(topic.id) } })
      }>
      <View style={styles.discoverHead}>
        <AppText variant="label" muted>
          Thema des Tages
        </AppText>
        <View style={[styles.levelBadge, { backgroundColor: t.caseChip }]}>
          <AppText variant="caption" color={t.onCaseChip} style={{ fontFamily: fonts.extrabold }}>
            {topic.level}
          </AppText>
        </View>
      </View>
      <AppText
        variant="subtitle"
        numberOfLines={2}
        style={{ fontFamily: fonts.serif, fontSize: 20, marginTop: spacing.sm }}>
        {topic.title}
      </AppText>
      <View style={{ flex: 1 }} />
      <AppText variant="caption" muted numberOfLines={2}>
        {reasonText}
      </AppText>
      {pct != null && (
        <View style={{ marginTop: spacing.sm }}>
          <ProgressBar
            ratio={accuracy ?? 0}
            color={accuracy != null && accuracy >= 0.7 ? t.accent : t.primary}
            height={6}
          />
        </View>
      )}
    </Card>
  );
}

function WotdCard({
  wotd,
  image,
  width,
}: {
  wotd: NonNullable<HomeData['wotd']>;
  image: string | null;
  width: number;
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
      style={[styles.discoverCard, { width }]}
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
        <AppText
          variant="subtitle"
          numberOfLines={1}
          style={{ fontFamily: fonts.serif, fontSize: 23, flexShrink: 1 }}>
          {wotd.lemma}
        </AppText>
      </View>
      <View style={styles.wotdBody}>
        <AppText variant="secondary" muted numberOfLines={2} style={{ flex: 1 }}>
          {wotd.gloss}
        </AppText>
        {image && <VocabImage svg={image} gender={wotd.gender} size={56} />}
      </View>
    </Card>
  );
}

function ThemeCard({ theme, width }: { theme: Theme; width: number }) {
  return (
    <Card
      style={[styles.discoverCard, { width }]}
      onPress={() => router.push({ pathname: '/themes/[slug]', params: { slug: theme.slug } })}>
      <AppText variant="label" muted>
        Themen-Tipp
      </AppText>
      <View style={styles.wotdRow}>
        <AppText style={{ fontSize: 24 }}>{theme.emoji}</AppText>
        <AppText
          variant="subtitle"
          numberOfLines={1}
          style={{ fontFamily: fonts.serif, fontSize: 20, flexShrink: 1 }}>
          {theme.title}
        </AppText>
      </View>
      <View style={{ flex: 1 }} />
      <AppText variant="caption" muted>
        {theme.words.length} Wörter · Wortfeld lernen
      </AppText>
    </Card>
  );
}

/** One arcade tile; `gameKey: null` renders the Duell tile. */
function GameTile({ gameKey, stats }: { gameKey: GameKey | null; stats: GameStats | null }) {
  const t = useTheme();
  const info = gameKey ? gameInfo(gameKey) : null;
  const record = stats && stats.plays > 0 ? `🏅 ${stats.best}` : null;
  return (
    <Card
      style={styles.gameTile}
      onPress={() => (gameKey ? router.push(`/game/${gameKey}`) : router.push('/duel'))}>
      <AppText style={{ fontSize: 30 }}>{info?.emoji ?? '⚔️'}</AppText>
      <AppText variant="caption" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {info?.title ?? 'Duell'}
      </AppText>
      {gameKey == null ? (
        <AppText variant="caption" muted style={{ marginTop: 3 }}>
          Zu zweit
        </AppText>
      ) : record ? (
        <AppText variant="caption" muted style={{ marginTop: 3 }}>
          {record}
        </AppText>
      ) : (
        <View style={[styles.newPill, { backgroundColor: t.accentDim }]}>
          <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold, fontSize: 10 }}>
            Neu
          </AppText>
        </View>
      )}
    </Card>
  );
}

function CollectionCard({
  emoji,
  title,
  caption,
  onPress,
}: {
  emoji: string;
  title: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.collectionCard} onPress={onPress}>
      <AppText style={{ fontSize: 24 }}>{emoji}</AppText>
      <AppText variant="subtitle" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {title}
      </AppText>
      <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
        {caption}
      </AppText>
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
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
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
  hero: { marginTop: spacing.lg },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cta: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: spacing.md,
  },
  questStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
  },
  questTokens: { flexDirection: 'row', gap: spacing.sm, flex: 1 },
  questToken: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeCard: { minHeight: 132 },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverCard: { minHeight: 132 },
  discoverHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  wotdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  wotdBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    flex: 1,
  },
  articleChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  gameTile: {
    width: 120,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  newPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
  },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  collectionCard: { flexBasis: '45%', flexGrow: 1 },
});
