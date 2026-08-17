/**
 * Catalog registry. German defines the key set; every other language is
 * typed as `Catalog`, so a missing or misspelled key is a compile error
 * rather than a German string leaking into a translated screen.
 */

import { de } from '@/i18n/locales/de';
import type { Locale } from '@/i18n/locales';
import type { Message } from '@/i18n/message';

export type TranslationKey = keyof typeof de;

export type Catalog = Record<TranslationKey, Message>;

export const CATALOGS: Record<Locale, Catalog> = {
  de,
  // Filled in as each translation lands; see locales/*.ts.
} as Record<Locale, Catalog>;

export { de };
