import {
  DUEL_MAX_PLAYERS,
  DUEL_PROTOCOL_VERSION,
  duelRank,
  duelReducer,
  duelResults,
  encodeFrame,
  HOST_ID,
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

/**
 * Host and N guest reducers cross-wired through their outboxes — a whole
 * room without sockets. Guest map keys double as transport ids, exactly
 * like the real DuelSocket assigns them.
 */
class Sim {
  host: DuelState = initialDuel('host', 'Frau Weber');
  guests = new Map<string, DuelState>();
  private gone = new Set<string>();

  constructor() {
    this.dispatchHost({ type: 'hosted' });
  }

  join(id: string, name: string) {
    this.guests.set(id, initialDuel('guest', name));
    this.dispatchGuest(id, { type: 'connected' });
  }

  guest(id: string): DuelState {
    const g = this.guests.get(id);
    if (!g) throw new Error(`no guest ${id}`);
    return g;
  }

  dispatchHost(ev: DuelEvent) {
    this.host = duelReducer(this.host, ev);
    this.pump();
  }

  dispatchGuest(id: string, ev: DuelEvent) {
    this.guests.set(id, duelReducer(this.guest(id), ev));
    this.pump();
  }

  /** Guest id's socket dies (crash / wifi drop). */
  drop(id: string) {
    this.gone.add(id);
    this.dispatchHost({ type: 'peerGone', id });
  }

  /** The host device dies: every guest loses its connection. */
  dropHost() {
    for (const id of this.guests.keys()) {
      if (!this.gone.has(id)) this.dispatchGuest(id, { type: 'peerGone' });
    }
  }

  /** Deliver outbox messages around the star until every queue drains. */
  private pump() {
    for (let guard = 0; guard < 5000; guard++) {
      if (this.host.outbox.length) {
        const [out, ...rest] = this.host.outbox;
        this.host = { ...this.host, outbox: rest };
        const targets = out.to != null ? [out.to] : [...this.guests.keys()];
        for (const id of targets) {
          if (this.gone.has(id)) continue;
          const g = this.guests.get(id);
          if (g) this.guests.set(id, duelReducer(g, { type: 'msg', msg: out.msg }));
        }
        continue;
      }
      const sender = [...this.guests.entries()].find(
        ([id, g]) => !this.gone.has(id) && g.outbox.length
      );
      if (!sender) return;
      const [id, g] = sender;
      const [out, ...rest] = g.outbox;
      this.guests.set(id, { ...g, outbox: rest });
      this.host = duelReducer(this.host, { type: 'msg', msg: out.msg, from: id });
    }
    throw new Error('outbox pump did not converge');
  }
}

function makeRoom(names: string[] = ['Ben', 'Cem']): Sim {
  const sim = new Sim();
  names.forEach((n, i) => sim.join(`g${i + 1}`, n));
  return sim;
}

function startRound(sim: Sim) {
  sim.dispatchHost({ type: 'localStart', questions: QUESTIONS, seed: 42, durationMs: 60_000 });
  sim.dispatchHost({ type: 'countdownDone' });
  for (const id of sim.guests.keys()) sim.dispatchGuest(id, { type: 'countdownDone' });
}

function score(sim: Sim, side: string, corrects: number) {
  for (let i = 0; i < corrects; i++) {
    if (side === 'host') sim.dispatchHost({ type: 'localAnswer', correct: true });
    else sim.dispatchGuest(side, { type: 'localAnswer', correct: true });
  }
}

function finish(sim: Sim, side: string) {
  if (side === 'host') sim.dispatchHost({ type: 'localFinish' });
  else sim.dispatchGuest(side, { type: 'localFinish' });
}

// ---------- framing ----------

describe('framing', () => {
  const ping: DuelMsg = { t: 'ping' };
  const hello: DuelMsg = { t: 'hello', v: DUEL_PROTOCOL_VERSION, name: 'Anna' };

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

// ---------- room assembly ----------

describe('room assembly', () => {
  it('every join spreads the roster to the whole room', () => {
    const sim = makeRoom(['Ben', 'Cem', 'Dua']);
    expect(sim.host.phase).toBe('lobby');
    expect(sim.host.peers.map((p) => p.name)).toEqual(['Ben', 'Cem', 'Dua']);

    // Each guest knows the host and all other guests.
    for (const id of ['g1', 'g2', 'g3']) {
      const g = sim.guest(id);
      expect(g.phase).toBe('lobby');
      expect(g.myId).toBe(id);
      const names = g.peers.map((p) => p.name).sort();
      expect(names).toEqual(['Ben', 'Cem', 'Dua', 'Frau Weber'].filter((n) => n !== g.myName).sort());
      expect(g.peers.find((p) => p.id === HOST_ID)?.name).toBe('Frau Weber');
    }
  });

  it('deduplicates colliding device names and tells the guest its new name', () => {
    const sim = makeRoom(['iPhone', 'iPhone']);
    expect(sim.host.peers.map((p) => p.name)).toEqual(['iPhone', 'iPhone 2']);
    expect(sim.guest('g2').myName).toBe('iPhone 2');
  });

  it('rejects a guest once the room is full', () => {
    const sim = new Sim();
    for (let i = 1; i < DUEL_MAX_PLAYERS; i++) sim.join(`g${i}`, `S${i}`);
    expect(sim.host.peers).toHaveLength(DUEL_MAX_PLAYERS - 1);

    sim.join('gx', 'Zu spät');
    expect(sim.guest('gx').phase).toBe('aborted');
    expect(sim.guest('gx').abortReason).toBe('full');
    expect(sim.host.peers).toHaveLength(DUEL_MAX_PLAYERS - 1);
  });

  it('version mismatch: host rejects, guest aborts', () => {
    let host = initialDuel('host', 'Anna');
    host = duelReducer(host, { type: 'hosted' });
    host = duelReducer(host, {
      type: 'msg',
      msg: { t: 'hello', v: DUEL_PROTOCOL_VERSION + 1, name: 'Ben' },
      from: 'g1',
    });
    expect(host.phase).toBe('waiting');
    expect(host.outbox).toEqual([{ msg: { t: 'reject', reason: 'version' }, to: 'g1' }]);

    let guest = initialDuel('guest', 'Ben');
    guest = duelReducer(guest, { type: 'connected' });
    guest = duelReducer(guest, { type: 'msg', msg: { t: 'reject', reason: 'version' } });
    expect(guest.phase).toBe('aborted');
    expect(guest.abortReason).toBe('version');
  });

  it('joining mid-round is rejected as busy', () => {
    const sim = makeRoom(['Ben']);
    startRound(sim);
    sim.join('g9', 'Zu spät');
    expect(sim.guest('g9').phase).toBe('aborted');
    expect(sim.guest('g9').abortReason).toBe('busy');
  });
});

// ---------- rounds ----------

describe('round play', () => {
  it('start ships identical questions to every guest', () => {
    const sim = makeRoom(['Ben', 'Cem', 'Dua']);
    startRound(sim);
    expect(sim.host.phase).toBe('playing');
    for (const id of ['g1', 'g2', 'g3']) {
      const g = sim.guest(id);
      expect(g.phase).toBe('playing');
      expect(JSON.parse(JSON.stringify(g.questions))).toEqual(JSON.parse(JSON.stringify(QUESTIONS)));
      expect(g.durationMs).toBe(60_000);
    }
  });

  it('progress is relayed live to every other player', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'g1', 2);
    const benScore = sim.guest('g1').me.score;
    expect(sim.host.peers.find((p) => p.id === 'g1')?.score).toBe(benScore);
    expect(sim.guest('g2').peers.find((p) => p.id === 'g1')?.score).toBe(benScore);
    expect(sim.guest('g2').peers.find((p) => p.id === 'g1')?.total).toBe(2);

    score(sim, 'host', 1);
    expect(sim.guest('g1').peers.find((p) => p.id === HOST_ID)?.score).toBe(10);
  });

  it('three players finish into a consistent ranking on every device', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'host', 3); // 36
    score(sim, 'g1', 2); // 22
    score(sim, 'g2', 1); // 10

    finish(sim, 'host');
    expect(sim.host.phase).toBe('playing'); // others still going
    finish(sim, 'g1');
    finish(sim, 'g2');

    expect(sim.host.phase).toBe('done');
    expect(sim.host.outcome).toBe('win');
    expect(sim.guest('g1').outcome).toBe('lose');
    expect(sim.guest('g2').outcome).toBe('lose');

    // Same top-to-bottom order everywhere, correct ranks for each viewer.
    expect(duelResults(sim.host).map((r) => r.name)).toEqual(['Frau Weber', 'Ben', 'Cem']);
    expect(duelResults(sim.guest('g2')).map((r) => r.name)).toEqual(['Frau Weber', 'Ben', 'Cem']);
    expect(duelRank(duelResults(sim.guest('g1')))).toEqual({ rank: 2, of: 3 });
    expect(duelRank(duelResults(sim.guest('g2')))).toEqual({ rank: 3, of: 3 });
  });

  it('equal top scores end in a tie for those players', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'host', 1);
    score(sim, 'g1', 1);
    finish(sim, 'host');
    finish(sim, 'g1');
    finish(sim, 'g2');
    expect(sim.host.outcome).toBe('tie');
    expect(sim.guest('g1').outcome).toBe('tie');
    expect(sim.guest('g2').outcome).toBe('lose');
  });

  it('streak bonus applies to duel scoring like solo', () => {
    const sim = makeRoom(['Ben']);
    startRound(sim);
    score(sim, 'host', 3);
    // 10 + (10+2) + (10+4) = 36
    expect(sim.host.me.score).toBe(36);
    expect(sim.host.me.bestStreak).toBe(3);
  });
});

