import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchGameWords, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import {
  buildPairsBoards,
  gameInfo,
  PAIRS_PER_BOARD,
  pairsBoardScore,
  type PairsBoard,
} from '@/logic/games';
import { settleGameRound } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('wortpaare');
const POOL_SIZE = 60;

type Phase = 'intro' | 'playing' | 'done';

export default function WortpaareScreen() {
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [boards, setBoards] = useState<PairsBoard[]>([]);
  const [boardIdx, setBoardIdx] = useState(0);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [selDe, setSelDe] = useState<number | null>(null);
  const [selEn, setSelEn] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ de: number; en: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [pairsFound, setPairsFound] = useState(0);
  const [interstitial, setInterstitial] = useState<{ points: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
  const [xpEarned, setXpEarned] = useState<number | null>(null);

  const boardStartRef = useRef(0);
  const totalMsRef = useRef(0);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('wortpaare')?.best ?? null));
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  // Visible clock per board — the speed bonus depends on it.
  useEffect(() => {
    if (phase !== 'playing' || interstitial) return;
    const tick = setInterval(() => setElapsed(Date.now() - boardStartRef.current), 500);
    return () => clearInterval(tick);
  }, [phase, interstitial]);

  const start = async () => {
    const pool = await fetchGameWords(POOL_SIZE);
    const seed = Date.now() & 0x7fffffff;
    setBoards(buildPairsBoards(pool, seed));
    setBoardIdx(0);
    setMatched(new Set());
    setSelDe(null);
    setSelEn(null);
    setWrong(null);
    setMistakes(0);
    setTotalMistakes(0);
    setScore(0);
    setPairsFound(0);
    setInterstitial(null);
    setOutcome(null);
    setXpEarned(null);
    setElapsed(0);
    finishedRef.current = false;
    totalMsRef.current = 0;
    boardStartRef.current = Date.now();
    setPhase('playing');
  };

  const finish = (finalScore: number, found: number, misses: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    recordGameResult(
      {
        gameKey: 'wortpaare',
        score: finalScore,
        correct: found,
        total: found + misses,
        bestStreak: 0,
        durationMs: totalMsRef.current,
      },
      new Date()
    ).then(async (res) => {
      setOutcome(res);
      setBest((b) => Math.max(b ?? 0, finalScore));
      setXpEarned(await settleGameRound(INFO.title, finalScore, res, new Date()));
      setPhase('done');
    });
  };

  const board = boards[boardIdx];

  const tap = (side: 'de' | 'en', pairId: number) => {
    if (!board || wrong || interstitial || finishedRef.current || matched.has(pairId)) return;
    const de = side === 'de' ? (selDe === pairId ? null : pairId) : selDe;
    const en = side === 'en' ? (selEn === pairId ? null : pairId) : selEn;
    if (de == null || en == null) {
      setSelDe(de);
      setSelEn(en);
      return;
    }
    if (de === en) {
      // match
      playSound('correct');
      if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const nextMatched = new Set(matched).add(de);
      setMatched(nextMatched);
      setSelDe(null);
      setSelEn(null);
      const found = pairsFound + 1;
      setPairsFound(found);
      if (nextMatched.size === PAIRS_PER_BOARD) {
        const boardMs = Date.now() - boardStartRef.current;
        totalMsRef.current += boardMs;
        const points = pairsBoardScore(PAIRS_PER_BOARD, mistakes, boardMs);
        const nextScore = score + points;
        setScore(nextScore);
        if (boardIdx + 1 >= boards.length) {
          finish(nextScore, found, totalMistakes);
        } else {
          setInterstitial({ points });
        }
      }
    } else {
      // mismatch — flash, count, clear
      playSound('wrong');
      if (haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelDe(de);
      setSelEn(en);
      setWrong({ de, en });
      setMistakes((m) => m + 1);
      setTotalMistakes((m) => m + 1);
      const timer = setTimeout(() => {
        setWrong(null);
        setSelDe(null);
        setSelEn(null);
      }, 650);
      timersRef.current.push(timer);
    }
  };

  const nextBoard = () => {
    setBoardIdx((i) => i + 1);
    setMatched(new Set());
    setSelDe(null);
    setSelEn(null);
    setWrong(null);
    setMistakes(0);
    setInterstitial(null);
    setElapsed(0);
    boardStartRef.current = Date.now();
  };

  if (phase === 'intro') return <GameIntro info={INFO} best={best} onStart={start} />;

  if (phase === 'done') {
    const totalPairs = boards.length * PAIRS_PER_BOARD;
    return (
      <GameResult
        info={INFO}
        score={score}
        outcome={outcome}
        xpEarned={xpEarned}
        stats={[
          { label: 'Paare', value: `${pairsFound}/${totalPairs}` },
          { label: 'Fehlversuche', value: `${totalMistakes}` },
          { label: 'Zeit', value: `${Math.round(totalMsRef.current / 1000)}s` },
        ]}
        onRetry={start}
      />
    );
  }

  const tileState = (side: 'de' | 'en', pairId: number) => {
    const isMatched = matched.has(pairId);
    const isWrong = wrong != null && (side === 'de' ? wrong.de : wrong.en) === pairId;
    const isSel = (side === 'de' ? selDe : selEn) === pairId;
    if (isMatched) return { bg: t.accentDim, border: t.accent, fg: t.onAccentDim, dim: true };
    if (isWrong) return { bg: t.dangerDim, border: t.danger, fg: t.onDangerDim, dim: false };
    if (isSel) return { bg: t.primaryDim, border: t.primary, fg: t.onPrimaryDim, dim: false };
    return { bg: t.surface, border: t.line, fg: t.ink, dim: false };
  };

  return (
    <GameScreen>
      <GameTopBar>
        <AppText variant="caption" muted>
          Runde {boardIdx + 1}/{boards.length}
        </AppText>
        <View style={{ flex: 1 }} />
        <AppText variant="caption" muted>
          ⏱ {Math.floor(elapsed / 1000)}s
        </AppText>
        <AppText variant="subtitle" color={t.primary} style={{ fontFamily: fonts.extrabold }}>
          {score}
        </AppText>
      </GameTopBar>

      {interstitial ? (
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          <AppText style={{ fontSize: 52 }}>🎉</AppText>
          <AppText variant="title" style={{ marginTop: spacing.md }}>
            Runde geschafft!
          </AppText>
          <AppText variant="subtitle" color={t.primary} style={{ marginTop: spacing.sm }}>
            +{interstitial.points} Punkte
          </AppText>
          <Pressable
            onPress={nextBoard}
            style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xl }]}>
            <AppText variant="subtitle" color="#fff">
              Weiter →
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fill, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
          <AppText variant="secondary" muted style={{ textAlign: 'center', marginBottom: spacing.md }}>
            Finde die passenden Paare
          </AppText>
          <View style={styles.columns}>
            <View style={styles.column}>
              {board?.de.map((tile) => {
                const s = tileState('de', tile.pairId);
                return (
                  <Pressable
                    key={tile.pairId}
                    disabled={matched.has(tile.pairId)}
                    onPress={() => tap('de', tile.pairId)}
                    style={[
                      styles.tile,
                      { backgroundColor: s.bg, borderColor: s.border },
                      s.dim && { opacity: 0.45 },
                    ]}>
                    <AppText
                      variant="secondary"
                      color={s.fg}
                      numberOfLines={2}
                      style={{ fontFamily: fonts.extrabold, textAlign: 'center' }}>
                      {tile.text}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.column}>
              {board?.en.map((tile) => {
                const s = tileState('en', tile.pairId);
                return (
                  <Pressable
                    key={tile.pairId}
                    disabled={matched.has(tile.pairId)}
                    onPress={() => tap('en', tile.pairId)}
                    style={[
                      styles.tile,
                      { backgroundColor: s.bg, borderColor: s.border },
                      s.dim && { opacity: 0.45 },
                    ]}>
                    <AppText
                      variant="secondary"
                      color={s.fg}
                      numberOfLines={2}
                      style={{ textAlign: 'center' }}>
                      {tile.text}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  columns: { flex: 1, flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  tile: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
