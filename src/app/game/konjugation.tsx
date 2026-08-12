import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchVerbWords, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import { recordMistakes } from '@/db/mistakesRepo';
import {
  addReviewWord,
  applyArcadeAnswer,
  buildKonjugationQuestions,
  gameInfo,
  initialArcade,
  KONJUGATION_LIVES,
  konjugationContext,
  shortGloss,
  type ArcadeState,
  type KonjugationQuestion,
} from '@/logic/games';
import { settleGameRound } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('konjugation');
const POOL_SIZE = 60;

type Phase = 'intro' | 'playing' | 'done';

export default function KonjugationScreen() {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [questions, setQuestions] = useState<KonjugationQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [arcade, setArcade] = useState<ArcadeState>(initialArcade(KONJUGATION_LIVES));
  const [selected, setSelected] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [reviewWords, setReviewWords] = useState<string[]>([]);

  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);
  const missedRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('konjugation')?.best ?? null));
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const start = async () => {
    const pool = await fetchVerbWords(POOL_SIZE);
    const seed = Date.now() & 0x7fffffff;
    setQuestions(buildKonjugationQuestions(pool, seed));
    setIndex(0);
    setArcade(initialArcade(KONJUGATION_LIVES));
    setSelected(null);
    setOutcome(null);
    setXpEarned(null);
    setReviewWords([]);
    finishedRef.current = false;
    missedRef.current = [];
    startedAtRef.current = Date.now();
    setPhase('playing');
  };

  const finish = useCallback((s: ArcadeState) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const durationMs = Date.now() - startedAtRef.current;
    (async () => {
      // Sequenced: recordMistakes and recordGameResult each open a transaction
      // on the same connection — running them concurrently rejects the second
      // one, and the round would never reach the result screen.
      await recordMistakes(missedRef.current, new Date()).catch(() => {});
      try {
        const res = await recordGameResult(
          {
            gameKey: 'konjugation',
            score: s.score,
            correct: s.correct,
            total: s.total,
            bestStreak: s.bestStreak,
            durationMs,
          },
          new Date()
        );
        setOutcome(res);
        setBest((b) => Math.max(b ?? 0, s.score));
        setXpEarned(await settleGameRound(INFO.title, s.score, res, new Date()));
      } catch {
        // persistence failed — still end the round instead of stranding it
      }
      setPhase('done');
    })();
  }, []);

  const answer = (i: number) => {
    const q = questions[index];
    if (!q || selected != null || finishedRef.current) return;
    const correct = i === q.correctIndex;
    if (!correct) {
      missedRef.current.push(q.word.id);
      setReviewWords((cur) => addReviewWord(cur, q.word.lemma));
    }
    playSound(correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    setSelected(i);
    const next = applyArcadeAnswer(arcade, correct);
    setArcade(next);
    const timer = setTimeout(
      () => {
        if (next.lives <= 0 || index + 1 >= questions.length) {
          finish(next);
        } else {
          setSelected(null);
          setIndex(index + 1);
        }
      },
      correct ? 450 : 1400
    );
    timersRef.current.push(timer);
  };

  if (phase === 'intro') return <GameIntro info={INFO} best={best} onStart={start} />;

  if (phase === 'done') {
    return (
      <GameResult
        info={INFO}
        score={arcade.score}
        outcome={outcome}
        xpEarned={xpEarned}
        stats={[
          { label: 'Richtig', value: `${arcade.correct}/${arcade.total}` },
          { label: 'Beste Serie', value: `${arcade.bestStreak}` },
          {
            label: 'Genauigkeit',
            value: arcade.total > 0 ? `${Math.round((arcade.correct / arcade.total) * 100)}%` : '–',
          },
        ]}
        reviewWords={reviewWords}
        onRetry={start}
      />
    );
  }

  const q = questions[index];
  const ctx = q ? konjugationContext(q.tag, q.word.aux) : null;
  const showState = selected != null;

  return (
    <GameScreen>
      <GameTopBar>
        <View style={styles.lives}>
          {Array.from({ length: KONJUGATION_LIVES }, (_, i) => (
            <Ionicons
              key={i}
              name={i < arcade.lives ? 'heart' : 'heart-outline'}
              size={20}
              color={i < arcade.lives ? t.danger : t.inkFaint}
            />
          ))}
        </View>
        <View style={{ flex: 1 }} />
        {arcade.streak >= 2 && (
          <View style={[styles.streakChip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              🔥 ×{arcade.streak}
            </AppText>
          </View>
        )}
        <AppText variant="subtitle" color={t.primary} style={{ fontFamily: fonts.extrabold }}>
          {arcade.score}
        </AppText>
      </GameTopBar>

      <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
        <View style={[styles.fill, styles.center]}>
          {ctx && (
            <View style={[styles.tenseChip, { backgroundColor: t.caseChip }]}>
              <AppText variant="caption" color={t.onCaseChip} style={{ fontFamily: fonts.extrabold }}>
                {ctx.tense}
              </AppText>
            </View>
          )}
          <AppText
            variant="headword"
            style={{ textAlign: 'center', width: '100%' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}>
            {q?.word.lemma}
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
            {q ? shortGloss(q.word.gloss) : ''}
          </AppText>
          <AppText variant="subtitle" style={{ marginTop: spacing.lg }}>
            {ctx?.lead} <AppText variant="subtitle" color={t.primary}>____</AppText>
          </AppText>
        </View>

        <View style={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
          {q?.options.map((opt, i) => {
            const isCorrect = i === q.correctIndex;
            const isSel = selected === i;
            let bg = t.surface;
            let border = t.line;
            let fg = t.ink;
            if (showState && isCorrect) {
              bg = t.accentDim; border = t.accent; fg = t.onAccentDim;
            } else if (showState && isSel && !isCorrect) {
              bg = t.dangerDim; border = t.danger; fg = t.onDangerDim;
            }
            return (
              <Pressable
                key={i}
                disabled={showState}
                onPress={() => answer(i)}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}>
                <AppText variant="subtitle" color={fg} style={{ fontSize: 17 }}>
                  {opt}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  lives: { flexDirection: 'row', gap: 3 },
  streakChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tenseChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: spacing.md,
  },
  option: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
});
