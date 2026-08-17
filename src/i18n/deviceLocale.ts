/**
 * Device language, read without adding a native dependency.
 *
 * `expo-localization` would be the obvious choice, but pulling in a native
 * module means every OTA update has to wait for a new store binary (see the
 * OTA note in CLAUDE.md). React Native already exposes the same values on
 * both platforms, and Hermes' `Intl` is a good enough third fallback, so the
 * app keeps shipping language changes over the air.
 */

import { NativeModules, Platform } from 'react-native';

/**
 * Device languages, best first ("de-AT" before "en-US"). Empty when nothing
 * can be read — callers fall back to German.
 */
export function deviceLanguageTags(): string[] {
  const tags: string[] = [];

  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const preferred = settings?.AppleLanguages;
      if (Array.isArray(preferred)) tags.push(...preferred.filter((v) => typeof v === 'string'));
      if (typeof settings?.AppleLocale === 'string') tags.push(settings.AppleLocale);
    } else if (Platform.OS === 'android') {
      const identifier = NativeModules.I18nManager?.localeIdentifier;
      if (typeof identifier === 'string') tags.push(identifier);
    } else if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { languages?: string[] };
      if (Array.isArray(nav.languages)) tags.push(...nav.languages);
      if (typeof nav.language === 'string') tags.push(nav.language);
    }
  } catch {
    // Native module shapes differ across versions — Intl below still works.
  }

  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof resolved === 'string') tags.push(resolved);
  } catch {
    // Hermes without Intl — nothing more to try.
  }

  return tags;
}
