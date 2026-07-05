import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchGameWords, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import {
  applyArcadeAnswer,
  buildBlitzQuestions,
  gameInfo,
  initialArcade,
  WORTBLITZ_MS,
  type ArcadeState,
  type BlitzQuestion,
} from '@/logic/games';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('wortblitz');
const POOL_SIZE = 90;

type Phase = 'intro' | 'playing' | 'done';

export default function WortblitzScreen() {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [questions, setQuestions] = useState<BlitzQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [arcade, setArcade] = useState<ArcadeState>(initialArcade(0));
  const [selected, setSelected] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(WORTBLITZ_MS);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);

  const arcadeRef = useRef(arcade);
  arcadeRef.current = arcade;
  const endAtRef = useRef(0);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('wortblitz')?.best ?? null));
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const start = async () => {
    const pool = await fetchGameWords(POOL_SIZE);
    const seed = Date.now() & 0x7fffffff;
    setQuestions(buildBlitzQuestions(pool, seed));
    setIndex(0);
    setArcade(initialArcade(0));
    setSelected(null);
    setOutcome(null);
    finishedRef.current = false;
    endAtRef.current = Date.now() + WORTBLITZ_MS;
    setRemaining(WORTBLITZ_MS);
    setPhase('playing');
  };

  // Countdown driven by wall clock so paused JS frames can't stretch the round.
  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = setInterval(() => {
      const left = Math.max(0, endAtRef.current - Date.now());
      setRemaining(left);
      if (left <= 0) finish();
    }, 150);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const s = arcadeRef.current;
    recordGameResult(
      {
        gameKey: 'wortblitz',
        score: s.score,
        correct: s.correct,
        total: s.total,
        bestStreak: s.bestStreak,
        durationMs: WORTBLITZ_MS,
      },
      new Date()
    ).then((res) => {
      setOutcome(res);
      setBest((b) => Math.max(b ?? 0, s.score));
      setPhase('done');
    });
  };

  const answer = (i: number) => {
    const q = questions[index];
    if (!q || selected != null || finishedRef.current) return;
    const correct = i === q.correctIndex;
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    setSelected(i);
    setArcade((s) => applyArcadeAnswer(s, correct));
    const timer = setTimeout(
      () => {
        setSelected(null);
        if (index + 1 >= questions.length) finish();
        else setIndex(index + 1);
      },
      correct ? 350 : 800
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
        stats={[
          { label: 'Richtig', value: `${arcade.correct}/${arcade.total}` },
          { label: 'Beste Serie', value: `${arcade.bestStreak}` },
          { label: 'Pro Wort', value: arcade.correct > 0 ? `${(60 / arcade.correct).toFixed(1)}s` : '–' },
        ]}
        onRetry={start}
      />
    );
  }

  const q = questions[index];
  const secondsLeft = Math.ceil(remaining / 1000);
  const urgent = remaining < 10_000;

  return (
    <GameScreen>
      <GameTopBar>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: urgent ? t.danger : t.primary,
                width: `${Math.round((remaining / WORTBLITZ_MS) * 100)}%`,
              },
            ]}
          />
        </View>
        <AppText variant="caption" color={urgent ? t.danger : t.inkMuted} style={styles.timerLabel}>
          {secondsLeft}s
        </AppText>
        <AppText variant="subtitle" color={t.primary} style={{ fontFamily: fonts.extrabold }}>
          {arcade.score}
        </AppText>
      </GameTopBar>

      <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
        <View style={[styles.fill, styles.center]}>
          {arcade.streak >= 2 && (
            <View style={[styles.streakChip, { backgroundColor: t.primaryDim }]}>
              <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                🔥 Serie ×{arcade.streak}
              </AppText>
            </View>
          )}
          <AppText variant="headword" style={{ textAlign: 'center' }}>
            {q?.word.lemma}
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
            Was bedeutet das?
          </AppText>
        </View>

        <View style={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
          {q?.options.map((opt, i) => {
            const showState = selected != null;
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
  bar: { flex: 1, height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  timerLabel: { minWidth: 30, textAlign: 'right' },
  streakChip: {
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
