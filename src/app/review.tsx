import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildClozes } from '@/db/clozeRepo';
import { getLemmaImages } from '@/db/dictionaryRepo';
import { applyRating, buildQueue, type ReviewCard } from '@/db/srsRepo';
import { CLOZE_BLANK, type Cloze } from '@/logic/cloze';
import { articleFor } from '@/logic/formLabels';
import { gradeFillBlank, type FillResult } from '@/logic/graders';
import { previewInterval, type Rating } from '@/logic/sm2';
import { xpForReview } from '@/logic/xp';
import { awardXp, settleRewards } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { speakGerman } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { FlipCard } from '@/ui/components/FlipCard';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { Chip } from '@/ui/components/Chip';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** Words already seen a few times get the tougher "type it" recall card. */
const TYPED_MIN_REPS = 2;
const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

/** A typed recall challenge: fill a blank, produce the word, or hear & type it. */
interface TypeChallenge {
  kind: 'cloze' | 'word' | 'listen';
  /** cloze: the masked sentence; word: the English gloss; listen: text to speak. */
  prompt: string;
  /** cloze: English translation; listen: English gloss (disambiguates); word: none. */
  hint: string | null;
  /** The accepted answer (surface form for cloze, lemma for word/listen). */
  answer: string;
}

interface SessionStats {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export default function ReviewScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { sessionCap, dailyNewLimit, hapticsEnabled, typedRecall } = useSettings();

  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState<FillResult | null>(null);
  const [stats, setStats] = useState<SessionStats>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [xpEarned, setXpEarned] = useState(0);
  const [totalPlanned, setTotalPlanned] = useState(0);
  const [images, setImages] = useState<Map<number, string>>(new Map());
  const [clozes, setClozes] = useState<Map<number, Cloze>>(new Map());

  useEffect(() => {
    buildQueue(new Date(), sessionCap, dailyNewLimit).then(async (cards) => {
      const [imgs, cz] = await Promise.all([
        getLemmaImages(cards.map((c) => c.lemma_id)),
        buildClozes(cards),
      ]);
      setImages(imgs);
      setClozes(cz);
      setQueue(cards);
      setTotalPlanned(cards.length);
    });
  }, [sessionCap, dailyNewLimit]);

