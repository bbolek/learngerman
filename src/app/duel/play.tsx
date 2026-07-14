import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recordGameResult } from '@/db/gamesRepo';
import { recordMistakes } from '@/db/mistakesRepo';
import {
  duelRank,
  duelResults,
  duelStandings,
  HOST_ID,
  rankOf,
  type DuelStanding,
} from '@/logic/duel';
import { gameInfo, shortGloss, type ChoiceQuestion, type ImageWord } from '@/logic/games';
import { XP_DUEL_PLAYED, XP_DUEL_WIN } from '@/logic/xp';
import { awardXp, settleRewards } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { useDuel } from '@/store/duel';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { GameScreen } from '@/ui/components/GameFrame';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const MEDALS = ['🥇', '🥈', '🥉'];

const PROMPTS: Record<string, string> = {
  wortblitz: 'Was bedeutet das?',
  derdiedas: 'Der, die oder das?',
  bilderraetsel: 'Was ist das?',
};

function isImageQuestion(q: ChoiceQuestion): q is ChoiceQuestion<ImageWord> {
  return typeof (q.word as ImageWord).svg === 'string';
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
  const insets = useSafeAreaInsets();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const duel = useDuel((s) => s.duel);
  const { dispatch, startRound, leave } = useDuel.getState();

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [countLeft, setCountLeft] = useState(3);

  const endAtRef = useRef(0);
  const recordedRef = useRef(false);
  const missedRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const phase = duel?.phase;

  // Clock ticks re-render constantly — only rebuild the scoreboard when the
  // actual scores change.
  const standings = useMemo(
    () => (duel ? duelStandings(duel) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duel?.me, duel?.peers, duel?.myId, duel?.myName]
  );

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Fresh round: reset local play state and run the 3-2-1 countdown. Each
  // device counts down on its own clock from receipt of `start` — on a LAN
  // that skew is milliseconds against a 60s round, so no ping compensation.
  useEffect(() => {
    if (phase !== 'countdown' || !duel) return;
    setIndex(0);
    setSelected(null);
    recordedRef.current = false;
    missedRef.current = [];
    setRemaining(duel.durationMs);
    const countdownEnd = Date.now() + duel.countdownMs;
    setCountLeft(Math.ceil(duel.countdownMs / 1000));
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
    recordMistakes(missedRef.current, new Date()).catch(() => {});
    const won = duel.outcome === 'win' || duel.outcome === 'forfeitWin';
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
    if (!q || selected != null || duel.me.finished || phase !== 'playing') return;
    const correct = i === q.correctIndex;
    if (!correct) missedRef.current.push(q.word.id);
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

  const activeOthers = duel.peers.filter((p) => p.connected);

  // ---------- aborted (connection lost / we walked away) ----------
  if (phase === 'aborted') {
    return (
      <GameScreen>
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          <AppText style={{ fontSize: 44 }}>📡</AppText>
          <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
            Duell beendet
          </AppText>
          <AppText variant="secondary" muted style={styles.message}>
            Die Verbindung wurde getrennt.
          </AppText>
          <Pressable onPress={quit} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              Zurück
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
        ? { emoji: '🏆', title: 'Alle anderen sind raus — du gewinnst!' }
        : duel.outcome === 'win'
          ? { emoji: '🏆', title: 'Gewonnen!' }
          : duel.outcome === 'tie'
            ? { emoji: '🤝', title: 'Unentschieden an der Spitze!' }
            : { emoji: rank <= 3 ? '🎉' : '😅', title: `Platz ${rank} von ${of}` };
    const isHost = duel.role === 'host';
    const hostConnected = isHost || duel.peers.some((p) => p.id === HOST_ID && p.connected);

    return (
      <GameScreen>
        <View style={[styles.center, { paddingTop: spacing.lg, paddingHorizontal: spacing.xl }]}>
          <AppText style={{ fontSize: 52 }}>{headline.emoji}</AppText>
          <AppText variant="title" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            {headline.title}
          </AppText>
          <AppText variant="caption" muted style={{ marginTop: spacing.xs }}>
            {gameInfo(duel.game).title} · Beste Serie: {duel.me.bestStreak}
            {duel.me.correct > 0
              ? ` · ${(duel.durationMs / 1000 / duel.me.correct).toFixed(1)}s pro Aufgabe`
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
          {!isHost && (
            <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: spacing.md }}>
              {hostConnected
                ? 'Der Host kann eine neue Runde starten — bleib einfach hier.'
                : 'Der Host hat das Duell verlassen.'}
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
                Neue Runde
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={quit} style={[styles.cta, styles.grow, { backgroundColor: t.primary, marginTop: 0 }]}>
            <AppText variant="subtitle" color="#fff">
              Fertig
            </AppText>
          </Pressable>
        </View>
      </GameScreen>
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
                {gameInfo(duel.game).title} —{' '}
                {activeOthers.length === 1
                  ? `gegen ${activeOthers[0].name}!`
                  : `gegen ${activeOthers.length} Mitspieler!`}
              </AppText>
            </>
          ) : (
            <>
              <ActivityIndicator color={t.primary} />
              <AppText variant="secondary" muted style={styles.message}>
                Neue Runde wird vorbereitet …
              </AppText>
            </>
          )}
        </View>
      </GameScreen>
    );
  }

  // ---------- playing ----------
  const q = duel.questions[index];
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
          🏅 Platz {rank}/{of}
        </AppText>
        {rival && (
          <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
            {rank === 1 ? 'Verfolger' : 'Vorne'}: {rival.name} · {rival.score}
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
      ) : (
        <View style={[styles.fill, { paddingHorizontal: spacing.lg }]}>
          <View style={[styles.fill, styles.center]}>
            {duel.me.streak >= 2 && (
              <View style={[styles.streakChip, { backgroundColor: t.primaryDim }]}>
                <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  🔥 Serie ×{duel.me.streak}
                </AppText>
              </View>
            )}
            {q && isImageQuestion(q) ? (
              <VocabImage svg={q.word.svg} gender={null} size={150} />
            ) : (
              <AppText variant="headword" style={{ textAlign: 'center' }}>
                {q?.word.lemma}
              </AppText>
            )}
            {duel.game === 'derdiedas' && q != null && (
              <AppText variant="secondary" muted style={{ marginTop: spacing.xs }}>
                {shortGloss(q.word.gloss)}
              </AppText>
            )}
            <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
              {PROMPTS[duel.game] ?? PROMPTS.wortblitz}
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
