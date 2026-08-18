import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchSentenceWords, recordGameResult, statsByGame, type RecordOutcome } from '@/db/gamesRepo';
import { recordMistakes } from '@/db/mistakesRepo';
import {
  applyArcadeAnswer,
  buildSatzbauQuestions,
  gameInfo,
  gradeSatzbau,
  initialArcade,
  SATZBAU_LIVES,
  type ArcadeState,
  type SatzbauQuestion,
} from '@/logic/games';
import { useTr } from '@/i18n';
import { gameTitle } from '@/i18n/labels';
import { settleGameRound } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { GameIntro, GameResult, GameScreen, GameTopBar } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const INFO = gameInfo('satzbau');
const POOL_SIZE = 80;

type Phase = 'intro' | 'playing' | 'done';
type Verdict = 'correct' | 'wrong' | null;

export default function SatzbauScreen() {
  const t = useTheme();
  const tr = useTr();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<Phase>('intro');
  const [best, setBest] = useState<number | null>(null);
  const [questions, setQuestions] = useState<SatzbauQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [arcade, setArcade] = useState<ArcadeState>(initialArcade(SATZBAU_LIVES));
  const [placed, setPlaced] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);
  const [xpEarned, setXpEarned] = useState<number | null>(null);

  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);
  const missedRef = useRef<number[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    statsByGame().then((s) => setBest(s.get('satzbau')?.best ?? null));
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const start = async () => {
    const pool = await fetchSentenceWords(POOL_SIZE);
    const seed = Date.now() & 0x7fffffff;
    setQuestions(buildSatzbauQuestions(pool, seed));
    setIndex(0);
    setArcade(initialArcade(SATZBAU_LIVES));
    setPlaced([]);
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
            gameKey: 'satzbau',
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
        setXpEarned(await settleGameRound(gameTitle(tr, INFO.key), s.score, res, new Date()));
      } catch {
        // persistence failed — still end the round instead of stranding it
      }
      setPhase('done');
    })();
  }, [tr]);

  const grade = (q: SatzbauQuestion, tileIds: number[]) => {
    const sequence = tileIds.map((id) => q.tiles.find((tile) => tile.id === id)!.text);
    const correct = gradeSatzbau(q.solution, sequence);
    if (!correct) missedRef.current.push(q.lemmaId);
    playSound(correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    setVerdict(correct ? 'correct' : 'wrong');
    const next = applyArcadeAnswer(arcade, correct);
    setArcade(next);
    const timer = setTimeout(
      () => {
        if (next.lives <= 0 || index + 1 >= questions.length) {
          finish(next);
        } else {
          setPlaced([]);
          setVerdict(null);
          setIndex(index + 1);
        }
      },
      correct ? 700 : 2200
    );
    timersRef.current.push(timer);
  };

  const placeTile = (id: number) => {
    const q = questions[index];
    if (!q || verdict != null || finishedRef.current || placed.includes(id)) return;
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...placed, id];
    setPlaced(next);
    // The last tile completes the sentence — grade right away.
    if (next.length === q.tiles.length) grade(q, next);
  };

  const removeTile = (id: number) => {
    if (verdict != null) return;
    setPlaced((cur) => cur.filter((tid) => tid !== id));
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
          { label: tr('gameStats.correct'), value: `${arcade.correct}/${arcade.total}` },
          { label: tr('gameStats.bestStreak'), value: `${arcade.bestStreak}` },
          {
            label: tr('gameStats.accuracy'),
            value: arcade.total > 0 ? `${Math.round((arcade.correct / arcade.total) * 100)}%` : '–',
          },
        ]}
        onRetry={start}
      />
    );
  }

  const q = questions[index];

  return (
    <GameScreen>
      <GameTopBar>
        <View style={styles.lives}>
          {Array.from({ length: SATZBAU_LIVES }, (_, i) => (
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
        <AppText variant="secondary" muted style={{ marginTop: spacing.md, textAlign: 'center' }}>
          “{q?.en}”
        </AppText>

        <View style={[styles.answerArea, { borderColor: t.line }]}>
          {placed.length === 0 && (
            <AppText variant="secondary" color={t.inkFaint}>
              {tr('game.satzbau.prompt')}
            </AppText>
          )}
          {placed.map((id) => {
            const tile = q?.tiles.find((tl) => tl.id === id);
            return (
              <Pressable
                key={id}
                disabled={verdict != null}
                onPress={() => removeTile(id)}
                style={[styles.tile, { backgroundColor: t.primaryDim, borderColor: 'transparent' }]}>
                <AppText variant="subtitle" color={t.onPrimaryDim} style={{ fontSize: 16 }}>
                  {tile?.text}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.verdictSlot}>
          {verdict != null && q && (
            <View
              style={[
                styles.verdictChip,
                { backgroundColor: verdict === 'correct' ? t.accentDim : t.dangerDim },
              ]}>
              <AppText
                variant="secondary"
                color={verdict === 'correct' ? t.onAccentDim : t.onDangerDim}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontFamily: fonts.extrabold, textAlign: 'center' }}>
                {verdict === 'correct' ? tr('feedback.correct') : `✗ ${q.solution.join(' ')}`}
              </AppText>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }} />

        <View style={[styles.pool, { paddingBottom: spacing.xl }]}>
          {q?.tiles.map((tile) => {
            const used = placed.includes(tile.id);
            return (
              <Pressable
                key={tile.id}
                disabled={used || verdict != null}
                onPress={() => placeTile(tile.id)}
                style={[
                  styles.tile,
                  used
                    ? { backgroundColor: 'transparent', borderColor: t.line }
                    : { backgroundColor: t.surface, borderColor: t.line },
                ]}>
                <AppText
                  variant="subtitle"
                  color={used ? 'transparent' : t.ink}
                  style={{ fontSize: 16 }}>
                  {tile.text}
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
  lives: { flexDirection: 'row', gap: 3 },
  streakChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  answerArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    minHeight: 118,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  verdictSlot: { minHeight: 52, marginTop: spacing.md, justifyContent: 'center' },
  verdictChip: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  pool: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  tile: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
