/**
 * Protocol and session state for the WLAN multiplayer duel (2 to 30 players
 * — a whole class can join one room). Everything here is pure — no RN
 * imports, no Date.now(), no sockets. The reducer communicates with the
 * transport layer through an outbox: every transition lists the messages
 * the effect layer must send afterwards (optionally addressed to a single
 * peer), so jest can simulate a complete room by cross-wiring reducers.
 *
 * Topology is a star: guests only ever talk to the host, and the host
 * relays every progress/finish to the whole room, so each device keeps a
 * live picture of all players. The host assigns player ids ('g1', 'g2', …;
 * the host itself is HOST_ID) — they double as transport addresses. The
 * host's roster broadcast is the single authoritative membership list:
 * it includes mid-round dropouts (flagged disconnected) so a finished
 * score stays ranked, and is pruned only when a new round starts.
 *
 * The host picks the game when creating the room and builds each round's
 * question set, shipping it in the `start` message — word pools are
 * randomized per device (ORDER BY RANDOM()), so a shared seed alone would
 * not give every player the same round, and shipping the payload also
 * tolerates content-version differences between phones.
 */

import { applyArcadeAnswer, type ChoiceQuestion, type GameKey } from '@/logic/games';

export const DUEL_PROTOCOL_VERSION = 2;
export const DUEL_COUNTDOWN_MS = 3000;
export const DUEL_MAX_PLAYERS = 30;
export const HOST_ID = 'h';

/** Games playable in multiplayer (Wortpaare has no timed-round variant yet). */
export const DUEL_GAMES: GameKey[] = ['wortblitz', 'bilderraetsel', 'derdiedas'];

/** Trim + cap a player name; '' means "nothing usable, fall back". */
export function cleanPlayerName(name: string): string {
  return name.trim().slice(0, 24);
}

// ---------- wire messages ----------

export interface DuelRosterEntry {
  id: string;
  name: string;
  connected: boolean;
}

export type DuelRejectReason = 'version' | 'busy' | 'full';

export type DuelMsg =
  | { t: 'hello'; v: number; name: string }
  | { t: 'welcome'; v: number; id: string; game: GameKey; players: DuelRosterEntry[] }
  | { t: 'roster'; players: DuelRosterEntry[] }
  | { t: 'reject'; reason: DuelRejectReason }
  | {
      t: 'start';
      game: GameKey;
      seed: number;
      durationMs: number;
      countdownMs: number;
      questions: ChoiceQuestion[];
    }
  | { t: 'progress'; id: string; score: number; correct: number; total: number; streak: number }
  | { t: 'finish'; id: string; score: number; correct: number; total: number; bestStreak: number }
  | { t: 'bye' }
  | { t: 'ping' }
  | { t: 'pong' };

const MSG_TYPES = new Set([
  'hello', 'welcome', 'roster', 'reject', 'start', 'progress', 'finish', 'bye', 'ping', 'pong',
]);

/**
 * Outbox entry: `to` addresses one peer, otherwise broadcast (minus
 * `except`, used to skip the original sender when relaying). `close`
 * tells the transport to drop that peer's socket after sending.
 */
export interface DuelOutbound {
  msg: DuelMsg;
  to?: string;
  except?: string;
  close?: boolean;
}

// ---------- newline-delimited JSON framing ----------

