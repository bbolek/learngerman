/**
 * Session store for the WLAN duel: owns the (non-serializable) socket, runs
 * the pure reducer, and flushes each transition's outbox onto the wire.
 * Screens only ever read `duel` and call the actions below.
 */

import * as Device from 'expo-device';
import { AppState, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';

import { fetchGameWords } from '@/db/gamesRepo';
import {
  duelReducer,
  initialDuel,
  type DuelEvent,
  type DuelMsg,
  type DuelState,
} from '@/logic/duel';
import { decodeRoomCode, encodeRoomCode } from '@/logic/duelCode';
import { buildBlitzQuestions, WORTBLITZ_MS } from '@/logic/games';
import { DuelSocket } from '@/net/duelSocket';

export type DuelError = 'noWifi' | 'noPort' | 'invalidCode' | 'connectFailed';

interface DuelSessionState {
  duel: DuelState | null;
  /** Code the host shows; null while binding the server. */
  roomCode: string | null;
  /** Guest connect attempt in flight. */
  connecting: boolean;
  error: DuelError | null;
  hostGame: () => Promise<void>;
  joinGame: (code: string) => Promise<void>;
  /** Host builds a fresh round and starts it (initial start and rematch). */
  startRound: () => Promise<void>;
  dispatch: (ev: DuelEvent) => void;
  clearError: () => void;
  leave: () => void;
}

// Socket and OS listeners live outside zustand — they are not render state.
let socket: DuelSocket | null = null;
let appStateSub: NativeEventSubscription | null = null;

function playerName(): string {
  const name = Device.deviceName?.trim();
  return name ? name.slice(0, 24) : 'Spieler';
}

export const useDuel = create<DuelSessionState>((set, get) => {
  const dispatch = (ev: DuelEvent) => {
    const duel = get().duel;
    if (!duel) return;
    const next = duelReducer(duel, ev);
    for (const msg of next.outbox) socket?.send(msg);
    set({ duel: { ...next, outbox: [] } });
  };

  const callbacks = {
    onMessage: (msg: DuelMsg) => dispatch({ type: 'msg', msg }),
    onPeerConnected: () => {}, // host learns about the guest via its `hello`
    onClosed: () => dispatch({ type: 'peerGone' }),
  };

  const watchAppState = () => {
    appStateSub?.remove();
    appStateSub = AppState.addEventListener('change', (status) => {
      const phase = get().duel?.phase;
      if (status !== 'active' && (phase === 'countdown' || phase === 'playing')) {
        // iOS suspends sockets in the background anyway — forfeit explicitly
        // so the opponent gets a clean `bye` instead of a heartbeat timeout.
        socket?.close();
        socket = null;
        dispatch({ type: 'localAbort' });
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

    hostGame: async () => {
      teardown();
      set({ duel: initialDuel('host', playerName()), roomCode: null, error: null });
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
      const target = decodeRoomCode(code);
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
      if (!duel || duel.role !== 'host' || duel.phase !== 'lobby') return;
      const pool = await fetchGameWords(90);
      const seed = Date.now() & 0x7fffffff;
      dispatch({
        type: 'localStart',
        questions: buildBlitzQuestions(pool, seed),
        seed,
        durationMs: WORTBLITZ_MS,
      });
    },

    leave: () => {
      teardown();
      set({ duel: null, roomCode: null, connecting: false, error: null });
    },
  };
});
