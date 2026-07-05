import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLemmaImages } from '@/db/dictionaryRepo';
import { applyRating, buildQueue, type ReviewCard } from '@/db/srsRepo';
import { articleFor } from '@/logic/formLabels';
import { previewInterval, type Rating } from '@/logic/sm2';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { FlipCard } from '@/ui/components/FlipCard';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Chip } from '@/ui/components/Chip';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface SessionStats {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export default function ReviewScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { sessionCap, dailyNewLimit, hapticsEnabled } = useSettings();

  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [totalPlanned, setTotalPlanned] = useState(0);
  const [images, setImages] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    buildQueue(new Date(), sessionCap, dailyNewLimit).then(async (cards) => {
      setImages(await getLemmaImages(cards.map((c) => c.lemma_id)));
      setQueue(cards);
      setTotalPlanned(cards.length);
    });
  }, [sessionCap, dailyNewLimit]);

  const card = queue?.[index];
  const now = useMemo(() => new Date(), [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = async (rating: Rating) => {
    if (!card || !queue) return;
    if (hapticsEnabled) {
      if (rating === 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const next = await applyRating(
      {
        lemma_id: card.lemma_id,
        ease: card.ease,
        intervalDays: card.interval_days,
        reps: card.reps,
        lapses: card.lapses,
      },
      rating,
      new Date()
    );
    const key = (['again', 'hard', 'good', 'easy'] as const)[rating];
    setStats((s) => ({ ...s, [key]: s[key] + 1 }));

    if (rating === 0) {
      // relearn this session: re-enqueue with updated state
      setQueue([
        ...queue,
        { ...card, ease: next.ease, interval_days: next.intervalDays, reps: next.reps, lapses: next.lapses },
      ]);
    }
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  if (!queue) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  if (queue.length === 0) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: t.bg, padding: spacing.xl }]}>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Alles gelernt! 🎉
        </AppText>
        <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
          Keine Karten fällig. Speichere neue Wörter im Wörterbuch, um mehr zu üben.
        </AppText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xl }]}>
          <AppText variant="subtitle" color="#fff">
            Zurück
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (!card) return <Summary stats={stats} />;

  const cardState = {
    ease: card.ease,
    intervalDays: card.interval_days,
    reps: card.reps,
    lapses: card.lapses,
  };
  const article = card.pos === 'noun' ? articleFor(card.gender) : null;
  const progress = totalPlanned === 0 ? 0 : Math.min(index / Math.max(queue.length, totalPlanned), 1);

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={t.inkMuted} />
        </Pressable>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.barFill,
              { backgroundColor: t.primary, width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <AppText variant="caption" muted>
          {Math.min(index + 1, queue.length)}/{queue.length}
        </AppText>
      </View>

      <View style={styles.cardArea}>
        <FlipCard
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
          front={
            <>
              <CardChips card={card} />
              <AppText variant="headword" style={{ textAlign: 'center' }}>
                {article ? (
                  <AppText variant="headword" color={t.success}>
                    {article}{' '}
                  </AppText>
                ) : null}
                {card.lemma}
              </AppText>
              <AppText variant="secondary" muted style={{ marginTop: spacing.lg }}>
                Was heißt das auf Englisch?
              </AppText>
            </>
          }
          back={
            <>
              <CardChips card={card} />
              {images.has(card.lemma_id) && (
                <VocabImage
                  svg={images.get(card.lemma_id)!}
                  gender={card.gender}
                  size={72}
                  style={{ marginBottom: spacing.md }}
                />
              )}
              <AppText variant="section" style={{ textAlign: 'center' }}>
                {article ? (
                  <AppText variant="section" color={t.success}>
                    {article}{' '}
                  </AppText>
                ) : null}
                {card.lemma}
              </AppText>
              <View style={[styles.rule, { backgroundColor: t.primary }]} />
              <AppText variant="subtitle" style={{ textAlign: 'center', fontSize: 21 }}>
                {card.gloss}
              </AppText>
              {card.plural && (
                <AppText variant="secondary" muted style={{ marginTop: 4 }}>
                  Plural: {card.plural}
                </AppText>
              )}
              {card.example_de && (
                <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
                  <AppText
                    variant="body"
                    style={{ fontFamily: fonts.serif, textAlign: 'center', fontSize: 17 }}>
                    „{card.example_de}“
                  </AppText>
                  {card.example_en && (
                    <AppText variant="secondary" muted style={{ marginTop: 3, textAlign: 'center' }}>
                      {card.example_en}
                    </AppText>
                  )}
                </View>
              )}
            </>
          }
        />
      </View>

      {flipped ? (
        <View style={[styles.rating, { paddingBottom: insets.bottom + spacing.md }]}>
          <RateButton bg={t.dangerDim} fg={t.onDangerDim} label="Nochmal" sub={previewInterval(cardState, 0, now)} onPress={() => rate(0)} />
          <RateButton bg={t.primaryDim} fg={t.onPrimaryDim} label="Schwer" sub={previewInterval(cardState, 1, now)} onPress={() => rate(1)} />
          <RateButton bg={t.accentDim} fg={t.onAccentDim} label="Gut" sub={previewInterval(cardState, 2, now)} onPress={() => rate(2)} />
          <RateButton bg={t.successDim} fg={t.onSuccessDim} label="Einfach" sub={previewInterval(cardState, 3, now)} onPress={() => rate(3)} />
        </View>
      ) : (
        <View style={[styles.tapHint, { borderColor: t.line, marginBottom: insets.bottom + spacing.md }]}>
          <AppText variant="secondary" muted>
            Tippen zum Umdrehen
          </AppText>
        </View>
      )}
    </View>
  );
}

