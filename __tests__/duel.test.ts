import {
  DUEL_PROTOCOL_VERSION,
  duelReducer,
  encodeFrame,
  initialDuel,
  splitFrames,
  type DuelEvent,
  type DuelMsg,
  type DuelState,
} from '@/logic/duel';
import { buildBlitzQuestions, type GameWord } from '@/logic/games';

// ---------- fixtures ----------

const POOL: GameWord[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  lemma: `Wort${i + 1}`,
  gender: 'n',
  plural: null,
  gloss: `word${i + 1}`,
}));
const QUESTIONS = buildBlitzQuestions(POOL, 42);

/** Two reducers cross-wired through their outboxes — a duel without sockets. */
class Sim {
  host: DuelState = initialDuel('host', 'Anna');
  guest: DuelState = initialDuel('guest', 'Ben');

  dispatch(side: 'host' | 'guest', ev: DuelEvent) {
    this[side] = duelReducer(this[side], ev);
    this.pump();
  }

  /** Deliver outbox messages back and forth until both queues drain. */
  private pump() {
    for (let guard = 0; guard < 100; guard++) {
      const from: 'host' | 'guest' = this.host.outbox.length ? 'host' : 'guest';
      const state = this[from];
      if (!state.outbox.length) return;
      const [msg, ...restOut] = state.outbox;
      this[from] = { ...state, outbox: restOut };
      const to = from === 'host' ? 'guest' : 'host';
      this[to] = duelReducer(this[to], { type: 'msg', msg });
    }
    throw new Error('outbox pump did not converge');
  }

  connect() {
    this.dispatch('host', { type: 'hosted' });
    this.dispatch('guest', { type: 'connected' });
  }

  start() {
    this.dispatch('host', { type: 'localStart', questions: QUESTIONS, seed: 42, durationMs: 60_000 });
    this.dispatch('host', { type: 'countdownDone' });
    this.dispatch('guest', { type: 'countdownDone' });
  }
}

// ---------- framing ----------

describe('framing', () => {
  const ping: DuelMsg = { t: 'ping' };
  const hello: DuelMsg = { t: 'hello', v: 1, name: 'Anna' };

  it('splits multiple frames from one chunk and keeps the remainder', () => {
    const chunk = encodeFrame(ping) + encodeFrame(hello) + '{"t":"po';
    const { frames, rest } = splitFrames('', chunk);
    expect(frames).toEqual([ping, hello]);
    expect(rest).toBe('{"t":"po');
  });

  it('reassembles a frame split across chunks', () => {
    const whole = encodeFrame(hello);
    const first = splitFrames('', whole.slice(0, 10));
    expect(first.frames).toEqual([]);
    const second = splitFrames(first.rest, whole.slice(10));
    expect(second.frames).toEqual([hello]);
    expect(second.rest).toBe('');
  });

  it('drops malformed and unknown-type lines', () => {
    const chunk = 'not json\n{"t":"nope"}\n{"x":1}\n' + encodeFrame(ping);
    expect(splitFrames('', chunk).frames).toEqual([ping]);
  });
});

// ---------- full duels ----------

describe('duel session', () => {
  it('handshake: both sides reach the lobby and learn names', () => {
    const sim = new Sim();
    sim.connect();
    expect(sim.host.phase).toBe('lobby');
    expect(sim.guest.phase).toBe('lobby');
    expect(sim.host.oppName).toBe('Ben');
    expect(sim.guest.oppName).toBe('Anna');
    expect(sim.host.peerConnected).toBe(true);
  });

  it('start ships identical questions to both sides', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    expect(sim.host.phase).toBe('playing');
    expect(sim.guest.phase).toBe('playing');
    // Guest's copy went through JSON framing semantics — same content.
    expect(JSON.parse(JSON.stringify(sim.guest.questions))).toEqual(
      JSON.parse(JSON.stringify(QUESTIONS))
    );
    expect(sim.guest.durationMs).toBe(60_000);
  });

  it('progress flows live and outcomes are symmetric (host wins)', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();

    sim.dispatch('host', { type: 'localAnswer', correct: true });
    sim.dispatch('host', { type: 'localAnswer', correct: true });
    expect(sim.guest.opp.score).toBe(sim.host.me.score);
    expect(sim.guest.opp.total).toBe(2);

    sim.dispatch('guest', { type: 'localAnswer', correct: true });
    sim.dispatch('guest', { type: 'localAnswer', correct: false });
    expect(sim.host.opp.total).toBe(2);

    sim.dispatch('host', { type: 'localFinish' });
    expect(sim.host.phase).toBe('playing'); // waiting for guest
    expect(sim.guest.opp.finished).toBe(true);

    sim.dispatch('guest', { type: 'localFinish' });
    expect(sim.host.phase).toBe('done');
    expect(sim.guest.phase).toBe('done');
    expect(sim.host.outcome).toBe('win');
    expect(sim.guest.outcome).toBe('lose');
  });

  it('equal scores end in a tie on both sides', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    sim.dispatch('host', { type: 'localAnswer', correct: true });
    sim.dispatch('guest', { type: 'localAnswer', correct: true });
    sim.dispatch('host', { type: 'localFinish' });
    sim.dispatch('guest', { type: 'localFinish' });
    expect(sim.host.outcome).toBe('tie');
    expect(sim.guest.outcome).toBe('tie');
  });

  it('streak bonus applies to duel scoring like solo', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    for (let i = 0; i < 3; i++) sim.dispatch('host', { type: 'localAnswer', correct: true });
    // 10 + (10+2) + (10+4) = 36
    expect(sim.host.me.score).toBe(36);
    expect(sim.host.me.bestStreak).toBe(3);
  });
});

