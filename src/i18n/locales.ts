/**
 * The languages the UI ships in. Pure data — no RN imports — so both the
 * runtime and the jest catalog tests can read it.
 *
 * German stays the default: the app is a German course and every learner
 * eventually wants the German labels. `system` follows the device.
 */

export const LOCALES = ['de', 'en', 'tr', 'es', 'fr', 'it', 'pt', 'pl', 'ru', 'uk', 'ar'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'de';

/** Stored language preference: an explicit locale, or "follow the device". */
export type LanguagePreference = Locale | 'system';

export interface LocaleMeta {
  /** Name in its own language — how it is listed in the picker. */
  nativeName: string;
  /** BCP-47 tag for Intl / toLocaleDateString. */
  tag: string;
  rtl: boolean;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  de: { nativeName: 'Deutsch', tag: 'de-DE', rtl: false },
  en: { nativeName: 'English', tag: 'en-US', rtl: false },
  tr: { nativeName: 'Türkçe', tag: 'tr-TR', rtl: false },
  es: { nativeName: 'Español', tag: 'es-ES', rtl: false },
  fr: { nativeName: 'Français', tag: 'fr-FR', rtl: false },
  it: { nativeName: 'Italiano', tag: 'it-IT', rtl: false },
  pt: { nativeName: 'Português', tag: 'pt-PT', rtl: false },
  pl: { nativeName: 'Polski', tag: 'pl-PL', rtl: false },
  ru: { nativeName: 'Русский', tag: 'ru-RU', rtl: false },
  uk: { nativeName: 'Українська', tag: 'uk-UA', rtl: false },
  ar: { nativeName: 'العربية', tag: 'ar', rtl: true },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best supported locale for a list of device language tags
 * (["pt-BR", "en-US"] → "pt"). Regions are dropped; unsupported tags fall
 * through to the next candidate and finally to German.
 */
export function matchLocale(deviceTags: readonly string[]): Locale {
  for (const raw of deviceTags) {
    const base = raw.toLowerCase().replace('_', '-').split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
