import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recordGameResult } from '@/db/gamesRepo';
import { recordMistakes } from '@/db/mistakesRepo';
import {
  duelRank,
  duelResults,
  duelStandings,
  HOST_ID,
  rankOf,
  type DuelQuestion,
  type DuelStanding,
} from '@/logic/duel';
import {
  addReviewWord,
  gradeDiktat,
  gradeSatzbau,
  konjugationContext,
  shortGloss,
  withArticle,
  type ChoiceQuestion,
  type ImageWord,
  type KonjugationQuestion,
  type SatzbauQuestion,
} from '@/logic/games';
import { XP_DUEL_PLAYED, XP_DUEL_WIN } from '@/logic/xp';
import { useTr, type TranslationKey } from '@/i18n';
import { gameTitle } from '@/i18n/labels';
import { awardXp, settleRewards } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { SPEECH_RATE_SLOW, speakGerman } from '@/services/speech';
import { useDuel } from '@/store/duel';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { GameScreen, ReviewWords } from '@/ui/components/GameFrame';
import { VocabTapProvider } from '@/ui/components/MarkdownLite';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Round prompt per game; the copy lives at `duel.prompt.<game>`. */
const PROMPT_KEYS = {
  wortblitz: 'duel.prompt.wortblitz',
  derdiedas: 'duel.prompt.derdiedas',
  bilderraetsel: 'duel.prompt.bilderraetsel',
  konjugation: 'duel.prompt.konjugation',
  diktat: 'duel.prompt.diktat',
} as const satisfies Record<string, TranslationKey>;

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

function isSatzbau(q: DuelQuestion): q is SatzbauQuestion {
  return (q as SatzbauQuestion).tiles != null;
}

function isImageQuestion(q: ChoiceQuestion): q is ChoiceQuestion<ImageWord> {
  return typeof (q.word as ImageWord).svg === 'string';
}

function isKonjugation(q: ChoiceQuestion): q is KonjugationQuestion {
  return typeof (q as KonjugationQuestion).tag === 'string';
}

/** One leaderboard row, shared by the live and the final list. */
function StandingRow({
  row,
  badge,
  detail,
}: {
  row: DuelStanding;
  badge: string;
  detail: string;
}) {
  const t = useTheme();
  return (
    <Card style={[styles.resultRow, row.isMe && { borderColor: t.primary, borderWidth: 1.5 }]}>
      <AppText variant="subtitle" style={styles.rankBadge}>
        {badge}
      </AppText>
      <AppText variant="subtitle" numberOfLines={1} style={{ flex: 1 }}>
        {row.name}
        {row.isMe ? ' · du' : ''}
      </AppText>
      <AppText variant="caption" muted>
        {detail}
      </AppText>
      <AppText
        variant="subtitle"
        color={row.isMe ? t.primary : t.ink}
        style={{ fontFamily: fonts.extrabold, minWidth: 44, textAlign: 'right' }}>
        {row.score}
      </AppText>
    </Card>
  );
}