// ---------- disconnects & rejects ----------

describe('disconnects and rejects', () => {
  it('peer vanishing mid-play is a forfeit win', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    sim.dispatch('host', { type: 'localAnswer', correct: true });
    sim.dispatch('host', { type: 'peerGone' });
    expect(sim.host.phase).toBe('done');
    expect(sim.host.outcome).toBe('forfeitWin');
    expect(sim.host.peerConnected).toBe(false);
  });

  it('peer vanishing after their finish keeps the normal comparison', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    sim.dispatch('guest', { type: 'localAnswer', correct: true });
    sim.dispatch('guest', { type: 'localFinish' });
    sim.dispatch('host', { type: 'peerGone' }); // guest app died after finishing
    expect(sim.host.phase).toBe('playing'); // host keeps playing
    sim.dispatch('host', { type: 'localFinish' });
    expect(sim.host.outcome).toBe('lose'); // 0 vs 10
  });

  it('guest leaving the lobby returns the host to waiting', () => {
    const sim = new Sim();
    sim.connect();
    sim.dispatch('host', { type: 'peerGone' });
    expect(sim.host.phase).toBe('waiting');
    expect(sim.host.oppName).toBeNull();
  });

  it('host leaving the lobby aborts the guest', () => {
    const sim = new Sim();
    sim.connect();
    sim.dispatch('guest', { type: 'peerGone' });
    expect(sim.guest.phase).toBe('aborted');
    expect(sim.guest.abortReason).toBe('peerLeft');
  });

  it('guest that never connects aborts with a network reason', () => {
    let guest = initialDuel('guest', 'Ben');
    guest = duelReducer(guest, { type: 'connected' });
    guest = duelReducer(guest, { type: 'peerGone' });
    expect(guest.phase).toBe('aborted');
    expect(guest.abortReason).toBe('network');
  });

  it('version mismatch: host rejects, guest aborts', () => {
    let host = initialDuel('host', 'Anna');
    host = duelReducer(host, { type: 'hosted' });
    host = duelReducer(host, {
      type: 'msg',
      msg: { t: 'hello', v: DUEL_PROTOCOL_VERSION + 1, name: 'Ben' },
    });
    expect(host.phase).toBe('waiting');
    expect(host.outbox).toEqual([{ t: 'reject', reason: 'version' }]);

    let guest = initialDuel('guest', 'Ben');
    guest = duelReducer(guest, { type: 'connected' });
    guest = duelReducer(guest, { type: 'msg', msg: { t: 'reject', reason: 'version' } });
    expect(guest.phase).toBe('aborted');
    expect(guest.abortReason).toBe('version');
  });

  it('busy reject aborts the second guest', () => {
    let guest = initialDuel('guest', 'Cem');
    guest = duelReducer(guest, { type: 'connected' });
    guest = duelReducer(guest, { type: 'msg', msg: { t: 'reject', reason: 'busy' } });
    expect(guest.phase).toBe('aborted');
    expect(guest.abortReason).toBe('busy');
  });

  it('bye behaves like peerGone', () => {
    const sim = new Sim();
    sim.connect();
    sim.start();
    sim.dispatch('host', { type: 'msg', msg: { t: 'bye' } });
    expect(sim.host.outcome).toBe('forfeitWin');
  });
});

// ---------- rematch ----------

describe('rematch', () => {
  function playToDone(sim: Sim) {
    sim.connect();
    sim.start();
    sim.dispatch('host', { type: 'localAnswer', correct: true });
    sim.dispatch('host', { type: 'localFinish' });
    sim.dispatch('guest', { type: 'localFinish' });
  }

  it('both agreeing resets scores and returns both to the lobby', () => {
    const sim = new Sim();
    playToDone(sim);
    sim.dispatch('guest', { type: 'localRematch' });
    expect(sim.host.rematch.opp).toBe(true);
    expect(sim.host.phase).toBe('done'); // host has not agreed yet

    sim.dispatch('host', { type: 'localRematch' });
    expect(sim.host.phase).toBe('lobby');
    expect(sim.guest.phase).toBe('lobby');
    expect(sim.host.me.score).toBe(0);
    expect(sim.host.outcome).toBeNull();

    // Host kicks off round two with fresh questions.
    const q2 = buildBlitzQuestions(POOL, 99);
    sim.dispatch('host', { type: 'localStart', questions: q2, seed: 99, durationMs: 60_000 });
    expect(sim.host.phase).toBe('countdown');
    expect(sim.guest.phase).toBe('countdown');
    expect(sim.guest.seed).toBe(99);
  });

  it('rematch is refused once the peer is gone', () => {
    const sim = new Sim();
    playToDone(sim);
    sim.dispatch('host', { type: 'peerGone' });
    sim.dispatch('host', { type: 'localRematch' });
    expect(sim.host.rematch.me).toBe(false);
    expect(sim.host.phase).toBe('done');
  });
});
