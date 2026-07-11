import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recordGameResult } from '@/db/gamesRepo';
import { type DuelOutcome } from '@/logic/duel';
import { useDuel } from '@/store/duel';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { GameScreen } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const RESULT_COPY: Record<DuelOutcome, { emoji: string; title: string }> = {
  win: { emoji: '🏆', title: 'Gewonnen!' },
  lose: { emoji: '😅', title: 'Verloren' },
  tie: { emoji: '🤝', title: 'Unentschieden!' },
  forfeitWin: { emoji: '🏆', title: 'Dein Gegenüber hat aufgegeben — du gewinnst!' },
};

export default function DuelWortblitzScreen() {
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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const phase = duel?.phase;

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Rematch: both sides land back in 'lobby'; the host kicks off round two.
  useEffect(() => {
    if (phase === 'lobby' && duel?.role === 'host') startRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Fresh round: reset local play state and run the 3-2-1 countdown. Each
  // device counts down on its own clock from receipt of `start` — on a LAN
  // that skew is milliseconds against a 60s round, so no ping compensation.
  useEffect(() => {
    if (phase !== 'countdown' || !duel) return;
    setIndex(0);
    setSelected(null);
    recordedRef.current = false;
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

  // Round clock — wall-clock based like the solo game, so paused JS frames
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
    recordGameResult(
      {
        gameKey: 'wortblitz',
        score: duel.me.score,
        correct: duel.me.correct,
        total: duel.me.total,
        bestStreak: duel.me.bestStreak,
        durationMs: duel.durationMs,
      },
      new Date()
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!duel) return null;

  const quit = () => {
    leave(); // sends bye — the opponent gets a forfeit win
    router.back();
  };

  const answer = (i: number) => {
    const q = duel.questions[index];
    if (!q || selected != null || duel.me.finished || phase !== 'playing') return;
    const correct = i === q.correctIndex;
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

  // ---------- aborted (peer left in a non-forfeit way / connection lost) ----------
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

  // ---------- result ----------
  if (phase === 'done' && duel.outcome != null) {
    const copy = RESULT_COPY[duel.outcome];
    const waitingForOpp = duel.rematch.me && !duel.rematch.opp;
    return (
      <GameScreen>
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          <AppText style={{ fontSize: 52 }}>{copy.emoji}</AppText>
          <AppText variant="title" style={{ marginTop: spacing.md, textAlign: 'center' }}>
            {copy.title}
          </AppText>
          <View style={styles.scoreRow}>
            <Card style={[styles.scoreTile, duel.outcome !== 'lose' && { borderColor: t.accent }]}>
              <AppText variant="caption" muted numberOfLines={1}>
                Du
              </AppText>
              <AppText variant="section" color={t.primary} style={{ fontFamily: fonts.extrabold }}>
                {duel.me.score}
              </AppText>
              <AppText variant="caption" muted>
                {duel.me.correct}/{duel.me.total} richtig
              </AppText>
            </Card>
            <AppText variant="subtitle" muted>
              vs.
            </AppText>
            <Card style={[styles.scoreTile, duel.outcome === 'lose' && { borderColor: t.accent }]}>
              <AppText variant="caption" muted numberOfLines={1}>
                {duel.oppName ?? 'Gegner'}
              </AppText>
              <AppText variant="section" style={{ fontFamily: fonts.extrabold }}>
                {duel.opp.score}
              </AppText>
              <AppText variant="caption" muted>
                {duel.opp.correct}/{duel.opp.total} richtig
              </AppText>
            </Card>
          </View>
          <View style={styles.statRow}>
            <Card style={styles.statTile}>
              <AppText variant="subtitle">{duel.me.bestStreak}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Beste Serie
              </AppText>
            </Card>
            <Card style={styles.statTile}>
              <AppText variant="subtitle">
                {duel.me.correct > 0 ? `${(duel.durationMs / 1000 / duel.me.correct).toFixed(1)}s` : '–'}
              </AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Pro Wort
              </AppText>
            </Card>
          </View>
        </View>
        <View
          style={[styles.buttonRow, { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            disabled={!duel.peerConnected || waitingForOpp}
            onPress={() => dispatch({ type: 'localRematch' })}
            style={[
              styles.cta,
              styles.grow,
              { backgroundColor: duel.peerConnected ? t.primaryDim : t.line, marginTop: 0 },
            ]}>
            {waitingForOpp ? (
              <ActivityIndicator color={t.onPrimaryDim} />
            ) : (
              <AppText variant="subtitle" color={duel.peerConnected ? t.onPrimaryDim : t.inkFaint}>
                Revanche
              </AppText>
            )}
          </Pressable>
          <Pressable onPress={quit} style={[styles.cta, styles.grow, { backgroundColor: t.primary, marginTop: 0 }]}>
            <AppText variant="subtitle" color="#fff">
              Fertig
            </AppText>
          </Pressable>
        </View>
      </GameScreen>
    );
  }

  // ---------- lobby (rematch being prepared) / countdown overlays ----------
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
                Gleich geht's los — gegen {duel.oppName ?? '…'}!
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

      {/* Live opponent strip — updated by incoming progress messages. */}
      <View style={[styles.oppStrip, { backgroundColor: t.surface, borderColor: t.line }]}>
        <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          👤 {duel.oppName ?? 'Gegner'}
        </AppText>
        {duel.opp.finished && (
          <AppText variant="caption" color={t.accent} style={{ fontFamily: fonts.extrabold }}>
            ✓ fertig
          </AppText>
        )}
        <AppText variant="caption" muted>
          {duel.opp.total} Wörter
        </AppText>
        <AppText variant="caption" color={t.ink} style={{ fontFamily: fonts.extrabold }}>
          {duel.opp.score}
        </AppText>
      </View>

      {duel.me.finished ? (
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          <ActivityIndicator color={t.primary} />
          <AppText variant="secondary" muted style={styles.message}>
            Fertig! Warte auf {duel.oppName ?? 'Gegner'} … ({duel.opp.score} Punkte)
          </AppText>
        </View>
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  scoreTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderWidth: 1.5 },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, alignSelf: 'stretch' },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  grow: { flex: 1 },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