export function encodeFrame(msg: DuelMsg): string {
  return JSON.stringify(msg) + '\n';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function validRoster(players: any): boolean {
  return (
    Array.isArray(players) &&
    players.every(
      (p: any) =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.connected === 'boolean'
    )
  );
}

/**
 * Anything on the LAN can write to the duel port — a frame must prove its
 * shape before the reducer touches it, or one malformed field crashes the
 * whole room.
 */
function validMsg(m: any): m is DuelMsg {
  switch (m.t) {
    case 'hello':
      return typeof m.v === 'number' && typeof m.name === 'string';
    case 'welcome':
      return (
        typeof m.v === 'number' &&
        typeof m.id === 'string' &&
        typeof m.game === 'string' &&
        validRoster(m.players)
      );
    case 'roster':
      return validRoster(m.players);
    case 'reject':
      return typeof m.reason === 'string';
    case 'start':
      return (
        typeof m.game === 'string' &&
        typeof m.seed === 'number' &&
        typeof m.durationMs === 'number' &&
        typeof m.countdownMs === 'number' &&
        Array.isArray(m.questions)
      );
    case 'progress':
      return (
        typeof m.id === 'string' &&
        typeof m.score === 'number' &&
        typeof m.correct === 'number' &&
        typeof m.total === 'number' &&
        typeof m.streak === 'number'
      );
    case 'finish':
      return (
        typeof m.id === 'string' &&
        typeof m.score === 'number' &&
        typeof m.correct === 'number' &&
        typeof m.total === 'number' &&
        typeof m.bestStreak === 'number'
      );
    default:
      return true; // bye / ping / pong carry no payload
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
      if (msg && typeof msg.t === 'string' && MSG_TYPES.has(msg.t) && validMsg(msg)) frames.push(msg);
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
export type DuelAbortReason = 'peerLeft' | 'version' | 'busy' | 'full' | 'network';

export interface DuelPlayer {
  score: number;
  correct: number;
  total: number;
  streak: number;
  bestStreak: number;
  finished: boolean;
}

export interface DuelPeer extends DuelPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface DuelState {
  role: DuelRole;
  phase: DuelPhase;
  /** HOST_ID for the host; assigned via `welcome` for guests ('' until then). */
  myId: string;
  myName: string;
  /** Everyone else in the room, in join order (guests see the host here too). */
  peers: DuelPeer[];
  me: DuelPlayer;
  game: GameKey;
  questions: ChoiceQuestion[];
  seed: number;
  durationMs: number;
  countdownMs: number;
  outcome: DuelOutcome | null;
  abortReason: DuelAbortReason | null;
  /** Messages the effect layer must send after this transition, then clear. */
  outbox: DuelOutbound[];
}

export type DuelEvent =
  | { type: 'hosted' }
  | { type: 'connected' }
  | { type: 'msg'; msg: DuelMsg; from?: string }
  | { type: 'localStart'; questions: ChoiceQuestion[]; seed: number; durationMs: number }
  | { type: 'countdownDone' }
  | { type: 'localAnswer'; correct: boolean }
  | { type: 'localFinish' }
  | { type: 'localAbort' }
  | { type: 'peerGone'; id: string };

const freshPlayer = (): DuelPlayer => ({
  score: 0,
  correct: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  finished: false,
});

export function initialDuel(role: DuelRole, myName: string, game: GameKey = 'wortblitz'): DuelState {
  return {
    role,
    phase: 'idle',
    myId: role === 'host' ? HOST_ID : '',
    myName,
    peers: [],
    me: freshPlayer(),
    game,
    questions: [],
    seed: 0,
    durationMs: 0,
    countdownMs: DUEL_COUNTDOWN_MS,
    outcome: null,
    abortReason: null,
    outbox: [],
  };
}

// ---------- standings (shared by reducer and screens) ----------

export interface DuelStanding {
  id: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  finished: boolean;
  isMe: boolean;
}

function standingCmp(a: DuelStanding, b: DuelStanding): number {
  return b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name);
}

/**
 * Live scoreboard: me plus every peer that is still connected or already
 * posted a final score (players that quit without finishing drop out).
 */
export function duelStandings(s: DuelState): DuelStanding[] {
  const rows: DuelStanding[] = [
    {
      id: s.myId,
      name: s.myName,
      score: s.me.score,
      correct: s.me.correct,
      total: s.me.total,
      finished: s.me.finished,
      isMe: true,
    },
    ...s.peers
      .filter((p) => p.connected || p.finished)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        correct: p.correct,
        total: p.total,
        finished: p.finished,
        isMe: false,
      })),
  ];
  return rows.sort(standingCmp);
}

