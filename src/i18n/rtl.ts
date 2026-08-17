/**
 * Right-to-left layout switching (Arabic).
 *
 * React Native decides text/flex direction once at startup, so flipping
 * `I18nManager` only takes effect after a reload. Arabic is the only RTL
 * language the app ships, so this is rare: the user is told, then the app
 * restarts itself.
 */

import { DevSettings, I18nManager } from 'react-native';

import { LOCALE_META, type Locale } from '@/i18n/locales';

export function isRtlLocale(locale: Locale): boolean {
  return LOCALE_META[locale].rtl;
}

/** True when switching to `locale` needs a restart to look right. */
export function needsRtlRestart(locale: Locale): boolean {
  return isRtlLocale(locale) !== I18nManager.isRTL;
}

/**
 * Apply the layout direction for `locale` and reload. `expo-updates` owns
 * the reload in release builds; `DevSettings` covers Expo Go and dev clients
 * where no update is loaded.
 */
export async function applyRtlAndReload(locale: Locale): Promise<void> {
  const rtl = isRtlLocale(locale);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  try {
    // Imported lazily: older store binaries may predate expo-updates, and a
    // top-level require would crash them at import time.
    const Updates = require('expo-updates') as typeof import('expo-updates');
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}