// ---------- disconnects ----------

describe('disconnects', () => {
  it('everyone else vanishing mid-play is a forfeit win', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'host', 1);
    sim.drop('g1');
    expect(sim.host.phase).toBe('playing'); // Cem is still in
    sim.drop('g2');
    expect(sim.host.phase).toBe('done');
    expect(sim.host.outcome).toBe('forfeitWin');
  });

  it('a player who finished then left stays in the ranking', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'g1', 2);
    finish(sim, 'g1');
    sim.drop('g1'); // Ben's app died after posting his score

    finish(sim, 'host');
    finish(sim, 'g2');
    expect(sim.host.phase).toBe('done');
    expect(sim.host.outcome).toBe('lose'); // 0 vs Ben's 22
    // Host and Cem are tied at 0 — ties fall back to alphabetical order.
    expect(duelResults(sim.guest('g2')).map((r) => r.name)).toEqual(['Ben', 'Cem', 'Frau Weber']);
  });

  it('an unfinished dropout unblocks the round for everyone', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    finish(sim, 'host');
    finish(sim, 'g1');
    expect(sim.host.phase).toBe('playing'); // waiting for Cem
    sim.drop('g2');
    expect(sim.host.phase).toBe('done');
    expect(sim.guest('g1').phase).toBe('done');
    // Cem never finished — he is not ranked.
    expect(duelResults(sim.host)).toHaveLength(2);
  });

  it('lobby leaves shrink the roster everywhere; an empty room waits again', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    sim.drop('g1');
    expect(sim.host.phase).toBe('lobby');
    expect(sim.host.peers.map((p) => p.name)).toEqual(['Cem']);
    expect(sim.guest('g2').peers.map((p) => p.name)).toEqual(['Frau Weber']);
    sim.drop('g2');
    expect(sim.host.phase).toBe('waiting');
  });

  it('host leaving the lobby aborts the guests', () => {
    const sim = makeRoom(['Ben']);
    sim.dropHost();
    expect(sim.guest('g1').phase).toBe('aborted');
    expect(sim.guest('g1').abortReason).toBe('peerLeft');
  });

  it('host dying mid-round before anyone finished is a forfeit win for guests', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    sim.dropHost();
    expect(sim.guest('g1').phase).toBe('done');
    expect(sim.guest('g1').outcome).toBe('forfeitWin');
  });

  it('host dying after a rival finished keeps the comparison', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    startRound(sim);
    score(sim, 'g2', 1);
    finish(sim, 'g2'); // relayed to Ben before the host goes down
    sim.dropHost();
    expect(sim.guest('g1').phase).toBe('playing'); // still playing vs Cem's 10
    sim.dispatchGuest('g1', { type: 'localFinish' });
    expect(sim.guest('g1').phase).toBe('done');
    expect(sim.guest('g1').outcome).toBe('lose'); // 0 vs 10
  });

  it('a guest that never connects aborts with a network reason', () => {
    let guest = initialDuel('guest', 'Ben');
    guest = duelReducer(guest, { type: 'connected' });
    guest = duelReducer(guest, { type: 'peerGone' });
    expect(guest.phase).toBe('aborted');
    expect(guest.abortReason).toBe('network');
  });

  it('bye behaves like the socket dying', () => {
    const sim = makeRoom(['Ben']);
    startRound(sim);
    sim.dispatchHost({ type: 'msg', msg: { t: 'bye' }, from: 'g1' });
    expect(sim.host.outcome).toBe('forfeitWin');
  });
});