/** Final ranking: finished players only. */
export function duelResults(s: DuelState): DuelStanding[] {
  return duelStandings(s).filter((r) => r.finished);
}

/** Tie-aware rank of one row: players with the same score share a rank. */
export function rankOf(rows: DuelStanding[], row: DuelStanding): number {
  return 1 + rows.filter((r) => r.score > row.score).length;
}

/** My rank among the given standings ("Platz 2 von 8"). */
export function duelRank(rows: DuelStanding[]): { rank: number; of: number } {
  const mine = rows.find((r) => r.isMe);
  return { rank: mine ? rankOf(rows, mine) : 1, of: rows.length };
}

// ---------- reducer ----------

/**
 * Authoritative membership list, host-side: every peer with its live
 * connected flag. Disconnected rows stick around (their posted score stays
 * ranked) until resetForRound prunes them.
 */
function rosterOf(s: DuelState): DuelRosterEntry[] {
  return [
    { id: s.myId, name: s.myName, connected: true },
    ...s.peers.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
  ];
}

function uniqueName(base: string, taken: string[]): string {
  const name = cleanPlayerName(base) || 'Spieler';
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function resetForRound(s: DuelState): DuelState {
  return {
    ...s,
    me: freshPlayer(),
    // Players that already left don't carry into the next round.
    peers: s.peers.filter((p) => p.connected).map((p) => ({ ...p, ...freshPlayer() })),
    outcome: null,
    abortReason: null,
  };
}

/**
 * Close the round if nothing more can come in: I'm finished and every peer
 * either posted a final score or disconnected. Also turns "everyone else
 * walked out before scoring" into a forfeit win, mid-round or not.
 */
function maybeFinishRound(s: DuelState): DuelState {
  if (s.phase !== 'countdown' && s.phase !== 'playing') return s;
  const pending = s.peers.filter((p) => p.connected && !p.finished);
  const rivals = s.peers.filter((p) => p.finished);

  if (!s.me.finished) {
    if (pending.length === 0 && rivals.length === 0) {
      return { ...s, phase: 'done', outcome: 'forfeitWin', me: { ...s.me, finished: true } };
    }
    return s;
  }
  if (pending.length > 0) return s;

  if (rivals.length === 0) return { ...s, phase: 'done', outcome: 'forfeitWin' };
  const top = Math.max(s.me.score, ...rivals.map((r) => r.score));
  const outcome: DuelOutcome =
    s.me.score < top ? 'lose' : rivals.some((r) => r.score === top) ? 'tie' : 'win';
  return { ...s, phase: 'done', outcome };
}

export function duelReducer(state: DuelState, ev: DuelEvent): DuelState {
  const s: DuelState = { ...state, outbox: [] };

  switch (ev.type) {
    case 'hosted':
      return s.role === 'host' && s.phase === 'idle' ? { ...s, phase: 'waiting' } : s;

    case 'connected':
      // Guest's socket is up: introduce ourselves and wait for welcome/reject.
      return s.role === 'guest' && s.phase === 'idle'
        ? {
            ...s,
            phase: 'waiting',
            outbox: [{ msg: { t: 'hello', v: DUEL_PROTOCOL_VERSION, name: s.myName } }],
          }
        : s;

    case 'localStart': {
      // Initial start from the lobby, or the host launching the next round
      // straight from the results screen.
      if (s.role !== 'host' || (s.phase !== 'lobby' && s.phase !== 'done')) return s;
      const started = resetForRound(s);
      if (started.peers.length === 0 || ev.questions.length === 0) return s;
      return {
        ...started,
        phase: 'countdown',
        questions: ev.questions,
        seed: ev.seed,
        durationMs: ev.durationMs,
        outbox: [
          {
            msg: {
              t: 'start',
              game: s.game,
              seed: ev.seed,
              durationMs: ev.durationMs,
              countdownMs: s.countdownMs,
              questions: ev.questions,
            },
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
        outbox: [
          {
            msg: {
              t: 'progress',
              id: s.myId,
              score: me.score,
              correct: me.correct,
              total: me.total,
              streak: me.streak,
            },
          },
        ],
      };
    }

    case 'localFinish': {
      if (s.phase !== 'playing' || s.me.finished) return s;
      const me = { ...s.me, finished: true };
      return maybeFinishRound({
        ...s,
        me,
        outbox: [
          {
            msg: {
              t: 'finish',
              id: s.myId,
              score: me.score,
              correct: me.correct,
              total: me.total,
              bestStreak: me.bestStreak,
            },
          },
        ],
      });
    }

    case 'localAbort':
      // We are the one walking away (e.g. app backgrounded mid-round); the
      // transport layer sends `bye` so the room carries on without us.
      return {
        ...s,
        phase: 'aborted',
        abortReason: 'network',
        peers: s.peers.map((p) => ({ ...p, connected: false })),
      };

    case 'peerGone':
      return s.role === 'host'
        ? hostPeerGone(s, ev.id)
        : ev.id === HOST_ID
          ? guestHostGone(s)
          : s;

    case 'msg':
      return applyMsg(s, ev.msg, ev.from);
  }
}

/** Host: the socket of guest `id` died (or it said bye). */
function hostPeerGone(s: DuelState, id: string): DuelState {
  const peer = s.peers.find((p) => p.id === id && p.connected);
  if (!peer) return s;

  if (s.phase === 'lobby') {
    const peers = s.peers.filter((p) => p.id !== id);
    const next: DuelState = { ...s, peers, phase: peers.length ? 'lobby' : 'waiting' };
    return peers.length
      ? { ...next, outbox: [{ msg: { t: 'roster', players: rosterOf(next) } }] }
      : next;
  }

  // countdown / playing / done: keep the row (a posted score stays ranked),
  // tell the room, and check whether the round just became complete.
  const peers = s.peers.map((p) => (p.id === id ? { ...p, connected: false } : p));
  const next = { ...s, peers };
  return maybeFinishRound({ ...next, outbox: [{ msg: { t: 'roster', players: rosterOf(next) } }] });
}

/** Guest: the connection to the host died — with it, all live updates. */
function guestHostGone(s: DuelState): DuelState {
  const peers = s.peers.map((p) => ({ ...p, connected: false }));
  switch (s.phase) {
    case 'waiting':
      return { ...s, peers, phase: 'aborted', abortReason: 'network' };
    case 'lobby':
      return { ...s, peers, phase: 'aborted', abortReason: 'peerLeft' };
    case 'countdown':
    case 'playing':
      // Scores relayed so far stay comparable; if nobody had finished yet
      // this collapses into a forfeit win.
      return maybeFinishRound({ ...s, peers });
    default:
      return { ...s, peers }; // 'done': just disables the "waiting for host" hint
  }
}

/** Host stamps the transport id on relayed updates so guests can't spoof others. */
function senderId(s: DuelState, msgId: string, from?: string): string {
  return s.role === 'host' && from != null ? from : msgId;
}

/** Host forwards a guest's update to the rest of the room (never back to the sender). */
function relayOut(s: DuelState, msg: DuelMsg, id: string): DuelOutbound[] {
  return s.role === 'host' && id !== s.myId ? [{ msg, except: id }] : [];
}

function applyMsg(s: DuelState, msg: DuelMsg, from?: string): DuelState {
  switch (msg.t) {
    case 'hello': {
      if (s.role !== 'host' || from == null) return s;
      // A repeated hello on the same socket must not mint a phantom player.
      if (s.peers.some((p) => p.id === from)) return s;
      // Joins are open in the lobby and between rounds (results screen) —
      // latecomers from the class hop in for the next round.
      if (s.phase !== 'waiting' && s.phase !== 'lobby' && s.phase !== 'done') {
        return { ...s, outbox: [{ msg: { t: 'reject', reason: 'busy' }, to: from, close: true }] };
      }
      if (msg.v !== DUEL_PROTOCOL_VERSION) {
        return { ...s, outbox: [{ msg: { t: 'reject', reason: 'version' }, to: from, close: true }] };
      }
      if (1 + s.peers.filter((p) => p.connected).length >= DUEL_MAX_PLAYERS) {
        return { ...s, outbox: [{ msg: { t: 'reject', reason: 'full' }, to: from, close: true }] };
      }
      const name = uniqueName(msg.name, [s.myName, ...s.peers.map((p) => p.name)]);
      const next: DuelState = {
        ...s,
        phase: s.phase === 'waiting' ? 'lobby' : s.phase,
        peers: [...s.peers, { ...freshPlayer(), id: from, name, connected: true }],
      };
      const players = rosterOf(next);
      return {
        ...next,
        outbox: [
          { msg: { t: 'welcome', v: DUEL_PROTOCOL_VERSION, id: from, game: s.game, players }, to: from },
          { msg: { t: 'roster', players }, except: from },
        ],
      };
    }

    case 'welcome': {
      if (s.role !== 'guest' || s.phase !== 'waiting') return s;
      const mine = msg.players.find((p) => p.id === msg.id);
      return {
        ...s,
        phase: 'lobby',
        myId: msg.id,
        myName: mine?.name ?? s.myName, // host may have deduplicated our name
        game: msg.game,
        peers: msg.players
          .filter((p) => p.id !== msg.id)
          .map((p) => ({ ...freshPlayer(), id: p.id, name: p.name, connected: p.connected })),
      };
    }

    case 'roster': {
      // Mirror the host's authoritative list: known peers keep their stats,
      // new ids start fresh, ids the host no longer lists are gone.
      if (s.role !== 'guest' || !s.myId) return s;
      const peers = msg.players
        .filter((p) => p.id !== s.myId)
        .map((p) => {
          const known = s.peers.find((k) => k.id === p.id);
          return known
            ? { ...known, name: p.name, connected: p.connected }
            : { ...freshPlayer(), id: p.id, name: p.name, connected: p.connected };
        });
      // A mid-round dropout can be the last thing the round was waiting for.
      return maybeFinishRound({ ...s, peers });
    }

    case 'reject':
      // Only the host issues rejects, and only in reply to our hello — a
      // guest-forged reject must not abort a running room.
      if (s.role !== 'guest' || s.phase !== 'waiting') return s;
      return {
        ...s,
        phase: 'aborted',
        abortReason: msg.reason,
        peers: s.peers.map((p) => ({ ...p, connected: false })),
      };

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

    case 'progress': {
      const id = senderId(s, msg.id, from);
      if (id === s.myId) return s;
      const peers = s.peers.map((p) =>
        p.id === id
          ? {
              ...p,
              score: msg.score,
              correct: msg.correct,
              total: msg.total,
              streak: msg.streak,
              bestStreak: Math.max(p.bestStreak, msg.streak),
            }
          : p
      );
      return { ...s, peers, outbox: relayOut(s, { ...msg, id }, id) };
    }

    case 'finish': {
      const id = senderId(s, msg.id, from);
      if (id === s.myId) return s;
      const peers = s.peers.map((p) =>
        p.id === id
          ? {
              ...p,
              score: msg.score,
              correct: msg.correct,
              total: msg.total,
              streak: 0,
              bestStreak: msg.bestStreak,
              finished: true,
            }
          : p
      );
      return maybeFinishRound({ ...s, peers, outbox: relayOut(s, { ...msg, id }, id) });
    }

    case 'bye':
      return s.role === 'host'
        ? from != null
          ? hostPeerGone(s, from)
          : s
        : guestHostGone(s);

    case 'ping':
    case 'pong':
      return s; // heartbeat is handled by the transport layer
  }
}
