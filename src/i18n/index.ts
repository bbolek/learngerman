/**
 * Runtime translation surface.
 *
 * Screens use the `useTr()` hook so they re-render when the language
 * changes; non-React callers (services, alerts, notification bodies) use the
 * module-level `tr()`, which reads the same active locale. The theme hook
 * already owns the name `t` in most screens, so the translate function is
 * called `tr` throughout.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { CATALOGS, type TranslationKey } from '@/i18n/catalog';
import { deviceLanguageTags } from '@/i18n/deviceLocale';
import {
  DEFAULT_LOCALE,
  isEnabledLocale,
  LOCALE_META,
  matchLocale,
  type LanguagePreference,
  type Locale,
} from '@/i18n/locales';
import { formatMessage, type MessageVars } from '@/i18n/message';

/** Device language at startup — used until settings hydrate, and for 'system'. */
export function systemLocale(): Locale {
  return matchLocale(deviceLanguageTags());
}

let activeLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

/** Initialised lazily so importing this module never touches native modules. */
let initialised = false;

function ensureInitialised(): void {
  if (initialised) return;
  initialised = true;
  activeLocale = systemLocale();
}

export function getLocale(): Locale {
  ensureInitialised();
  return activeLocale;
}

/**
 * Resolve a stored preference ('system' or a locale) to a concrete locale.
 * A preference naming a language the app no longer offers falls back to the
 * default rather than rendering a catalog the picker cannot show.
 */
export function resolveLocale(preference: LanguagePreference): Locale {
  if (preference === 'system') return systemLocale();
  return isEnabledLocale(preference) ? preference : DEFAULT_LOCALE;
}

export function setLocale(locale: Locale): void {
  ensureInitialised();
  if (locale === activeLocale) return;
  activeLocale = locale;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Look up `key` in the active catalog. Missing entries (only possible for a
 * catalog that fell behind) fall back to the default language rather than
 * rendering the raw key.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: MessageVars
): string {
  const message = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key];
  if (message == null) return key;
  return formatMessage(message, locale, vars);
}

export function tr(key: TranslationKey, vars?: MessageVars): string {
  return translate(getLocale(), key, vars);
}

export type TranslateFn = (key: TranslationKey, vars?: MessageVars) => string;

/** The active locale, re-rendering the component when the language changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * `const tr = useTr();` — the translate function bound to the active locale.
 * Stable for as long as the locale is, so callers can list it in a hook's
 * dependency array without churning on every render.
 */
export function useTr(): TranslateFn {
  const locale = useLocale();
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

// ------------------------------------------------------------ formatting

/** BCP-47 tag of the active locale, for Intl / toLocaleDateString. */
export function localeTag(locale: Locale = getLocale()): string {
  return LOCALE_META[locale].tag;
}

/**
 * Locale-aware date formatting that degrades to ISO rather than throwing on
 * a Hermes build without Intl data.
 */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = getLocale()
): string {
  try {
    return date.toLocaleDateString(localeTag(locale), options);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export type { TranslationKey } from '@/i18n/catalog';
export type { Locale, LanguagePreference } from '@/i18n/locales';