export default function DuelPlayScreen() {
  useKeepAwake();
  const t = useTheme();
  const tr = useTr();
  const insets = useSafeAreaInsets();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const duel = useDuel((s) => s.duel);
  const { dispatch, startRound, leave } = useDuel.getState();

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [countLeft, setCountLeft] = useState(3);
  // Diktat rounds: typed answer, grading feedback, TTS activity.
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<{ correct: boolean; nearMiss: boolean; text: string } | null>(
    null
  );
  const [speaking, setSpeaking] = useState(false);
  // Satzbau rounds: tile indexes placed so far.
  const [placed, setPlaced] = useState<number[]>([]);
  // Words answered wrong this round — dictionary chips on the result screen.
  const [reviewWords, setReviewWords] = useState<string[]>([]);

  const endAtRef = useRef(0);
  const recordedRef = useRef(false);
  const missedRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playCountRef = useRef(0);
  const inputRef = useRef<TextInput>(null);

  const phase = duel?.phase;

  // Clock ticks re-render constantly — only rebuild the scoreboard when the
  // actual scores change.
  const standings = useMemo(
    () => (duel ? duelStandings(duel) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duel?.me, duel?.peers, duel?.myId, duel?.myName]
  );

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Fresh round: reset local play state as soon as we see the phase flip to
  // countdown (React-recommended "adjust state during render" pattern, so
  // the reset lands in the same commit as the phase change).
  const [prevPhase, setPrevPhase] = useState(phase);
  if (phase !== prevPhase) {
    setPrevPhase(phase);
    if (phase === 'countdown' && duel) {
      setIndex(0);
      setSelected(null);
      setTyped('');
      setVerdict(null);
      setPlaced([]);
      setReviewWords([]);
      setRemaining(duel.durationMs);
      setCountLeft(Math.ceil(duel.countdownMs / 1000));
    }
  }

  // From the second listen of a word on, speak slower (same as solo Diktat).
  const speakWord = useCallback((text: string) => {
    playCountRef.current += 1;
    speakGerman(text, {
      rate: playCountRef.current >= 2 ? SPEECH_RATE_SLOW : undefined,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, []);

  // Diktat: each word announces itself once; the speaker button replays it.
  // Keyed on index/phase only — progress messages mutate `duel` constantly
  // and must not re-trigger the utterance.
  const diktatQ =
    duel?.game === 'diktat' && phase === 'playing' && !duel.me.finished
      ? duel.questions[index]
      : null;
  const diktatText = diktatQ != null && !isSatzbau(diktatQ) ? withArticle(diktatQ.word) : null;
  useEffect(() => {
    if (diktatText == null) return;
    playCountRef.current = 0;
    const timer = setTimeout(() => speakWord(diktatText), 350);
    timersRef.current.push(timer);
  }, [diktatText, speakWord]);

  // Each device counts down on its own clock from receipt of `start` — on a
  // LAN that skew is milliseconds against a 60s round, so no ping compensation.
  useEffect(() => {
    if (phase !== 'countdown' || !duel) return;
    recordedRef.current = false;
    missedRef.current = [];
    const countdownEnd = Date.now() + duel.countdownMs;
    const tick = setInterval(() => {
      const left = countdownEnd - Date.now();
      setCountLeft(Math.max(1, Math.ceil(left / 1000)));
      if (left <= 0) {
        endAtRef.current = Date.now() + duel.durationMs;
        dispatch({ type: 'countdownDone' });
      }
    }, 100);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Round clock — wall-clock based like the solo games, so paused JS frames
  // can't stretch the round.
  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = setInterval(() => {
      const left = Math.max(0, endAtRef.current - Date.now());
      setRemaining(left);
      if (left <= 0) dispatch({ type: 'localFinish' });
    }, 150);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Persist my own run once per round — duels count toward personal stats.
  useEffect(() => {
    if (phase !== 'done' || !duel || recordedRef.current) return;
    recordedRef.current = true;
    const won = duel.outcome === 'win' || duel.outcome === 'forfeitWin';
    // Sequenced: recordMistakes and recordGameResult each open a transaction
    // on the same connection — running them concurrently rejects the second.
    recordMistakes(missedRef.current, new Date())
      .catch(() => {})
      .then(() =>
        recordGameResult(
          {
            gameKey: duel.game,
            score: duel.me.score,
            correct: duel.me.correct,
            total: duel.me.total,
            bestStreak: duel.me.bestStreak,
            durationMs: duel.durationMs,
          },
          new Date()
        )
      )
      .then(() => awardXp(won ? 'duel_win' : 'duel_played', won ? XP_DUEL_WIN : XP_DUEL_PLAYED, new Date()))
      .then(() => settleRewards(new Date()))
      .catch(() => {});
    if (won) playSound('fanfare');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!duel) return null;

  const quit = () => {
    leave(); // sends bye — the rest of the room carries on without us
    router.back();
  };

  const answer = (i: number) => {
    const q = duel.questions[index];
    if (!q || isSatzbau(q) || selected != null || duel.me.finished || phase !== 'playing') return;
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
    dispatch({ type: 'localAnswer', correct });
    const timer = setTimeout(
      () => {
        setSelected(null);
        if (index + 1 >= duel.questions.length) dispatch({ type: 'localFinish' });
        else setIndex(index + 1);
      },
      correct ? 350 : 800
    );
    timersRef.current.push(timer);
  };

  /** Diktat: grade the typed word, flash the verdict, move on. */
  const submitTyped = () => {
    const q = duel.questions[index];
    if (!q || isSatzbau(q) || verdict != null || duel.me.finished || phase !== 'playing') return;
    if (!typed.trim()) return;
    const text = withArticle(q.word);
    const result = gradeDiktat(text, typed);
    if (!result.correct) {
      missedRef.current.push(q.word.id);
      setReviewWords((cur) => addReviewWord(cur, q.word.lemma));
    }
    playSound(result.correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        result.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
    setVerdict({ correct: result.correct, nearMiss: result.nearMiss, text });
    dispatch({ type: 'localAnswer', correct: result.correct });
    const timer = setTimeout(
      () => {
        setTyped('');
        setVerdict(null);
        if (index + 1 >= duel.questions.length) dispatch({ type: 'localFinish' });
        else setIndex(index + 1);
      },
      result.correct && !result.nearMiss ? 600 : 1500
    );
    timersRef.current.push(timer);
  };

  /** Satzbau: grade the built sentence, flash the solution, move on. */
  const submitSatzbau = () => {
    const q = duel.questions[index];
    if (!q || !isSatzbau(q) || verdict != null || duel.me.finished || phase !== 'playing') return;
    if (placed.length !== q.tiles.length) return;
    const correct = gradeSatzbau(q.solution, placed.map((i) => q.tiles[i].text));
    if (!correct) missedRef.current.push(q.lemmaId);
    playSound(correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    setVerdict({ correct, nearMiss: false, text: q.solution.join(' ') });
    dispatch({ type: 'localAnswer', correct });
    const timer = setTimeout(
      () => {
        setPlaced([]);
        setVerdict(null);
        if (index + 1 >= duel.questions.length) dispatch({ type: 'localFinish' });
        else setIndex(index + 1);
      },
      correct ? 700 : 2000
    );
    timersRef.current.push(timer);
  };

  const activeOthers = duel.peers.filter((p) => p.connected);

  // ---------- aborted (connection lost / we walked away) ----------
  if (phase === 'aborted') {
    return (
      <GameScreen>
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          <AppText style={{ fontSize: 44 }}>📡</AppText>
          <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
            {tr('duel.ended')}
          </AppText>
          <AppText variant="secondary" muted style={styles.message}>
            {tr('duel.connectionLost')}
          </AppText>
          <Pressable onPress={quit} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              {tr('common.back')}
            </AppText>
          </Pressable>
        </View>
      </GameScreen>
    );
  }

  // ---------- result: ranked leaderboard ----------
  if (phase === 'done' && duel.outcome != null) {
    const results = duelResults(duel);
    const { rank, of } = duelRank(results);
    const headline =
      duel.outcome === 'forfeitWin'
        ? { emoji: '🏆', title: tr('duel.result.forfeitWin') }
        : duel.outcome === 'win'
          ? { emoji: '🏆', title: tr('duel.result.win') }
          : duel.outcome === 'tie'
            ? { emoji: '🤝', title: tr('duel.result.tie') }
            : { emoji: rank <= 3 ? '🎉' : '😅', title: tr('duel.result.place', { rank, of }) };
    const isHost = duel.role === 'host';
    const hostConnected = isHost || duel.peers.some((p) => p.id === HOST_ID && p.connected);

    return (
      <VocabTapProvider>
      <GameScreen>
        <View style={[styles.center, { paddingTop: spacing.lg, paddingHorizontal: spacing.xl }]}>
          <AppText style={{ fontSize: 52 }}>{headline.emoji}</AppText>
          <AppText variant="title" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            {headline.title}
          </AppText>
          <AppText variant="caption" muted style={{ marginTop: spacing.xs }}>
            {tr('duel.result.meta', {
              game: gameTitle(tr, duel.game),
              bestStreak: duel.me.bestStreak,
            })}
            {duel.me.correct > 0
              ? tr('duel.result.perTask', {
                  seconds: (duel.durationMs / 1000 / duel.me.correct).toFixed(1),
                })
              : ''}
          </AppText>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
          {results.map((r) => {
            const rowRank = rankOf(results, r);
            return (
              <StandingRow
                key={r.id}
                row={r}
                badge={rowRank <= MEDALS.length ? MEDALS[rowRank - 1] : `${rowRank}.`}
                detail={`${r.correct}/${r.total}`}
              />
            );
          })}
          <ReviewWords words={reviewWords} />
          {!isHost && (
            <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: spacing.md }}>
              {hostConnected
                ? tr('duel.hostMayRestart')
                : tr('duel.hostLeft')}
            </AppText>
          )}
        </ScrollView>

        <View
          style={[styles.buttonRow, { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
          {isHost && (
            <Pressable
              disabled={activeOthers.length === 0}
              onPress={startRound}
              style={[
                styles.cta,
                styles.grow,
                { backgroundColor: activeOthers.length ? t.primaryDim : t.line, marginTop: 0 },
              ]}>
              <AppText
                variant="subtitle"
                color={activeOthers.length ? t.onPrimaryDim : t.inkFaint}>
                {tr('duel.newRound')}
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={quit} style={[styles.cta, styles.grow, { backgroundColor: t.primary, marginTop: 0 }]}>
            <AppText variant="subtitle" color="#fff">
              {tr('common.done')}
            </AppText>
          </Pressable>
        </View>
      </GameScreen>
      </VocabTapProvider>
    );
  }

  // ---------- lobby (next round being prepared) / countdown overlays ----------
  if (phase === 'lobby' || phase === 'countdown') {
    return (
      <GameScreen>
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          {phase === 'countdown' ? (
            <>
              <AppText color={t.primary} style={{ fontFamily: fonts.extrabold, fontSize: 96 }}>
                {countLeft}
              </AppText>
              <AppText variant="secondary" muted>
                {tr('duel.countdown', { game: gameTitle(tr, duel.game) })}{' '}
                {activeOthers.length === 1
                  ? tr('duel.versusOne', { name: activeOthers[0].name })
                  : tr('duel.versusMany', { count: activeOthers.length })}
              </AppText>
            </>
          ) : (
            <>
              <ActivityIndicator color={t.primary} />
              <AppText variant="secondary" muted style={styles.message}>
                {tr('duel.preparing')}
              </AppText>
            </>
          )}
        </View>
      </GameScreen>
    );
  }

  // ---------- playing ----------
  const q = duel.questions[index];
  const choiceQ = q != null && !isSatzbau(q) ? q : undefined;
  const satzbauQ = q != null && isSatzbau(q) ? q : undefined;
  const konjCtx =
    choiceQ != null && isKonjugation(choiceQ)
      ? konjugationContext(choiceQ.tag, choiceQ.word.aux)
      : null;
  const secondsLeft = Math.ceil(remaining / 1000);
  const urgent = remaining < 10_000;
  const { rank, of } = duelRank(standings);
  const rival = standings.find((r) => !r.isMe);

  return (
    <GameScreen>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={quit}>
          <Ionicons name="close" size={24} color={t.inkMuted} />
        </Pressable>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: urgent ? t.danger : t.primary,
                width: `${Math.round((remaining / Math.max(1, duel.durationMs)) * 100)}%`,
              },
            ]}
          />
        </View>
        <AppText variant="caption" color={urgent ? t.danger : t.inkMuted} style={styles.timerLabel}>
          {secondsLeft}s
        </AppText>
        <AppText variant="subtitle" color={t.primary} style={{ fontFamily: fonts.extrabold }}>
          {duel.me.score}
        </AppText>
      </View>

      {/* Live room strip — updated by relayed progress messages. */}
      <View style={[styles.oppStrip, { backgroundColor: t.surface, borderColor: t.line }]}>
        <AppText variant="caption" color={t.ink} style={{ fontFamily: fonts.extrabold }}>
          {tr('duel.standing', { rank, of })}
        </AppText>
        {rival && (
          <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
            {rank === 1 ? tr('duel.chaser') : tr('duel.leader')}: {rival.name} · {rival.score}
          </AppText>
        )}
      </View>

      {duel.me.finished ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
            <AppText variant="secondary" muted style={[styles.message, { marginBottom: spacing.md }]}>
              Fertig! Warte auf {standings.filter((r) => !r.finished).length} Spieler …
            </AppText>
          </View>
          {standings.map((r) => (
            <StandingRow
              key={r.id}
              row={r}
              badge={r.finished ? '✓' : '…'}
              detail={`${r.total} Aufgaben`}
            />
          ))}
        </ScrollView>
      ) : duel.game === 'satzbau' && satzbauQ != null ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled">
          {duel.me.streak >= 2 && (
            <View style={[styles.streakChip, { backgroundColor: t.primaryDim, alignSelf: 'center' }]}>
              <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                {tr('gameHud.streak', { count: duel.me.streak })}
              </AppText>
            </View>
          )}
          <AppText variant="secondary" muted style={{ textAlign: 'center' }}>
            “{satzbauQ.en}”
          </AppText>
          <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
            {tr('duel.satzbauPrompt')}
          </AppText>
          <View style={[styles.slot, { backgroundColor: t.surface, borderColor: t.inkFaint }]}>
            {placed.map((tileIdx, pos) => (
              <Pressable
                key={`${tileIdx}-${pos}`}
                disabled={verdict != null}
                onPress={() => setPlaced((p) => p.filter((_, j) => j !== pos))}
                style={[styles.tile, { backgroundColor: t.primaryDim, borderColor: t.primary }]}>
                <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  {satzbauQ.tiles[tileIdx].text}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.pool}>
            {satzbauQ.tiles.map((tile, i) => {
              const used = placed.includes(i);
              return (
                <Pressable
                  key={i}
                  disabled={verdict != null || used}
                  onPress={() => setPlaced((p) => [...p, i])}
                  style={[
                    styles.tile,
                    { backgroundColor: t.surface, borderColor: t.line },
                    used && { opacity: 0.25 },
                  ]}>
                  <AppText variant="secondary" style={{ fontFamily: fonts.extrabold }}>
                    {tile.text}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.verdictSlot}>
            {verdict != null && (
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
                  {verdict.correct ? tr('feedback.correct') : `✗ ${verdict.text}`}
                </AppText>
              </View>
            )}
          </View>
          {verdict == null && (
            <Pressable
              disabled={placed.length !== satzbauQ.tiles.length}
              onPress={submitSatzbau}
              style={[
                styles.cta,
                {
                  backgroundColor: placed.length === satzbauQ.tiles.length ? t.primary : t.line,
                  marginTop: spacing.sm,
                },
              ]}>
              <AppText
                variant="subtitle"
                color={placed.length === satzbauQ.tiles.length ? '#fff' : t.inkFaint}>
                {tr('common.check')}
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      ) : duel.game === 'diktat' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
            <View style={styles.speakerBlock}>
              {duel.me.streak >= 2 && (
                <View style={[styles.streakChip, { backgroundColor: t.primaryDim }]}>
                  <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                    {tr('gameHud.streak', { count: duel.me.streak })}
                  </AppText>
                </View>
              )}
              <Pressable
                onPress={() => choiceQ && speakWord(withArticle(choiceQ.word))}
                style={[styles.speaker, { backgroundColor: speaking ? t.primary : t.primaryDim }]}>
                <Ionicons name="volume-high" size={38} color={speaking ? '#fff' : t.onPrimaryDim} />
              </Pressable>
              <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
                {tr('duel.diktatReplayHint')}
              </AppText>
            </View>

            <View style={styles.verdictSlot}>
              {verdict != null && (
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
                        ? `✓ Fast! Richtig geschrieben: ${verdict.text}`
                        : `✓ ${verdict.text}`
                      : `✗ ${verdict.text}`}
                  </AppText>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ paddingBottom: spacing.xl }}>
              <View
                style={[
                  styles.inputBar,
                  {
                    backgroundColor: t.surface,
                    borderColor: verdict != null ? (verdict.correct ? t.accent : t.danger) : t.line,
                  },
                ]}>
                <TextInput
                  ref={inputRef}
                  value={typed}
                  onChangeText={setTyped}
                  editable={verdict == null}
                  placeholder={tr('game.diktat.placeholder')}
                  placeholderTextColor={t.inkFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  submitBehavior="submit"
                  onSubmitEditing={submitTyped}
                  style={[styles.input, { color: t.ink }]}
                />
                <Pressable
                  hitSlop={8}
                  disabled={verdict != null || typed.trim().length === 0}
                  onPress={submitTyped}>
                  <Ionicons
                    name="checkmark-circle"
                    size={30}
                    color={typed.trim().length > 0 && verdict == null ? t.primary : t.inkFaint}
                  />
                </Pressable>
              </View>
              <View style={styles.umlautRow}>
                {UMLAUTS.map((u) => (
                  <Pressable
                    key={u}
                    disabled={verdict != null}
                    onPress={() => {
                      setTyped((cur) => cur + u);
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
      ) : (
        <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
          <View style={[styles.fill, styles.center]}>
            {duel.me.streak >= 2 && (
              <View style={[styles.streakChip, { backgroundColor: t.primaryDim }]}>
                <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  {tr('gameHud.streak', { count: duel.me.streak })}
                </AppText>
              </View>
            )}
            {choiceQ && isImageQuestion(choiceQ) ? (
              <VocabImage svg={choiceQ.word.svg} gender={null} size={150} />
            ) : (
              <AppText
                variant="headword"
                style={{ textAlign: 'center', width: '100%' }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}>
                {choiceQ?.word.lemma}
              </AppText>
            )}
            {duel.game === 'derdiedas' && choiceQ != null && (
              <AppText variant="secondary" muted style={{ marginTop: spacing.xs }}>
                {shortGloss(choiceQ.word.gloss)}
              </AppText>
            )}
            {konjCtx != null && (
              <View style={[styles.konjChip, { backgroundColor: t.primaryDim }]}>
                <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  {konjCtx.lead} ___ · {konjCtx.tense}
                </AppText>
              </View>
            )}
            <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
              {tr(PROMPT_KEYS[duel.game as keyof typeof PROMPT_KEYS] ?? PROMPT_KEYS.wortblitz)}
            </AppText>
          </View>

          <View style={{ gap: spacing.sm, paddingBottom: spacing.xl }}>
            {choiceQ?.options.map((opt, i) => {
              const showState = selected != null;
              const isCorrect = i === choiceQ.correctIndex;
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
      )}
    </GameScreen>
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
    marginBottom: spacing.sm,
  },
  bar: { flex: 1, height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  timerLabel: { minWidth: 30, textAlign: 'right' },
  oppStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  streakChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: spacing.md,
  },
  speakerBlock: { alignItems: 'center', marginTop: spacing.lg },
  konjChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  slot: {
    minHeight: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignContent: 'flex-start',
    marginTop: spacing.sm,
  },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tile: {
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  speaker: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictSlot: { minHeight: 56, marginTop: spacing.md, justifyContent: 'center' },
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
    borderRadius: 14,
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
  option: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  message: { marginTop: spacing.lg, textAlign: 'center', lineHeight: 22 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rankBadge: { minWidth: 34, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
  grow: { flex: 1 },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
