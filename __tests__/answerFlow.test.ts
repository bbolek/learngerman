import {
  initialAnswerFlow,
  reduceAnswerFlow,
  type AnswerFlowEffect,
  type AnswerFlowEvent,
  type AnswerFlowState,
} from '@/logic/answerFlow';

/** Run a sequence of events, returning the final state and all effects. */
function run(events: AnswerFlowEvent[]): { state: AnswerFlowState; effects: AnswerFlowEffect[] } {
  let state = initialAnswerFlow;
  const effects: AnswerFlowEffect[] = [];
  for (const event of events) {
    const r = reduceAnswerFlow(state, event);
    state = r.state;
    effects.push(r.effect);
  }
  return { state, effects };
}

const wrong: AnswerFlowEvent = { type: 'submit', correct: false };
const correct: AnswerFlowEvent = { type: 'submit', correct: true };
const reveal: AnswerFlowEvent = { type: 'reveal' };
const advance: AnswerFlowEvent = { type: 'advance' };

function finalizations(effects: AnswerFlowEffect[]): AnswerFlowEffect[] {
  return effects.filter((e) => e !== 'none');
}

describe('answerFlow', () => {
  it('correct on first try finalizes correct; advance is a no-op effect', () => {
    const { state, effects } = run([correct, advance]);
    expect(effects).toEqual(['finalize_correct', 'none']);
    expect(state.phase).toBe('correct');
    expect(state.finalized).toBe(true);
  });

  it('wrong answers keep the question retryable without finalizing', () => {
    const { state, effects } = run([wrong, wrong]);
    expect(finalizations(effects)).toEqual([]);
    expect(state.phase).toBe('wrong');
    expect(state.wrongAttempts).toBe(2);
    expect(state.finalized).toBe(false);
  });

  it('fixing the answer before reveal counts as correct — exactly one effect', () => {
    const { state, effects } = run([wrong, wrong, correct]);
    expect(finalizations(effects)).toEqual(['finalize_correct']);
    expect(state.phase).toBe('correct');
  });

  it('reveal after a wrong attempt finalizes wrong exactly once', () => {
    const { state, effects } = run([wrong, reveal]);
    expect(finalizations(effects)).toEqual(['finalize_wrong']);
    expect(state.phase).toBe('revealed');
    expect(state.finalized).toBe(true);
  });

  it('post-reveal submissions are practice only, toggling practiceCorrect', () => {
    const first = run([wrong, reveal, correct]);
    expect(finalizations(first.effects)).toEqual(['finalize_wrong']);
    expect(first.state.phase).toBe('revealed');
    expect(first.state.practiceCorrect).toBe(true);

    const flipped = run([wrong, reveal, correct, wrong]);
    expect(finalizations(flipped.effects)).toEqual(['finalize_wrong']);
    expect(flipped.state.practiceCorrect).toBe(false);
  });

  it('advancing from an unsolved wrong state (skip) finalizes wrong', () => {
    const { state, effects } = run([wrong, advance]);
    expect(finalizations(effects)).toEqual(['finalize_wrong']);
    expect(state.finalized).toBe(true);
  });

  it('reveal is a no-op unless a wrong attempt is pending', () => {
    expect(run([reveal]).effects).toEqual(['none']);
    expect(run([correct, reveal]).effects[1]).toBe('none');
    expect(run([wrong, reveal, reveal]).effects[2]).toBe('none');
  });

  it('never emits more than one finalize effect for any sequence', () => {
    const sequences: AnswerFlowEvent[][] = [
      [correct, correct, advance, reveal],
      [wrong, correct, correct, advance],
      [wrong, reveal, correct, wrong, correct, advance],
      [wrong, advance, advance],
      [wrong, wrong, wrong, reveal, advance],
    ];
    for (const seq of sequences) {
      expect(finalizations(run(seq).effects)).toHaveLength(1);
    }
  });

  it('propagates nearMiss on the finalizing correct submission', () => {
    const { state } = run([wrong, { type: 'submit', correct: true, nearMiss: true }]);
    expect(state.phase).toBe('correct');
    expect(state.nearMiss).toBe(true);
    expect(run([correct]).state.nearMiss).toBe(false);
  });
});
