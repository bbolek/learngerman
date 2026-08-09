import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fetchGameWords, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import { recordMistakes } from '@/db/mistakesRepo';
import {
  applyArcadeAnswer,
  buildDiktatQuestions,
  DIKTAT_WORDS,
  gameInfo,
  gradeDiktat,
  initialArcade,
  shortGloss,
  type ArcadeState,
  type DiktatQuestion,
} from '@/logic/games';
import { settleGameRound } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { SPEECH_RATE_SLOW, speakGerman } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('diktat');
const POOL_SIZE = 40;
const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

type Phase = 'intro' | 'playing' | 'done';
type Verdict = { correct: boolean; nearMiss: boolean } | null;

export default function DiktatScreen() {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [questions, setQuestions] = useState<DiktatQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [arcade, setArcade] = useState<ArcadeState>(initialArcade(0));
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [speaking, setSpeaking] = useState(false);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
  const [xpEarned, setXpEarned] = useState<number | null>(null);

  const inputRef = useRef<TextInput>(null);
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);
  const missedRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playCountRef = useRef(0);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('diktat')?.best ?? null));
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // From the second listen of a word on, speak slower so it's easier to catch.
  const speak = useCallback((text: string) => {
    playCountRef.current += 1;
    speakGerman(text, {
      rate: playCountRef.current >= 2 ? SPEECH_RATE_SLOW : undefined,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, []);

  // Each word announces itself once; the speaker button replays it.
  useEffect(() => {
    if (phase !== 'playing') return;
    const text = questions[index]?.text;
    if (!text) return;
    playCountRef.current = 0;
    const timer = setTimeout(() => speak(text), 350);
    timersRef.current.push(timer);
  }, [phase, index, questions, speak]);

  const start = async () => {
    const pool = await fetchGameWords(POOL_SIZE);
    const seed = Date.now() & 0x7fffffff;
    setQuestions(buildDiktatQuestions(pool, seed));
    setIndex(0);
    setArcade(initialArcade(0));
    setAnswer('');
    setVerdict(null);
    setOutcome(null);
    setXpEarned(null);
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
            gameKey: 'diktat',
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

  const submit = () => {
    const q = questions[index];
    if (!q || verdict != null || finishedRef.current || answer.trim().length === 0) return;
    const result = gradeDiktat(q.text, answer);
    if (!result.correct) missedRef.current.push(q.word.id);
    playSound(result.correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        result.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
    setVerdict({ correct: result.correct, nearMiss: result.nearMiss });
    const next = applyArcadeAnswer(arcade, result.correct);
    setArcade(next);
    const timer = setTimeout(
      () => {
        if (index + 1 >= questions.length) {
          finish(next);
        } else {
          setAnswer('');
          setVerdict(null);
          setIndex(index + 1);
        }
      },
      result.correct && !result.nearMiss ? 700 : 2000
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
        onRetry={start}
      />
    );
  }

  const q = questions[index];
  const showState = verdict != null;

  return (
    <GameScreen>
      <GameTopBar>
        <AppText variant="caption" muted>
          {Math.min(index + 1, DIKTAT_WORDS)}/{questions.length || DIKTAT_WORDS}
        </AppText>
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

      {/* Edge-to-edge Android no longer resizes the window for the keyboard,
          so both platforms need explicit padding to keep the input visible. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
          <View style={styles.speakerBlock}>
            <Pressable
              onPress={() => q && speak(q.text)}
              style={[styles.speaker, { backgroundColor: speaking ? t.primary : t.primaryDim }]}>
              <Ionicons
                name="volume-high"
                size={44}
                color={speaking ? '#fff' : t.onPrimaryDim}
              />
            </Pressable>
            <AppText variant="secondary" muted style={{ marginTop: spacing.md }}>
              Nochmal anhören? Einfach antippen.
            </AppText>
          </View>

          <View style={styles.verdictSlot}>
            {showState && q && (
              <View
                style={[
                  styles.verdictChip,
                  { backgroundColor: verdict.correct ? t.accentDim : t.dangerDim },
                ]}>
                <AppText
                  variant="secondary"
                  color={verdict.correct ? t.onAccentDim : t.onDangerDim}
                  numberOfLines={2}
                  style={{ fontFamily: fonts.extrabold, textAlign: 'center' }}>
                  {verdict.correct
                    ? verdict.nearMiss
                      ? `✓ Fast! Richtig geschrieben: ${q.text}`
                      : `✓ ${q.text}`
                    : `✗ ${q.text}`}
                  {'\n'}
                  <AppText variant="caption" color={verdict.correct ? t.onAccentDim : t.onDangerDim}>
                    {shortGloss(q.word.gloss)}
                  </AppText>
                </AppText>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} />

          <View style={{ paddingBottom: spacing.lg }}>
            <View
              style={[
                styles.inputBar,
                {
                  backgroundColor: t.surface,
                  borderColor: showState ? (verdict.correct ? t.accent : t.danger) : t.line,
                },
              ]}>
              <TextInput
                ref={inputRef}
                value={answer}
                onChangeText={setAnswer}
                editable={!showState}
                placeholder="Schreib, was du hörst …"
                placeholderTextColor={t.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={submit}
                style={[styles.input, { color: t.ink }]}
              />
              <Pressable
                hitSlop={8}
                disabled={showState || answer.trim().length === 0}
                onPress={submit}>
                <Ionicons
                  name="checkmark-circle"
                  size={30}
                  color={answer.trim().length > 0 && !showState ? t.primary : t.inkFaint}
                />
              </Pressable>
            </View>
            <View style={styles.umlautRow}>
              {UMLAUTS.map((u) => (
                <Pressable
                  key={u}
                  disabled={showState}
                  onPress={() => {
                    setAnswer((cur) => cur + u);
                    inputRef.current?.focus();
                  }}
                  style={({ pressed }) => [
                    styles.umlautKey,
                    { backgroundColor: t.surface, borderColor: t.line },
                    pressed && { backgroundColor: t.primaryDim, borderColor: t.primary },
                  ]}>
                  <AppText variant="subtitle">{u}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  streakChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  speakerBlock: { alignItems: 'center', marginTop: spacing.xl },
  speaker: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictSlot: { minHeight: 64, marginTop: spacing.lg, justifyContent: 'center' },
  verdictChip: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  input: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, padding: 0 },
  umlautRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  umlautKey: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
