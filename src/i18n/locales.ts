/**
 * The languages the UI has copy for. Pure data — no RN imports — so both the
 * runtime and the jest catalog tests can read it.
 */

export const LOCALES = ['de', 'en', 'tr', 'es', 'fr', 'it', 'pt', 'pl', 'ru', 'uk', 'ar'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The languages actually offered to users. Every catalog in `LOCALES` is
 * complete and type-checked, but only these appear in the picker and only
 * these can be reached by following the device language — shipping another
 * one is a matter of adding it here.
 */
export const ENABLED_LOCALES = ['en', 'de'] as const satisfies readonly Locale[];

/**
 * English is the default: it is the language most learners of German have in
 * common, and it is what a device set to anything we do not ship falls back
 * to.
 */
export const DEFAULT_LOCALE: Locale = 'en';

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

/** A locale the app currently offers, as opposed to one it merely has copy for. */
export function isEnabledLocale(value: unknown): value is Locale {
  return isLocale(value) && (ENABLED_LOCALES as readonly Locale[]).includes(value);
}

/**
 * Best offered locale for a list of device language tags
 * (["de-AT", "en-US"] → "de"). Regions are dropped; a language the app does
 * not currently offer — Turkish, say — falls through to the next candidate
 * and finally to English.
 */
export function matchLocale(deviceTags: readonly string[]): Locale {
  for (const raw of deviceTags) {
    const base = raw.toLowerCase().replace('_', '-').split('-')[0];
    if (isEnabledLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
