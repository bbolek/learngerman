import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { statsByGame, type GameStats } from '@/db/gamesRepo';
import { useTr } from '@/i18n';
import { gameTagline, gameTitle } from '@/i18n/labels';
import { GAMES, type GameInfo, type GameKey } from '@/logic/games';
import { TourTarget } from '@/tour/TourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function GamesScreen() {
  const tr = useTr();
  const [stats, setStats] = useState<Map<GameKey, GameStats>>(new Map());

  useFocusEffect(
    useCallback(() => {
      statsByGame().then(setStats);
    }, [])
  );

  const totalPlays = [...stats.values()].reduce((sum, s) => sum + s.plays, 0);
  const totalScore = [...stats.values()].reduce((sum, s) => sum + s.totalScore, 0);
  const bestStreak = Math.max(0, ...[...stats.values()].map((s) => s.bestStreak));

  return (
    <Screen>
      <AppText variant="section">{tr('games.title')}</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {tr('games.subtitle')}
      </AppText>

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>🎮</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {totalPlays}
          </AppText>
          <AppText variant="caption" muted>
            {tr('games.stat.rounds')}
          </AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>🏅</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {totalScore}
          </AppText>
          <AppText variant="caption" muted>
            {tr('games.stat.points')}
          </AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText style={{ fontSize: 22 }}>🔥</AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {bestStreak}
          </AppText>
          <AppText variant="caption" muted>
            {tr('games.stat.bestStreak')}
          </AppText>
        </Card>
      </View>

      <TourTarget id="games-grid" style={{ marginTop: spacing.lg, gap: spacing.md }}>
        {GAMES.map((game) => (
          <GameCard key={game.key} game={game} stats={stats.get(game.key)} />
        ))}
        <DuelCard />
      </TourTarget>
    </Screen>
  );
}

function DuelCard() {
  const t = useTheme();
  const tr = useTr();
  return (
    <Card style={styles.game} onPress={() => router.push('/duel')}>
      <View style={[styles.emojiBox, { backgroundColor: t.accentDim }]}>
        <AppText style={{ fontSize: 26 }}>⚔️</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="subtitle">{tr('games.duel.title')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('games.duel.caption')}
        </AppText>
        <View style={styles.gameMeta}>
          <View style={[styles.recordChip, { backgroundColor: t.accentDim }]}>
            <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
              {tr('games.duel.meta')}
            </AppText>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
    </Card>
  );
}

function GameCard({ game, stats }: { game: GameInfo; stats?: GameStats }) {
  const t = useTheme();
  const tr = useTr();
  return (
    <Card style={styles.game} onPress={() => router.push(`/game/${game.key}`)}>
      <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
        <AppText style={{ fontSize: 26 }}>{game.emoji}</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="subtitle">{gameTitle(tr, game.key)}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {gameTagline(tr, game.key)}
        </AppText>
        <View style={styles.gameMeta}>
          {stats ? (
            <>
              <View style={[styles.recordChip, { backgroundColor: t.accentDim }]}>
                <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
                  {tr('games.record', { best: stats.best })}
                </AppText>
              </View>
              <AppText variant="caption" muted>
                {tr('games.plays', { count: stats.plays })}
              </AppText>
            </>
          ) : (
            <View style={[styles.recordChip, { backgroundColor: t.primaryDim }]}>
              <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                {tr('games.new')}
              </AppText>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  tile: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  game: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emojiBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  recordChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
