import * as Speech from 'expo-speech';

/** Speak a German word/phrase, cancelling any previous utterance. */
export function speakGerman(text: string): void {
  Speech.stop();
  Speech.speak(text, { language: 'de-DE', rate: 0.9 });
}
