/**
 * Protocol and session state for the 2-player WLAN duel. Everything here is
 * pure — no RN imports, no Date.now(), no sockets. The reducer communicates
 * with the transport layer through an outbox: every transition lists the
 * messages the effect layer must send afterwards, so jest can simulate a
 * complete duel by cross-wiring two reducers.
 *
 * The host builds the question set and ships it in the `start` message —
 * word pools are randomized per device (ORDER BY RANDOM()), so a shared seed
 * alone would not give both players the same round, and shipping the payload
 * also tolerates content-version differences between the two phones.
 */

import { applyArcadeAnswer, type BlitzQuestion, type GameKey } from '@/logic/games';

export const DUEL_PROTOCOL_VERSION = 1;
export const DUEL_COUNTDOWN_MS = 3000;

// ---------- wire messages ----------

export type DuelMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'welcome'; v: number; name: string }
  | { t: 'reject'; reason: 'version' | 'busy' }
  | {
      t: 'start';
      game: GameKey;
      seed: number;
      durationMs: number;
      countdownMs: number;
      questions: BlitzQuestion[];
    }
  | { t: 'progress'; score: number; correct: number; total: number; streak: number }
  | { t: 'finish'; score: number; correct: number; total: number; bestStreak: number }
  | { t: 'rematch' }
  | { t: 'bye' }
  | { t: 'ping' }
  | { t: 'pong' };

const MSG_TYPES = new Set([
  'hello', 'welcome', 'reject', 'start', 'progress', 'finish', 'rematch', 'bye', 'ping', 'pong',
]);

// ---------- newline-delimited JSON framing ----------

export function encodeFrame(msg: DuelMsg): string {
  return JSON.stringify(msg) + '\n';
}

/**
 * Feed a raw TCP chunk into the pending buffer; returns complete, valid
 * messages plus the unterminated remainder. Malformed lines are dropped.
 */
export function splitFrames(buffer: string, chunk: string): { frames: DuelMsg[]; rest: string } {
  const lines = (buffer + chunk).split('\n');
  const rest = lines.pop() ?? '';
  const frames: DuelMsg[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg && typeof msg.t === 'string' && MSG_TYPES.has(msg.t)) frames.push(msg);
    } catch {
      // skip malformed frame
    }
  }
  return { frames, rest };
}

// ---------- session state ----------

export type DuelRole = 'host' | 'guest';
export type DuelPhase = 'idle' | 'waiting' | 'lobby' | 'countdown' | 'playing' | 'done' | 'aborted';
export type DuelOutcome = 'win' | 'lose' | 'tie' | 'forfeitWin';
export type DuelAbortReason = 'peerLeft' | 'version' | 'busy' | 'network';

export interface DuelPlayer {
  score: number;
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
  finished: boolean;
}

export interface DuelState {
  role: DuelRole;
  phase: DuelPhase;
  myName: string;
  oppName: string | null;
  peerConnected: boolean;
  me: DuelPlayer;
  opp: DuelPlayer;
  game: GameKey;
  questions: BlitzQuestion[];
  seed: number;
  durationMs: number;
  countdownMs: number;
  outcome: DuelOutcome | null;
  abortReason: DuelAbortReason | null;
  rematch: { me: boolean; opp: boolean };
  /** Messages the effect layer must send after this transition, then clear. */
  outbox: DuelMsg[];
}

export type DuelEvent =
  | { type: 'hosted' }
  | { type: 'connected' }
  | { type: 'msg'; msg: DuelMsg }
  | { type: 'localStart'; questions: BlitzQuestion[]; seed: number; durationMs: number }
  | { type: 'countdownDone' }
  | { type: 'localAnswer'; correct: boolean }
  | { type: 'localFinish' }
  | { type: 'localRematch' }
  | { type: 'localAbort' }
  | { type: 'peerGone' };

const freshPlayer = (): DuelPlayer => ({
  score: 0,
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  finished: false,
});

export function initialDuel(role: DuelRole, myName: string): DuelState {
  return {
    role,
    phase: 'idle',
    myName,
    oppName: null,
    peerConnected: false,
    me: freshPlayer(),
    opp: freshPlayer(),
    game: 'wortblitz',
    questions: [],
    seed: 0,
    durationMs: 0,
    countdownMs: DUEL_COUNTDOWN_MS,
    outcome: null,
    abortReason: null,
    rematch: { me: false, opp: false },
    outbox: [],
  };
}

function outcomeFor(me: DuelPlayer, opp: DuelPlayer): DuelOutcome {
  if (me.score > opp.score) return 'win';
  if (me.score < opp.score) return 'lose';
  return 'tie';
}

function resetForRound(s: DuelState): DuelState {
  return {
    ...s,
    me: freshPlayer(),
    opp: freshPlayer(),
    outcome: null,
    abortReason: null,
    rematch: { me: false, opp: false },
  };
}