function CardChips({ card }: { card: ReviewCard }) {
  return (
    <View style={styles.chipRow}>
      {card.gender && card.gender !== 'pl' && (
        <Chip
          label={card.gender === 'm' ? 'der' : card.gender === 'f' ? 'die' : 'das'}
          kind={card.gender === 'm' ? 'der' : card.gender === 'f' ? 'die' : 'das'}
          small
        />
      )}
      <Chip label={card.level} kind="level" small />
    </View>
  );
}

function RateButton({
  bg,
  fg,
  label,
  sub,
  onPress,
}: {
  bg: string;
  fg: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rateBtn,
        { backgroundColor: bg },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}>
      <AppText variant="secondary" color={fg} style={{ fontFamily: fonts.extrabold }}>
        {label}
      </AppText>
      <AppText variant="caption" color={fg} style={{ opacity: 0.8, fontSize: 11 }}>
        {sub}
      </AppText>
    </Pressable>
  );
}

function Summary({ stats }: { stats: SessionStats }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const total = stats.again + stats.hard + stats.good + stats.easy;
  const goodShare = total === 0 ? 0 : (stats.good + stats.easy) / total;
  return (
    <View
      style={[
        styles.fill,
        styles.center,
        { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
      ]}>
      <ProgressRing progress={goodShare} size={140} strokeWidth={12} color={t.accent}>
        <AppText variant="title">{Math.round(goodShare * 100)}%</AppText>
      </ProgressRing>
      <AppText variant="title" style={{ marginTop: spacing.xl }}>
        {goodShare >= 0.8 ? 'Super gemacht! 🎉' : 'Geschafft! 💪'}
      </AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        {total} Karten wiederholt
      </AppText>
      <View style={styles.statRow}>
        <Stat label="Nochmal" value={stats.again} color={t.onDangerDim} />
        <Stat label="Schwer" value={stats.hard} color={t.onPrimaryDim} />
        <Stat label="Gut" value={stats.good} color={t.onAccentDim} />
        <Stat label="Einfach" value={stats.easy} color={t.onSuccessDim} />
      </View>
      <Pressable
        onPress={() => router.back()}
        style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xxl }]}>
        <AppText variant="subtitle" color="#fff">
          Fertig
        </AppText>
      </Pressable>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="section" color={color}>
        {value}
      </AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  bar: { flex: 1, height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  cardArea: { flex: 1, marginHorizontal: spacing.lg },
  chipRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rule: { width: 54, height: 3, borderRadius: 99, marginVertical: spacing.lg },
  rating: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  rateBtn: {
    flex: 1,
    borderRadius: radius.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tapHint: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.button,
    paddingVertical: 13,
    alignItems: 'center',
  },
  statRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xl },
  stat: { alignItems: 'center' },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 15,
  },
});
