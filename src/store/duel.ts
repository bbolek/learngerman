/**
 * Session store for the WLAN multiplayer duel: owns the (non-serializable)
 * socket, runs the pure reducer, and flushes each transition's outbox onto
 * the wire (broadcast or addressed to a single peer). Screens only ever
 * read `duel` and call the actions below.
 */

import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { AppState, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';

import { fetchGameWords, fetchGenderNouns, fetchImageWords } from '@/db/gamesRepo';
import {
  cleanPlayerName,
  duelReducer,
  initialDuel,
  type DuelEvent,
  type DuelMsg,
  type DuelState,
} from '@/logic/duel';
import { decodeRoomCode, encodeRoomCode } from '@/logic/duelCode';
import {
  buildArtikelQuestions,
  buildBlitzQuestions,
  buildImageQuestions,
  WORTBLITZ_MS,
  type ChoiceQuestion,
  type GameKey,
} from '@/logic/games';
import { DuelSocket } from '@/net/duelSocket';
import { useSettings } from '@/store/settings';

export type DuelError = 'noWifi' | 'noPort' | 'invalidCode' | 'connectFailed' | 'noWords';

interface DuelSessionState {
  duel: DuelState | null;
  /** Code the host shows; null while binding the server. */
  roomCode: string | null;
  /** Guest connect attempt in flight. */
  connecting: boolean;
  error: DuelError | null;
  hostGame: (game: GameKey) => Promise<void>;
  joinGame: (code: string) => Promise<void>;
  /** Host builds a fresh round and starts it (from the lobby or the results screen). */
  startRound: () => Promise<void>;
  dispatch: (ev: DuelEvent) => void;
  clearError: () => void;
  leave: () => void;
}

// Socket and OS listeners live outside zustand — they are not render state.
let socket: DuelSocket | null = null;
let appStateSub: NativeEventSubscription | null = null;

/** Custom name from settings, device name as fallback. */
function playerName(): string {
  return (
    cleanPlayerName(useSettings.getState().userName) ||
    cleanPlayerName(Device.deviceName ?? '') ||
    'Spieler'
  );
}

/** Same word pool sizes as the solo games; the host ships these to everyone. */
async function buildQuestions(game: GameKey, seed: number): Promise<ChoiceQuestion[]> {
  switch (game) {
    case 'derdiedas':
      return buildArtikelQuestions(await fetchGenderNouns(90), seed);
    case 'bilderraetsel':
      // Smaller pool: every question carries its SVG over the wire.
      return buildImageQuestions(await fetchImageWords(60), seed);
    default:
      return buildBlitzQuestions(await fetchGameWords(90), seed);
  }
}

export const useDuel = create<DuelSessionState>((set, get) => {
  const dispatch = (ev: DuelEvent) => {
    const duel = get().duel;
    if (!duel) return;
    const next = duelReducer(duel, ev);
    for (const out of next.outbox) {
      socket?.send(out.msg, out.to, out.except);
      if (out.close && out.to != null) socket?.dropPeer(out.to);
    }
    set({ duel: { ...next, outbox: [] } });
  };

  const abortSession = () => {
    // Deliberate local teardown: close() broadcasts bye so the room moves on.
    socket?.close();
    socket = null;
    dispatch({ type: 'localAbort' });
  };

  const callbacks = {
    onMessage: (msg: DuelMsg, from: string) => dispatch({ type: 'msg', msg, from }),
    onPeerGone: (id: string) => dispatch({ type: 'peerGone', id }),
    onServerDown: abortSession,
  };

  const watchAppState = () => {
    appStateSub?.remove();
    appStateSub = AppState.addEventListener('change', (status) => {
      const phase = get().duel?.phase;
      if (status !== 'active' && (phase === 'countdown' || phase === 'playing')) {
        // iOS suspends sockets in the background anyway — leave explicitly
        // so the room gets a clean `bye` instead of a heartbeat timeout.
        abortSession();
      }
    });
  };

  const teardown = () => {
    socket?.close();
    socket = null;
    appStateSub?.remove();
    appStateSub = null;
  };

  return {
    duel: null,
    roomCode: null,
    connecting: false,
    error: null,
    dispatch,
    clearError: () => set({ error: null }),

    hostGame: async (game: GameKey) => {
      teardown();
      set({ duel: initialDuel('host', playerName(), game), roomCode: null, error: null });
      try {
        const { socket: s, info } = await DuelSocket.host(callbacks);
        socket = s;
        set({ roomCode: encodeRoomCode(info.ip, info.port) });
        dispatch({ type: 'hosted' });
        watchAppState();
      } catch (e) {
        set({
          duel: null,
          error: e instanceof Error && e.message === 'no-free-port' ? 'noPort' : 'noWifi',
        });
      }
    },

    joinGame: async (code: string) => {
      // The 4-character code only carries the host's last IP octet — our own
      // address supplies the shared WLAN subnet.
      const myIp = await Network.getIpAddressAsync().catch(() => null);
      if (!myIp || myIp === '0.0.0.0') {
        set({ error: 'noWifi' });
        return;
      }
      const target = decodeRoomCode(code, myIp);
      if (!target) {
        set({ error: 'invalidCode' });
        return;
      }
      teardown();
      set({ duel: initialDuel('guest', playerName()), connecting: true, error: null });
      try {
        socket = await DuelSocket.join(target.ip, target.port, callbacks);
        set({ connecting: false });
        dispatch({ type: 'connected' });
        watchAppState();
      } catch {
        set({ duel: null, connecting: false, error: 'connectFailed' });
      }
    },

    startRound: async () => {
      const duel = get().duel;
      if (!duel || duel.role !== 'host' || (duel.phase !== 'lobby' && duel.phase !== 'done')) return;
      const seed = Date.now() & 0x7fffffff;
      const questions = await buildQuestions(duel.game, seed);
      if (questions.length === 0) {
        // e.g. Bilderrätsel on a content version without images
        set({ error: 'noWords' });
        return;
      }
      dispatch({ type: 'localStart', questions, seed, durationMs: WORTBLITZ_MS });
    },

    leave: () => {
      teardown();
      set({ duel: null, roomCode: null, connecting: false, error: null });
    },
  };
});
