import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { fetchGenderNouns, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import {
  applyArcadeAnswer,
  DERDIEDAS_LIVES,
  gameInfo,
  initialArcade,
  shortGloss,
  type ArcadeState,
  type GameWord,
} from '@/logic/games';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('derdiedas');
const POOL_SIZE = 150;

const ARTICLES = [
  { gender: 'm', label: 'der' },
  { gender: 'f', label: 'die' },
  { gender: 'n', label: 'das' },
] as const;

const ARTICLE_LABEL: Record<string, string> = { m: 'der', f: 'die', n: 'das' };

type Phase = 'intro' | 'playing' | 'done';

export default function DerDieDasScreen() {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [words, setWords] = useState<GameWord[]>([]);
  const [index, setIndex] = useState(0);
  const [arcade, setArcade] = useState<ArcadeState>(initialArcade(DERDIEDAS_LIVES));
  const [picked, setPicked] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);

  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('derdiedas')?.best ?? null));
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const start = async () => {
    const pool = await fetchGenderNouns(POOL_SIZE);
    setWords(pool);
    setIndex(0);
    setArcade(initialArcade(DERDIEDAS_LIVES));
    setPicked(null);
    setOutcome(null);
    finishedRef.current = false;
    startedAtRef.current = Date.now();
    setPhase('playing');
  };

  const finish = (s: ArcadeState) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    recordGameResult(
      {
        gameKey: 'derdiedas',
        score: s.score,
        correct: s.correct,
        total: s.total,
        bestStreak: s.bestStreak,
        durationMs: Date.now() - startedAtRef.current,
      },
      new Date()
    ).then((res) => {
      setOutcome(res);
      setBest((b) => Math.max(b ?? 0, s.score));
      setPhase('done');
    });
  };

  const answer = (gender: string) => {
    const word = words[index];
    if (!word || picked != null || finishedRef.current) return;
    const correct = word.gender === gender;
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    setPicked(gender);
    const next = applyArcadeAnswer(arcade, correct);
    setArcade(next);
    const timer = setTimeout(
      () => {
        if (next.lives <= 0 || index + 1 >= words.length) {
          finish(next);
        } else {
          setPicked(null);
          setIndex(index + 1);
        }
      },
      correct ? 450 : 1300
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
          {
            label: 'Genauigkeit',
            value: arcade.total > 0 ? `${Math.round((arcade.correct / arcade.total) * 100)}%` : '–',
          },
        ]}
        onRetry={start}
      />
    );
  }

  const word = words[index];
  const showState = picked != null;
  const wasCorrect = showState && word != null && picked === word.gender;
  const articleColors: Record<string, { dim: string; on: string }> = {
    m: { dim: t.derChip, on: t.onDerChip },
    f: { dim: t.dieChip, on: t.onDieChip },
    n: { dim: t.dasChip, on: t.onDasChip },
  };

  return (
    <GameScreen>
      <GameTopBar>
        <View style={styles.lives}>
          {Array.from({ length: DERDIEDAS_LIVES }, (_, i) => (
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
          <AppText variant="headword" style={{ textAlign: 'center' }}>
            {word?.lemma}
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
            {word ? shortGloss(word.gloss) : ''}
          </AppText>
          <View style={styles.feedbackSlot}>
            {showState && word && (
              <View
                style={[
                  styles.feedbackChip,
                  { backgroundColor: wasCorrect ? t.accentDim : t.dangerDim },
                ]}>
                <AppText
                  variant="secondary"
                  color={wasCorrect ? t.onAccentDim : t.onDangerDim}
                  style={{ fontFamily: fonts.extrabold }}>
                  {wasCorrect ? '✓' : '✗'} {ARTICLE_LABEL[word.gender ?? '']} {word.lemma}
                  {!wasCorrect && word.plural ? ` · ${word.plural}` : ''}
                </AppText>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.articleRow, { paddingBottom: spacing.xl }]}>
          {ARTICLES.map((a) => {
            const colors = articleColors[a.gender];
            const isCorrectAnswer = showState && word?.gender === a.gender;
            const isWrongPick = showState && picked === a.gender && !isCorrectAnswer;
            let bg = colors.dim;
            let border = 'transparent';
            let fg = colors.on;
            if (isCorrectAnswer) {
              border = t.accent;
            } else if (isWrongPick) {
              bg = t.dangerDim; border = t.danger; fg = t.onDangerDim;
            }
            return (
              <Pressable
                key={a.gender}
                disabled={showState}
                onPress={() => answer(a.gender)}
                style={[styles.articleBtn, { backgroundColor: bg, borderColor: border }]}>
                <AppText variant="section" color={fg}>
                  {a.label}
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
  feedbackSlot: { height: 44, marginTop: spacing.lg, justifyContent: 'center' },
  feedbackChip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  articleRow: { flexDirection: 'row', gap: spacing.md },
  articleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 22,
    borderRadius: 18,
    borderWidth: 2,
  },
});
