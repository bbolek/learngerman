import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { isValidRoomCode } from '@/logic/duelCode';
import { useDuel, type DuelError } from '@/store/duel';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { GameScreen } from '@/ui/components/GameFrame';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Mode = 'menu' | 'host' | 'join';

const ERROR_COPY: Record<DuelError, string> = {
  noWifi: 'Kein WLAN gefunden. Verbinde beide Geräte mit demselben WLAN.',
  noPort: 'Duell konnte nicht gestartet werden. Versuch es gleich noch einmal.',
  invalidCode: 'Der Code ist ungültig — prüfe die Zeichen und versuch es erneut.',
  connectFailed: 'Keine Verbindung. Sind beide Geräte im selben WLAN?',
};

export default function DuelLobbyScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>('menu');
  const [code, setCode] = useState('');

  const duel = useDuel((s) => s.duel);
  const roomCode = useDuel((s) => s.roomCode);
  const connecting = useDuel((s) => s.connecting);
  const error = useDuel((s) => s.error);
  const { hostGame, joinGame, startRound, leave, clearError } = useDuel.getState();

  // Both sides move to the round screen the moment the countdown begins.
  useEffect(() => {
    if (duel?.phase === 'countdown') router.replace('/duel/wortblitz');
  }, [duel?.phase]);

  const back = () => {
    leave();
    if (mode === 'menu') router.back();
    else {
      setMode('menu');
      setCode('');
    }
  };

  const enterHost = () => {
    clearError();
    setMode('host');
    hostGame();
  };

  const enterJoin = () => {
    clearError();
    setMode('join');
  };

  return (
    <GameScreen>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={back}>
          <Ionicons name={mode === 'menu' ? 'close' : 'arrow-back'} size={24} color={t.inkMuted} />
        </Pressable>
        <AppText variant="subtitle">⚔️ Duell</AppText>
      </View>

      {mode === 'menu' && (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText variant="secondary" muted style={{ marginBottom: spacing.sm }}>
            Fordere jemanden im selben WLAN zu Wort-Blitz heraus — gleiche Wörter, 60 Sekunden,
            wer mehr Punkte holt, gewinnt.
          </AppText>
          <Card style={styles.choice} onPress={enterHost}>
            <View style={[styles.emojiBox, { backgroundColor: t.primaryDim }]}>
              <AppText style={{ fontSize: 26 }}>🤝</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">Duell erstellen</AppText>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Du bekommst einen Code für dein Gegenüber.
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
                Gib den Code vom anderen Gerät ein.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={t.inkFaint} />
          </Card>
        </View>
      )}

      {mode === 'host' && (
        <View style={[styles.fill, styles.center, { padding: spacing.xl }]}>
          {error ? (
            <>
              <AppText style={{ fontSize: 44 }}>📡</AppText>
              <AppText variant="body" style={styles.message}>
                {ERROR_COPY[error]}
              </AppText>
              <Pressable onPress={enterHost} style={[styles.cta, { backgroundColor: t.primary }]}>
                <AppText variant="subtitle" color="#fff">
                  Nochmal versuchen
                </AppText>
              </Pressable>
            </>
          ) : roomCode == null ? (
            <ActivityIndicator color={t.primary} />
          ) : (
            <>
              <AppText variant="label" muted>
                Dein Duell-Code
              </AppText>
              <AppText
                color={t.primary}
                style={{ fontFamily: fonts.extrabold, fontSize: 40, letterSpacing: 3, marginTop: spacing.md }}>
                {roomCode}
              </AppText>
              {duel?.phase === 'lobby' ? (
                <>
                  <View style={[styles.oppChip, { backgroundColor: t.accentDim }]}>
                    <AppText variant="caption" color={t.onAccentDim} style={{ fontFamily: fonts.extrabold }}>
                      ✓ {duel.oppName} ist bereit
                    </AppText>
                  </View>
                  <Pressable
                    onPress={startRound}
                    style={[styles.cta, { backgroundColor: t.primary, alignSelf: 'stretch', marginTop: spacing.xl }]}>
                    <AppText variant="subtitle" color="#fff">
                      Duell starten! →
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <>
                  <ActivityIndicator color={t.inkMuted} style={{ marginTop: spacing.xl }} />
                  <AppText variant="secondary" muted style={styles.message}>
                    Warte auf Gegner … beide Geräte müssen im selben WLAN sein.
                  </AppText>
                </>
              )}
            </>
          )}
        </View>
      )}

      {mode === 'join' && (
        <View style={{ padding: spacing.xl }}>
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
            maxLength={9}
            placeholder="XXXX-XXXX"
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
          {duel?.phase === 'aborted' && duel.abortReason === 'peerLeft' && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              Dein Gegenüber hat das Duell verlassen.
            </AppText>
          )}
          {duel?.phase === 'aborted' && duel.abortReason === 'version' && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              Eure App-Versionen passen nicht zusammen — bitte aktualisiert beide die App.
            </AppText>
          )}
          {duel?.phase === 'aborted' && duel.abortReason === 'busy' && (
            <AppText variant="caption" color={t.danger} style={{ marginTop: spacing.sm }}>
              Bei diesem Duell spielt schon jemand mit.
            </AppText>
          )}
          {duel?.phase === 'lobby' ? (
            <View style={[styles.center, { marginTop: spacing.xl }]}>
              <ActivityIndicator color={t.primary} />
              <AppText variant="secondary" muted style={styles.message}>
                Verbunden mit {duel.oppName} — warte auf den Start …
              </AppText>
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
  oppChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: spacing.lg },
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
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
