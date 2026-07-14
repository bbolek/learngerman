import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type RecordOutcome } from '@/db/gamesRepo';
import { type GameInfo } from '@/logic/games';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** Full-screen container with safe-area padding for game routes. */
export function GameScreen({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      {children}
    </View>
  );
}

/** Top row: close button plus game-specific content (timer, score, lives …). */
export function GameTopBar({ children }: { children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.top}>
      <Pressable hitSlop={10} onPress={() => router.back()}>
        <Ionicons name="close" size={24} color={t.inkMuted} />
      </Pressable>
      {children}
    </View>
  );
}

/** Rules + start CTA shown before a round begins. */
export function GameIntro({
  info,
  best,
  onStart,
}: {
  info: GameInfo;
  best: number | null;
  onStart: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <GameScreen>
      <GameTopBar />
      <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
        <AppText style={{ fontSize: 64 }}>{info.emoji}</AppText>
        <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          {info.title}
        </AppText>
        {best != null && best > 0 && (
          <View style={[styles.recordChip, { backgroundColor: t.accentDim }]}>
            <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
              🏆 Dein Rekord: {best}
            </AppText>
          </View>
        )}
        <Card style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}>
          <AppText variant="label" muted>
            So geht&apos;s
          </AppText>
          <AppText variant="body" style={{ marginTop: spacing.sm, lineHeight: 23 }}>
            {info.rules}
          </AppText>
        </Card>
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md }}>
        <Pressable onPress={onStart} style={[styles.cta, { backgroundColor: t.primary }]}>
          <AppText variant="subtitle" color="#fff">
            Los geht&apos;s! →
          </AppText>
        </Pressable>
      </View>
    </GameScreen>
  );
}

/** End-of-round summary: score, record banner, stat tiles, retry/done. */
export function GameResult({
  info,
  score,
  outcome,
  xpEarned,
  stats,
  onRetry,
}: {
  info: GameInfo;
  score: number;
  outcome: RecordOutcome | null;
  /** XP paid out for this round (shown as a chip when set). */
  xpEarned?: number | null;
  stats: { label: string; value: string }[];
  onRetry: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const newRecord = outcome?.newRecord ?? false;
  return (
    <GameScreen>
      <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
        <AppText style={{ fontSize: 52 }}>{newRecord ? '🏆' : info.emoji}</AppText>
        <AppText variant="title" style={{ marginTop: spacing.md, textAlign: 'center' }}>
          {newRecord ? 'Neuer Rekord!' : 'Runde vorbei!'}
        </AppText>
        <AppText variant="headword" color={t.primary} style={{ marginTop: spacing.md }}>
          {score}
        </AppText>
        <AppText variant="secondary" muted>
          Punkte · {info.title}
        </AppText>
        {xpEarned != null && xpEarned > 0 && (
          <View style={[styles.recordChip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              ⭐ +{xpEarned} XP
            </AppText>
          </View>
        )}
        {!newRecord && outcome != null && outcome.previousBest > 0 && (
          <View style={[styles.recordChip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              🏆 Rekord: {outcome.previousBest}
            </AppText>
          </View>
        )}
        <View style={styles.statRow}>
          {stats.map((s) => (
            <Card key={s.label} style={styles.statTile}>
              <AppText variant="subtitle">{s.value}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2, textAlign: 'center' }}>
                {s.label}
              </AppText>
            </Card>
          ))}
        </View>
      </View>
      <View
        style={[
          styles.buttonRow,
          { paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.md },
        ]}>
        <Pressable onPress={onRetry} style={[styles.cta, styles.grow, { backgroundColor: t.primaryDim }]}>
          <AppText variant="subtitle" color={t.onPrimaryDim}>
            Nochmal
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={[styles.cta, styles.grow, { backgroundColor: t.primary }]}>
          <AppText variant="subtitle" color="#fff">
            Fertig
          </AppText>
        </Pressable>
      </View>
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
  recordChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, alignSelf: 'stretch' },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  grow: { flex: 1 },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
