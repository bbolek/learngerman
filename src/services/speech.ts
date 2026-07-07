import * as Speech from 'expo-speech';
import { Alert, Platform } from 'react-native';

let hasGermanVoice: boolean | null = null;

/**
 * Whether the device TTS engine offers a German voice. An empty voice list
 * (engine not yet initialized, common on Android right after launch) is
 * treated as unknown: speak anyway and don't cache the answer.
 */
async function checkGermanVoice(): Promise<boolean> {
  if (hasGermanVoice != null) return hasGermanVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (voices.length === 0) return true;
    hasGermanVoice = voices.some((v) => v.language?.toLowerCase().startsWith('de'));
  } catch {
    return true;
  }
  return hasGermanVoice;
}

/** Speak a German word/phrase, cancelling any previous utterance. */
export async function speakGerman(text: string): Promise<void> {
  if (!(await checkGermanVoice())) {
    Alert.alert(
      'No German voice installed',
      Platform.OS === 'ios'
        ? 'Please install a German voice under Settings → Accessibility → Spoken Content → Voices → German.'
        : 'Please install German language data in your device’s text-to-speech settings (e.g. "Speech Services by Google").'
    );
    return;
  }
  Speech.stop();
  Speech.speak(text, { language: 'de-DE', rate: 0.9 });
}