export function duelReducer(state: DuelState, ev: DuelEvent): DuelState {
  const s: DuelState = { ...state, outbox: [] };

  switch (ev.type) {
    case 'hosted':
      return s.role === 'host' && s.phase === 'idle' ? { ...s, phase: 'waiting' } : s;

    case 'connected':
      // Guest's socket is up: introduce ourselves and wait for welcome/reject.
      return s.role === 'guest' && s.phase === 'idle'
        ? { ...s, phase: 'waiting', outbox: [{ t: 'hello', v: DUEL_PROTOCOL_VERSION, name: s.myName }] }
        : s;

    case 'localStart': {
      if (s.role !== 'host' || s.phase !== 'lobby') return s;
      const started = resetForRound(s);
      return {
        ...started,
        phase: 'countdown',
        questions: ev.questions,
        seed: ev.seed,
        durationMs: ev.durationMs,
        outbox: [
          {
            t: 'start',
            game: s.game,
            seed: ev.seed,
            durationMs: ev.durationMs,
            countdownMs: s.countdownMs,
            questions: ev.questions,
          },
        ],
      };
    }

    case 'countdownDone':
      return s.phase === 'countdown' ? { ...s, phase: 'playing' } : s;

    case 'localAnswer': {
      if (s.phase !== 'playing' || s.me.finished) return s;
      const a = applyArcadeAnswer({ ...s.me, lives: 0 }, ev.correct);
      const me: DuelPlayer = {
        score: a.score,
        correct: a.correct,
        total: a.total,
        streak: a.streak,
        bestStreak: a.bestStreak,
        finished: false,
      };
      return {
        ...s,
        me,
        outbox: [{ t: 'progress', score: me.score, correct: me.correct, total: me.total, streak: me.streak }],
      };
    }

    case 'localFinish': {
      if (s.phase !== 'playing' || s.me.finished) return s;
      const me = { ...s.me, finished: true };
      const bothDone = me.finished && s.opp.finished;
      return {
        ...s,
        me,
        phase: bothDone ? 'done' : s.phase,
        outcome: bothDone ? outcomeFor(me, s.opp) : s.outcome,
        outbox: [
          { t: 'finish', score: me.score, correct: me.correct, total: me.total, bestStreak: me.bestStreak },
        ],
      };
    }

    case 'localRematch': {
      if (s.phase !== 'done' || !s.peerConnected || s.rematch.me) return s;
      const rematch = { ...s.rematch, me: true };
      const next: DuelState = { ...s, rematch, outbox: [{ t: 'rematch' }] };
      return rematch.me && rematch.opp ? { ...resetForRound(next), phase: 'lobby' } : next;
    }

    case 'localAbort':
      // We are the one walking away (e.g. app backgrounded mid-round); the
      // transport layer sends `bye` so the peer gets the forfeit win.
      return { ...s, phase: 'aborted', abortReason: 'network', peerConnected: false };

    case 'peerGone':
      return applyPeerGone(s);

    case 'msg':
      return applyMsg(s, ev.msg);
  }
}

function applyPeerGone(s: DuelState): DuelState {
  const gone: DuelState = { ...s, peerConnected: false };
  switch (s.phase) {
    case 'waiting':
      // Guest failed to reach the host (host in 'waiting' has no peer to lose).
      return s.role === 'guest' ? { ...gone, phase: 'aborted', abortReason: 'network' } : gone;
    case 'lobby':
      return s.role === 'host'
        ? { ...gone, phase: 'waiting', oppName: null }
        : { ...gone, phase: 'aborted', abortReason: 'peerLeft' };
    case 'countdown':
    case 'playing':
      // Opponent quit mid-round: if their final score already arrived, the
      // round stays comparable; otherwise it's a forfeit win.
      if (s.opp.finished) return gone;
      return {
        ...gone,
        phase: 'done',
        outcome: 'forfeitWin',
        abortReason: 'peerLeft',
        me: { ...s.me, finished: true },
      };
    default:
      return gone; // 'done': rematch is disabled via peerConnected
  }
}

function applyMsg(s: DuelState, msg: DuelMsg): DuelState {
  switch (msg.t) {
    case 'hello': {
      if (s.role !== 'host' || s.phase !== 'waiting') return s;
      if (msg.v !== DUEL_PROTOCOL_VERSION) {
        return { ...s, outbox: [{ t: 'reject', reason: 'version' }] };
      }
      return {
        ...s,
        phase: 'lobby',
        oppName: msg.name,
        peerConnected: true,
        outbox: [{ t: 'welcome', v: DUEL_PROTOCOL_VERSION, name: s.myName }],
      };
    }

    case 'welcome':
      if (s.role !== 'guest' || s.phase !== 'waiting') return s;
      return { ...s, phase: 'lobby', oppName: msg.name, peerConnected: true };

    case 'reject':
      return { ...s, phase: 'aborted', abortReason: msg.reason, peerConnected: false };

    case 'start': {
      if (s.role !== 'guest' || (s.phase !== 'lobby' && s.phase !== 'done')) return s;
      return {
        ...resetForRound(s),
        phase: 'countdown',
        game: msg.game,
        seed: msg.seed,
        durationMs: msg.durationMs,
        countdownMs: msg.countdownMs,
        questions: msg.questions,
      };
    }

    case 'progress':
      return {
        ...s,
        opp: {
          ...s.opp,
          score: msg.score,
          correct: msg.correct,
          total: msg.total,
          streak: msg.streak,
          bestStreak: Math.max(s.opp.bestStreak, msg.streak),
        },
      };

    case 'finish': {
      const opp: DuelPlayer = {
        score: msg.score,
        correct: msg.correct,
        total: msg.total,
        streak: 0,
        bestStreak: msg.bestStreak,
        finished: true,
      };
      const bothDone = s.me.finished && opp.finished;
      return {
        ...s,
        opp,
        phase: bothDone ? 'done' : s.phase,
        outcome: bothDone ? outcomeFor(s.me, opp) : s.outcome,
      };
    }

    case 'rematch': {
      if (s.phase !== 'done') return s;
      const rematch = { ...s.rematch, opp: true };
      const next = { ...s, rematch };
      return rematch.me && rematch.opp ? { ...resetForRound(next), phase: 'lobby' } : next;
    }

    case 'bye':
      return applyPeerGone(s);

    case 'ping':
    case 'pong':
      return s; // heartbeat is handled by the transport layer
  }
}
