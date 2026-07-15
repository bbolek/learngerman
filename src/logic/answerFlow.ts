/**
 * Quiz answer flow — retry until solved, "Antwort zeigen" as the way out.
 *
 * A question is *finalized* exactly once: on the first correct submission
 * before the answer was revealed (counts as mastered), or on reveal/skip
 * (counts as wrong). Everything after finalization is practice only.
 * The reducer owns that exactly-once guarantee; the screen just runs the
 * returned effect (XP award + attempt logging).
 */

export type AnswerPhase = 'unanswered' | 'wrong' | 'revealed' | 'correct';

export interface AnswerFlowState {
  phase: AnswerPhase;
  /** Wrong submissions so far; > 0 unlocks "Antwort zeigen". */
  wrongAttempts: number;
  /** A finalize effect has been emitted — no further award/log may happen. */
  finalized: boolean;
  /** Post-reveal practice: the last submission was correct (cosmetic). */
  practiceCorrect: boolean;
  /** Set on the finalizing correct submission (umlaut-folded fill match). */
  nearMiss: boolean;
}

export type AnswerFlowEvent =
  | { type: 'submit'; correct: boolean; nearMiss?: boolean }
  | { type: 'reveal' }
  | { type: 'advance' };

export type AnswerFlowEffect = 'finalize_correct' | 'finalize_wrong' | 'none';

export const initialAnswerFlow: AnswerFlowState = {
  phase: 'unanswered',
  wrongAttempts: 0,
  finalized: false,
  practiceCorrect: false,
  nearMiss: false,
};

export function reduceAnswerFlow(
  state: AnswerFlowState,
  event: AnswerFlowEvent
): { state: AnswerFlowState; effect: AnswerFlowEffect } {
  switch (event.type) {
    case 'submit': {
      if (state.phase === 'revealed') {
        return {
          state: { ...state, practiceCorrect: event.correct },
          effect: 'none',
        };
      }
      if (state.phase === 'correct' || state.finalized) {
        return { state, effect: 'none' };
      }
      if (event.correct) {
        return {
          state: {
            ...state,
            phase: 'correct',
            finalized: true,
            nearMiss: event.nearMiss ?? false,
          },
          effect: 'finalize_correct',
        };
      }
      return {
        state: { ...state, phase: 'wrong', wrongAttempts: state.wrongAttempts + 1 },
        effect: 'none',
      };
    }
    case 'reveal': {
      if (state.phase !== 'wrong' || state.finalized) {
        return { state, effect: 'none' };
      }
      return {
        state: { ...state, phase: 'revealed', finalized: true },
        effect: 'finalize_wrong',
      };
    }
    case 'advance': {
      // Skipping an unsolved question finalizes it as wrong; everything
      // else was already settled. The screen resets state after advancing.
      if (state.phase === 'wrong' && !state.finalized) {
        return { state: { ...state, finalized: true }, effect: 'finalize_wrong' };
      }
      return { state, effect: 'none' };
    }
  }
}
