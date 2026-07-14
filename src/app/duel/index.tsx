import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { DUEL_GAMES, DUEL_MAX_PLAYERS, HOST_ID, type DuelAbortReason, type DuelState } from '@/logic/duel';
import { isValidRoomCode, ROOM_CODE_LENGTH } from '@/logic/duelCode';
import { gameInfo, type GameKey } from '@/logic/games';
import { useDuel, type DuelError } from '@/store/duel';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { GameScreen } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Mode = 'menu' | 'pick' | 'host' | 'join';

const ERROR_COPY: Record<DuelError, string> = {
  noWifi: 'Kein WLAN gefunden. Verbinde alle Geräte mit demselben WLAN.',
  noPort: 'Duell konnte nicht gestartet werden. Versuch es gleich noch einmal.',
  invalidCode: 'Der Code ist ungültig — prüfe die Zeichen und versuch es erneut.',
  connectFailed: 'Keine Verbindung. Sind alle Geräte im selben WLAN?',
  noWords: 'Für dieses Spiel fehlen Inhalte auf deinem Gerät — wähle ein anderes Spiel.',
};

const ABORT_COPY: Record<DuelAbortReason, string> = {
  peerLeft: 'Der Host hat das Duell beendet.',
  version: 'Eure App-Versionen passen nicht zusammen — bitte aktualisiert die App.',
  busy: 'Die Runde läuft schon — warte kurz und tritt vor der nächsten Runde bei.',
  full: `Dieses Duell ist schon voll (max. ${DUEL_MAX_PLAYERS} Spieler).`,
  network: 'Die Verbindung wurde getrennt. Versuch es noch einmal.',
};

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
  const gameTitle = duel ? `${gameInfo(duel.game).emoji} ${gameInfo(duel.game).title}` : '';

  return (
    <GameScreen>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={back}>
          <Ionicons name={mode === 'menu' ? 'close' : 'arrow-back'} size={24} color={t.inkMuted} />
        </Pressable>
        <AppText variant="subtitle">⚔️ Multiplayer</AppText>
      </View>

      {mode === 'menu' && (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="secondary" muted style={{ marginBottom: spacing.sm }}>
            Spielt gemeinsam im selben WLAN — gleiche Aufgaben, 60 Sekunden, bis zu{' '}
            {DUEL_MAX_PLAYERS} Spieler. Wer die meisten Punkte holt, gewinnt.
          </AppText>
          <Card style={styles.choice} onPress={() => setMode('pick')}>
            <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
              <AppText style={{ fontSize: 26 }}>🤝</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">Duell erstellen</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Wähle ein Spiel und teile den Code mit allen Mitspielern.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
          </Card>
          <Card style={styles.choice} onPress={enterJoin}>
            <View style={[styles.emojiBox, { backgroundColor: t.accentDim }]}>
              <AppText style={{ fontSize: 26 }}>🔑</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">Duell beitreten</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Gib den Code vom Host-Gerät ein.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
          </Card>
        </View>
      )}

      {mode === 'pick' && (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="label" muted>
            Welches Spiel?
          </AppText>
          {DUEL_GAMES.map((key) => {
            const info = gameInfo(key);
            return (
              <Card key={key} style={styles.choice} onPress={() => pickGame(key)}>
                <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
                  <AppText style={{ fontSize: 26 }}>{info.emoji}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle">{info.title}</AppText>
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    {info.tagline}
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
                {ERROR_COPY[error]}
              </AppText>
              <Pressable
                onPress={() => setMode('pick')}
                style={[styles.cta, { backgroundColor: t.primary }]}>
                <AppText variant="subtitle" color="#fff">
                  Nochmal versuchen
                </AppText>
              </Pressable>
            </View>
          ) : duel?.phase === 'aborted' ? (
            <View style={[styles.fill, styles.center]}>
              <AppText style={{ fontSize: 44 }}>📡</AppText>
              <AppText variant="body" style={styles.message}>
                {ABORT_COPY.network}
              </AppText>
              <Pressable
                onPress={() => setMode('pick')}
                style={[styles.cta, { backgroundColor: t.primary }]}>
                <AppText variant="subtitle" color="#fff">
                  Nochmal versuchen
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
                  {gameTitle}
                </AppText>
                <AppText variant="label" muted style={{ marginTop: spacing.md }}>
                  Dein Duell-Code
                </AppText>
                <AppText
                  color={t.primary}
                  style={{ fontFamily: fonts.extrabold, fontSize: 56, letterSpacing: 8, marginTop: spacing.sm }}>
                  {roomCode}
                </AppText>
                <AppText variant="caption" muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                  Alle im selben WLAN können mit diesem Code beitreten.
                </AppText>
              </View>

              {duel?.phase === 'lobby' ? (
                <>
                  <AppText variant="label" muted style={{ marginTop: spacing.xl }}>
                    Im Raum ({players.length}/{DUEL_MAX_PLAYERS})
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
                      Los geht&apos;s ({players.length} Spieler) →
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <View style={[styles.fill, styles.center]}>
                  <ActivityIndicator color={t.inkMuted} />
                  <AppText variant="secondary" muted style={styles.message}>
                    Warte auf Mitspieler … alle Geräte müssen im selben WLAN sein.
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
            Code eingeben
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
              {ERROR_COPY[error]}
            </AppText>
          )}
          {duel?.phase === 'aborted' && duel.abortReason != null && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              {ABORT_COPY[duel.abortReason]}
            </AppText>
          )}
          {duel?.phase === 'lobby' ? (
            <View style={{ marginTop: spacing.xl, flex: 1 }}>
              <View style={styles.center}>
                <AppText variant="subtitle">{gameTitle}</AppText>
                <ActivityIndicator color={t.primary} style={{ marginTop: spacing.md }} />
                <AppText variant="secondary" muted style={styles.message}>
                  Verbunden! {players.length} Spieler im Raum — warte auf den Start …
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
                  Beitreten
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
