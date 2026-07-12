import { setAudioModeAsync } from 'expo-audio';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Speech from 'expo-speech';
import { Alert, Linking, Platform } from 'react-native';

type GermanVoice = { found: true; identifier?: string } | { found: false };

/** Only positive results are cached, so installing a voice after seeing the
 * alert takes effect on the next tap without restarting the app. */
let cached: GermanVoice | null = null;

/**
 * Pick the best installed German voice: enhanced quality beats default,
 * de-DE beats other German variants. An empty voice list (engine not yet
 * initialized, common on Android right after launch) is treated as unknown:
 * speak with the system default and don't cache.
 */
async function resolveGermanVoice(): Promise<GermanVoice> {
  if (cached) return cached;
  let voices: Speech.Voice[];
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    return { found: true };
  }
  if (voices.length === 0) return { found: true };
  const german = voices.filter((v) => v.language?.toLowerCase().startsWith('de'));
  if (german.length === 0) return { found: false };
  const score = (v: Speech.Voice) =>
    (v.quality === Speech.VoiceQuality.Enhanced ? 2 : 0) +
    (v.language.toLowerCase().startsWith('de-de') ? 1 : 0);
  german.sort((a, b) => score(b) - score(a));
  cached = { found: true, identifier: german[0].identifier };
  return cached;
}

function showMissingVoiceAlert(): void {
  if (Platform.OS === 'android') {
    Alert.alert(
      'No German voice installed',
      'Please install German language data in your device’s text-to-speech settings (e.g. "Speech Services by Google").',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open settings',
          onPress: () => {
            // Android's TTS settings screen; fall back to app settings if a
            // vendor ROM doesn't expose it.
            IntentLauncher.startActivityAsync('com.android.settings.TTS_SETTINGS').catch(() =>
              Linking.openSettings()
            );
          },
        },
      ]
    );
  } else {
    // iOS has no public deep link into the voice settings screen.
    Alert.alert(
      'No German voice installed',
      'Please install a German voice under Settings → Accessibility → Spoken Content → Voices → German.'
    );
  }
}

/** iOS defaults to the soloAmbient audio session, which the ring/silent
 * switch mutes — TTS would play into silence. Claim a playback session once
 * before the first utterance. */
let audioModeReady: Promise<void> | null = null;
function ensureAudioMode(): Promise<void> {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      audioModeReady = null;
    });
  }
  return audioModeReady;
}

export interface SpeakCallbacks {
  /** Speech actually started coming out of the engine. */
  onStart?: () => void;
  /** Utterance finished, was interrupted, or failed — always the last call. */
  onEnd?: () => void;
}

/** Speak a German word/phrase, cancelling any previous utterance. */
export async function speakGerman(text: string, callbacks: SpeakCallbacks = {}): Promise<void> {
  await ensureAudioMode();
  const voice = await resolveGermanVoice();
  if (!voice.found) {
    showMissingVoiceAlert();
    callbacks.onEnd?.();
    return;
  }
  await Speech.stop();
  const speak = (identifier: string | undefined) =>
    Speech.speak(text, {
      language: 'de-DE',
      voice: identifier,
      rate: 0.9,
      onStart: callbacks.onStart,
      onDone: callbacks.onEnd,
      onStopped: callbacks.onEnd,
      // A cached voice can go stale (uninstalled, engine swapped). Drop it
      // and retry once with the engine's own German default.
      onError: identifier
        ? () => {
            cached = null;
            speak(undefined);
          }
        : callbacks.onEnd,
    });
  speak(voice.identifier);
}