// ---------- next rounds & late joiners ----------

describe('next round', () => {
  function playToDone(sim: Sim) {
    startRound(sim);
    score(sim, 'host', 1);
    finish(sim, 'host');
    for (const id of sim.guests.keys()) finish(sim, id);
  }

  it('host relaunches from the results screen; scores reset everywhere', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    playToDone(sim);
    expect(sim.host.phase).toBe('done');

    const q2 = buildBlitzQuestions(POOL, 99);
    sim.dispatchHost({ type: 'localStart', questions: q2, seed: 99, durationMs: 60_000 });
    expect(sim.host.phase).toBe('countdown');
    expect(sim.host.me.score).toBe(0);
    expect(sim.host.outcome).toBeNull();
    for (const id of ['g1', 'g2']) {
      expect(sim.guest(id).phase).toBe('countdown');
      expect(sim.guest(id).seed).toBe(99);
      expect(sim.guest(id).me.score).toBe(0);
      expect(sim.guest(id).peers.every((p) => p.score === 0 && !p.finished)).toBe(true);
    }
  });

  it('players who left between rounds are not carried into the next one', () => {
    const sim = makeRoom(['Ben', 'Cem']);
    playToDone(sim);
    sim.drop('g1');
    sim.dispatchHost({ type: 'localStart', questions: QUESTIONS, seed: 7, durationMs: 60_000 });
    expect(sim.host.peers.map((p) => p.name)).toEqual(['Cem']);
    expect(sim.guest('g2').peers.map((p) => p.name)).toEqual(['Frau Weber']);
  });

  it('a latecomer can join at the results screen and plays the next round', () => {
    const sim = makeRoom(['Ben']);
    playToDone(sim);

    sim.join('g2', 'Cem');
    expect(sim.guest('g2').phase).toBe('lobby');
    expect(sim.host.phase).toBe('done'); // results stay up for the host
    expect(sim.host.peers.map((p) => p.name)).toEqual(['Ben', 'Cem']);

    sim.dispatchHost({ type: 'localStart', questions: QUESTIONS, seed: 7, durationMs: 60_000 });
    expect(sim.guest('g2').phase).toBe('countdown');
    expect(sim.guest('g1').phase).toBe('countdown');
    expect(sim.guest('g2').peers.map((p) => p.name).sort()).toEqual(['Ben', 'Frau Weber']);
  });

  it('the host cannot start a round with no one in the room', () => {
    const sim = makeRoom(['Ben']);
    playToDone(sim);
    sim.drop('g1');
    sim.dispatchHost({ type: 'localStart', questions: QUESTIONS, seed: 7, durationMs: 60_000 });
    expect(sim.host.phase).toBe('done');
  });
});
