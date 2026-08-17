import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { DUEL_GAMES, DUEL_MAX_PLAYERS, HOST_ID, type DuelAbortReason, type DuelState } from '@/logic/duel';
import { isValidRoomCode, ROOM_CODE_LENGTH } from '@/logic/duelCode';
import { useTr, type TranslationKey } from '@/i18n';
import { gameTagline, gameTitle } from '@/i18n/labels';
import { gameInfo, type GameKey } from '@/logic/games';
import { useDuel, type DuelError } from '@/store/duel';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { GameScreen } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Mode = 'menu' | 'pick' | 'host' | 'join';

const ERROR_KEYS = {
  noWifi: 'duel.error.noWifi',
  noPort: 'duel.error.noPort',
  invalidCode: 'duel.error.invalidCode',
  connectFailed: 'duel.error.connectFailed',
  noWords: 'duel.error.noWords',
} as const satisfies Record<DuelError, TranslationKey>;

const ABORT_KEYS = {
  peerLeft: 'duel.abort.peerLeft',
  version: 'duel.abort.version',
  busy: 'duel.abort.busy',
  full: 'duel.abort.full',
  network: 'duel.abort.network',
} as const satisfies Record<DuelAbortReason, TranslationKey>;

/** Everyone currently in the room, host first, from either side's view. */
function roster(duel: DuelState): { id: string; label: string }[] {
  const others = duel.peers
    .filter((p) => p.connected)
    .map((p) => ({ id: p.id, label: p.id === HOST_ID ? `👑 ${p.name}` : p.name }));
  const me = {
    id: duel.myId || 'me',
    label: duel.role === 'host' ? `👑 ${duel.myName} · du` : `${duel.myName} · du`,
  };
  return duel.role === 'host' ? [me, ...others] : [...others, me];
}