  const card = queue?.[index];
  const now = useMemo(() => new Date(), [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // A familiar word (when typed recall is on) becomes a typed challenge: a
  // cloze if it has a usable example, otherwise "type the German word".
  // Everything else stays a recall flip card.
  const challenge = useMemo<TypeChallenge | null>(() => {
    if (!card || !typedRecall || card.reps < TYPED_MIN_REPS) return null;
    // Every third familiar card is a dictation ("hear it → type it"); the rest
    // are cloze where an example allows, otherwise translate-and-type.
    if (card.lemma_id % 3 === 0) {
      return { kind: 'listen', prompt: card.lemma, hint: card.gloss, answer: card.lemma };
    }
    const cloze = clozes.get(card.lemma_id);
    if (cloze) return { kind: 'cloze', prompt: cloze.masked, hint: card.example_en, answer: cloze.answer };
    return { kind: 'word', prompt: card.gloss, hint: null, answer: card.lemma };
  }, [card, typedRecall, clozes]);
  const revealed = challenge ? answered != null : flipped;

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
    const xp = xpForReview(rating);
    setXpEarned((x) => x + xp);
    awardXp('review', xp, new Date()).catch(() => {});

    if (rating === 0) {
      // relearn this session: re-enqueue with updated state
      setQueue([
        ...queue,
        { ...card, ease: next.ease, interval_days: next.intervalDays, reps: next.reps, lapses: next.lapses },
      ]);
    }
    setFlipped(false);
    setAnswered(null);
    setIndex((i) => i + 1);
  };

  const onCloze = (result: FillResult) => {
    playSound(result.correct ? 'correct' : 'wrong');
    if (hapticsEnabled) {
      Haptics.notificationAsync(
        result.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
    setAnswered(result);
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

  if (!card) return <Summary stats={stats} xpEarned={xpEarned} />;

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
        {challenge ? (
          <TypeCard
            key={card.lemma_id}
            card={card}
            challenge={challenge}
            image={images.get(card.lemma_id) ?? null}
            answered={answered}
            onCheck={onCloze}
          />
        ) : (
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
        )}
      </View>

      {revealed ? (
        <View style={[styles.rating, { paddingBottom: insets.bottom + spacing.md }]}>
          <RateButton bg={t.dangerDim} fg={t.onDangerDim} label="Nochmal" sub={previewInterval(cardState, 0, now)} onPress={() => rate(0)} />
          <RateButton bg={t.primaryDim} fg={t.onPrimaryDim} label="Schwer" sub={previewInterval(cardState, 1, now)} onPress={() => rate(1)} />
          <RateButton bg={t.accentDim} fg={t.onAccentDim} label="Gut" sub={previewInterval(cardState, 2, now)} onPress={() => rate(2)} />
          <RateButton bg={t.successDim} fg={t.onSuccessDim} label="Einfach" sub={previewInterval(cardState, 3, now)} onPress={() => rate(3)} />
        </View>
      ) : challenge ? null : (
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

function TypeCard({
  card,
  challenge,
  image,
  answered,
  onCheck,
}: {
  card: ReviewCard;
  challenge: TypeChallenge;
  image: string | null;
  answered: FillResult | null;
  onCheck: (result: FillResult) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const locked = answered != null;

  const check = () => {
    if (locked || !text.trim()) return;
    onCheck(gradeFillBlank({ prompt: '', accept: [challenge.answer], explanation: '' }, text));
  };

  // Dictation cards play the word once when they appear (keyed per card, so
  // this remounts and fires once per dictation card).
  useEffect(() => {
    if (challenge.kind === 'listen') speakGerman(challenge.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answerColor = answered?.correct ? t.success : t.danger;
  const [before, after] =
    challenge.kind === 'cloze' ? challenge.prompt.split(CLOZE_BLANK) : ['', ''];

  return (
    <Card style={styles.clozeCard}>
      <CardChips card={card} />
      <AppText variant="label" muted style={{ marginTop: spacing.xxl }}>
        {challenge.kind === 'cloze'
          ? 'Lückentext · welches Wort fehlt?'
          : challenge.kind === 'listen'
            ? 'Hör zu und tippe, was du hörst'
            : 'Übersetze ins Deutsche'}
      </AppText>

      {challenge.kind === 'cloze' ? (
        <AppText variant="section" style={{ marginTop: spacing.md, lineHeight: 36 }}>
          {before}
          {locked ? (
            <AppText variant="section" color={answerColor} style={{ fontFamily: fonts.extrabold }}>
              {challenge.answer}
            </AppText>
          ) : (
            <AppText variant="section" color={t.inkFaint} style={{ fontFamily: fonts.extrabold }}>
              {CLOZE_BLANK}
            </AppText>
          )}
          {after}
        </AppText>
      ) : challenge.kind === 'listen' ? (
        <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <Pressable
            onPress={() => speakGerman(challenge.prompt)}
            hitSlop={12}
            style={({ pressed }) => [
              styles.listenBtn,
              { backgroundColor: t.primaryDim },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}>
            <Ionicons name="volume-high" size={40} color={t.onPrimaryDim} />
          </Pressable>
          <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
            Tippen zum Wiederholen
          </AppText>
        </View>
      ) : (
        <AppText variant="headword" style={{ marginTop: spacing.md, fontSize: 26 }}>
          {challenge.prompt}
        </AppText>
      )}

      {challenge.hint && (
        <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
          {challenge.hint}
        </AppText>
      )}

      {locked ? (
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <AppText variant="subtitle" color={answerColor} style={{ fontFamily: fonts.extrabold }}>
            {answered!.correct
              ? answered!.nearMiss
                ? '✓ Fast — achte auf die Umlaute'
                : '✓ Richtig!'
              : `✗ Richtig wäre „${challenge.answer}“`}
          </AppText>
          <View style={[styles.rule, { backgroundColor: t.primary }]} />
          {image && <VocabImage svg={image} gender={card.gender} size={56} style={{ marginBottom: spacing.sm }} />}
          <AppText variant="subtitle" style={{ textAlign: 'center', fontSize: 19 }}>
            {card.lemma}
          </AppText>
          <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 2 }}>
            {card.gloss}
          </AppText>
        </View>
      ) : (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Fehlendes Wort…"
            placeholderTextColor={t.inkFaint}
            onSubmitEditing={check}
            style={[styles.clozeInput, { backgroundColor: t.bg, borderColor: t.primary, color: t.ink }]}
          />
          <View style={styles.umlautRow}>
            {UMLAUTS.map((u) => (
              <Pressable
                key={u}
                onPress={() => setText((v) => v + u)}
                style={[styles.umlautKey, { backgroundColor: t.bg, borderColor: t.line }]}>
                <AppText variant="subtitle">{u}</AppText>
              </Pressable>
            ))}
          </View>
          <Pressable
            disabled={!text.trim()}
            onPress={check}
            style={[styles.clozeCta, { backgroundColor: text.trim() ? t.primary : t.line }]}>
            <AppText variant="subtitle" color={text.trim() ? '#fff' : t.inkFaint}>
              Prüfen
            </AppText>
          </Pressable>
        </>
      )}
    </Card>
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

function Summary({ stats, xpEarned }: { stats: SessionStats; xpEarned: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const total = stats.again + stats.hard + stats.good + stats.easy;
  const goodShare = total === 0 ? 0 : (stats.good + stats.easy) / total;

  // Session over: pay out finished Tagesziele and freshly earned badges.
  useEffect(() => {
    settleRewards(new Date());
  }, []);

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
      {xpEarned > 0 && (
        <View style={[styles.xpChip, { backgroundColor: t.primaryDim }]}>
          <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
            ⭐ +{xpEarned} XP
          </AppText>
        </View>
      )}
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
  clozeCard: { alignSelf: 'stretch', paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  listenBtn: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  clozeInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: fonts.semibold,
    fontSize: 18,
    marginTop: spacing.xl,
  },
  umlautRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  umlautKey: {
    width: 46,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clozeCta: {
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
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
  xpChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xl },
  stat: { alignItems: 'center' },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 15,
  },
});
