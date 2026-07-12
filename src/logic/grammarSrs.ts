/**
 * Pure logic bridging a completed grammar quiz round to the SM-2 scheduler.
 * No RN imports, no Date.now() — kept testable and reused by grammarSrsRepo.
 */

import { type Rating } from '@/logic/sm2';

/**
 * Map a finished round's score to an SM-2 rating, mirroring how a learner
 * would self-grade a flashcard:
 *   < 50% → Again, < 70% → Hard, < 90% → Good, else Easy.
 * An empty round grades as Good so it never punishes a topic with no questions.
 */
export function ratingFromScore(correct: number, total: number): Rating {
  if (total <= 0) return 2;
  const accuracy = correct / total;
  if (accuracy < 0.5) return 0;
  if (accuracy < 0.7) return 1;
  if (accuracy < 0.9) return 2;
  return 3;
}