export default function DuelLobbyScreen() {
  const t = useTheme();
  const tr = useTr();
  const [mode, setMode] = useState<Mode>('menu');
  const [code, setCode] = useState('');

  const duel = useDuel((s) => s.duel);
  const roomCode = useDuel((s) => s.roomCode);
  const connecting = useDuel((s) => s.connecting);
  const error = useDuel((s) => s.error);
  const { hostGame, joinGame, startRound, leave, clearError } = useDuel.getState();

  // Everyone moves to the round screen the moment the countdown begins.
  useEffect(() => {
    if (duel?.phase === 'countdown') router.replace('/duel/play');
  }, [duel?.phase]);

  const back = () => {
    leave();
    if (mode === 'menu') router.back();
    else {
      setMode('menu');
      setCode('');
    }
  };

  const pickGame = (game: GameKey) => {
    clearError();
    setMode('host');
    hostGame(game);
  };

  const enterJoin = () => {
    clearError();
    setMode('join');
  };

  const players = duel ? roster(duel) : [];
  const roundTitle = duel ? `${gameInfo(duel.game).emoji} ${gameTitle(tr, duel.game)}` : '';

  return (
    <GameScreen>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={back}>
          <Ionicons name={mode === 'menu' ? 'close' : 'arrow-back'} size={24} color={t.inkMuted} />
        </Pressable>
        <AppText variant="subtitle">{tr('duel.title')}</AppText>
      </View>

      {mode === 'menu' && (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="secondary" muted style={{ marginBottom: spacing.sm }}>
            {tr('duel.intro', { max: DUEL_MAX_PLAYERS })}
          </AppText>
          <Card style={styles.choice} onPress={() => setMode('pick')}>
            <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
              <AppText style={{ fontSize: 26 }}>🤝</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">{tr('duel.host.title')}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                {tr('duel.host.caption')}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
          </Card>
          <Card style={styles.choice} onPress={enterJoin}>
            <View style={[styles.emojiBox, { backgroundColor: t.accentDim }]}>
              <AppText style={{ fontSize: 26 }}>🔑</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">{tr('duel.join.title')}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                {tr('duel.join.caption')}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
          </Card>
        </View>
      )}

      {mode === 'pick' && (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="label" muted>
            {tr('duel.pickGame')}
          </AppText>
          {DUEL_GAMES.map((key) => {
            const info = gameInfo(key);
            return (
              <Card key={key} style={styles.choice} onPress={() => pickGame(key)}>
                <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
                  <AppText style={{ fontSize: 26 }}>{info.emoji}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle">{gameTitle(tr, key)}</AppText>
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    {gameTagline(tr, key)}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
              </Card>
            );
          })}
        </View>
      )}

      {mode === 'host' && (
        <View style={[styles.fill, { padding: spacing.xl }]}>
          {error ? (
            <View style={[styles.fill, styles.center]}>
              <AppText style={{ fontSize: 44 }}>📡</AppText>
              <AppText variant="body" style={styles.message}>
                {tr(ERROR_KEYS[error])}
              </AppText>
              <Pressable
                onPress={() => setMode('pick')}
                style={[styles.cta, { backgroundColor: t.primary }]}>
                <AppText variant="subtitle" color="#fff">
                  {tr('duel.retry')}
                </AppText>
              </Pressable>
            </View>
          ) : duel?.phase === 'aborted' ? (
            <View style={[styles.fill, styles.center]}>
              <AppText style={{ fontSize: 44 }}>📡</AppText>
              <AppText variant="body" style={styles.message}>
                {tr(ABORT_KEYS.network)}
              </AppText>
              <Pressable
                onPress={() => setMode('pick')}
                style={[styles.cta, { backgroundColor: t.primary }]}>
                <AppText variant="subtitle" color="#fff">
                  {tr('duel.retry')}
                </AppText>
              </Pressable>
            </View>
          ) : roomCode == null ? (
            <View style={[styles.fill, styles.center]}>
              <ActivityIndicator color={t.primary} />
            </View>
          ) : (
            <>
              <View style={styles.center}>
                <AppText variant="caption" muted>
                  {roundTitle}
                </AppText>
                <AppText variant="label" muted style={{ marginTop: spacing.md }}>
                  {tr('duel.yourCode')}
                </AppText>
                <AppText
                  color={t.primary}
                  style={{ fontFamily: fonts.extrabold, fontSize: 56, letterSpacing: 8, marginTop: spacing.sm }}>
                  {roomCode}
                </AppText>
                <AppText variant="caption" muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                  {tr('duel.codeHint')}
                </AppText>
              </View>

              {duel?.phase === 'lobby' ? (
                <>
                  <AppText variant="label" muted style={{ marginTop: spacing.xl }}>
                    {tr('duel.inRoom', { count: players.length, max: DUEL_MAX_PLAYERS })}
                  </AppText>
                  <ScrollView style={styles.fill} contentContainerStyle={styles.chipWrap}>
                    {players.map((p) => (
                      <Chip key={p.id} label={p.label} kind="new" />
                    ))}
                  </ScrollView>
                  <Pressable
                    onPress={startRound}
                    style={[styles.cta, { backgroundColor: t.primary, alignSelf: 'stretch' }]}>
                    <AppText variant="subtitle" color="#fff">
                      {tr('duel.startRound', { count: players.length })}
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <View style={[styles.fill, styles.center]}>
                  <ActivityIndicator color={t.inkMuted} />
                  <AppText variant="secondary" muted style={styles.message}>
                    {tr('duel.waiting')}
                  </AppText>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {mode === 'join' && (
        <View style={{ padding: spacing.xl, flex: 1 }}>
          <AppText variant="label" muted>
            {tr('duel.enterCode')}
          </AppText>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              clearError();
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={ROOM_CODE_LENGTH}
            placeholder="XXXX"
            placeholderTextColor={t.inkFaint}
            editable={!connecting && duel?.phase !== 'lobby'}
            style={[
              styles.input,
              { backgroundColor: t.surface, borderColor: t.line, color: t.ink, fontFamily: fonts.extrabold },
            ]}
          />
          {error != null && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              {tr(ERROR_KEYS[error])}
            </AppText>
          )}
          {duel?.phase === 'aborted' && duel.abortReason != null && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              {tr(ABORT_KEYS[duel.abortReason])}
            </AppText>
          )}
          {duel?.phase === 'lobby' ? (
            <View style={{ marginTop: spacing.xl, flex: 1 }}>
              <View style={styles.center}>
                <AppText variant="subtitle">{roundTitle}</AppText>
                <ActivityIndicator color={t.primary} style={{ marginTop: spacing.md }} />
                <AppText variant="secondary" muted style={styles.message}>
                  {tr('duel.connected', { count: players.length })}
                </AppText>
              </View>
              <ScrollView contentContainerStyle={[styles.chipWrap, { justifyContent: 'center' }]}>
                {players.map((p) => (
                  <Chip key={p.id} label={p.label} kind="new" />
                ))}
              </ScrollView>
            </View>
          ) : (
            <Pressable
              disabled={!isValidRoomCode(code) || connecting}
              onPress={() => joinGame(code)}
              style={[
                styles.cta,
                {
                  backgroundColor: isValidRoomCode(code) && !connecting ? t.primary : t.line,
                  alignSelf: 'stretch',
                  marginTop: spacing.lg,
                },
              ]}>
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText variant="subtitle" color={isValidRoomCode(code) ? '#fff' : t.inkFaint}>
                  {tr('duel.joinCta')}
                </AppText>
              )}
            </Pressable>
          )}
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
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emojiBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { marginTop: spacing.lg, textAlign: 'center', lineHeight: 22 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
