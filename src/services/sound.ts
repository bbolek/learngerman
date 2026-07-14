import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { useSettings } from '@/store/settings';

/**
 * Short reward/feedback cues (issue #38). Files are tiny synthesized WAVs
 * bundled with the app (regenerate via `npm run build:sounds`). Playback is
 * fire-and-forget and gated by the sound setting; players are created lazily
 * and reused.
 */
export type SoundKind = 'correct' | 'wrong' | 'levelup' | 'fanfare' | 'quest';

const SOURCES: Record<SoundKind, number> = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  fanfare: require('../../assets/sounds/fanfare.wav'),
  quest: require('../../assets/sounds/quest.wav'),
};

const players = new Map<SoundKind, AudioPlayer>();

export function playSound(kind: SoundKind): void {
  if (!useSettings.getState().soundEnabled) return;
  try {
    let player = players.get(kind);
    if (!player) {
      player = createAudioPlayer(SOURCES[kind]);
      players.set(kind, player);
    }
    player.seekTo(0);
    player.play();
  } catch {
    // Audio is decoration — never let it break a learning flow.
  }
}
