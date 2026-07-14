import { create } from 'zustand';

import { playSound, type SoundKind } from '@/services/sound';
import { useSettings } from '@/store/settings';

export type CelebrationKind =
  | 'levelUp'
  | 'streakMilestone'
  | 'achievement'
  | 'record'
  | 'quest';

export interface CelebrationEvent {
  kind: CelebrationKind;
  emoji: string;
  title: string;
  subtitle?: string;
}

export interface QueuedCelebration extends CelebrationEvent {
  /** Unique per enqueue — keys the overlay so back-to-back twins still replay. */
  id: number;
}

interface CelebrationState {
  /** Currently showing event (head of the queue), or null. */
  current: QueuedCelebration | null;
  queue: QueuedCelebration[];
  /** Enqueue a reward moment; the overlay plays them one after another. */
  celebrate: (event: CelebrationEvent) => void;
  /** Called by the overlay when the current animation finished. */
  advance: () => void;
}

const SOUND_FOR: Record<CelebrationKind, SoundKind> = {
  levelUp: 'levelup',
  streakMilestone: 'fanfare',
  achievement: 'fanfare',
  record: 'fanfare',
  quest: 'quest',
};

function announce(event: CelebrationEvent) {
  playSound(SOUND_FOR[event.kind]);
  if (useSettings.getState().hapticsEnabled) {
    // Lazy import keeps this store safe to load in node tests.
    import('expo-haptics')
      .then((Haptics) => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch(() => {});
  }
}

let nextId = 1;

export const useCelebration = create<CelebrationState>((set, get) => ({
  current: null,
  queue: [],
  celebrate: (event) => {
    const queued: QueuedCelebration = { ...event, id: nextId++ };
    const { current, queue } = get();
    if (current) {
      set({ queue: [...queue, queued] });
    } else {
      announce(queued);
      set({ current: queued });
    }
  },
  advance: () => {
    const [next, ...rest] = get().queue;
    if (next) announce(next);
    set({ current: next ?? null, queue: rest });
  },
}));

/** Convenience for screens: fire-and-forget. */
export function celebrate(event: CelebrationEvent) {
  useCelebration.getState().celebrate(event);
}
