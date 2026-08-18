/**
 * Catalog registry. German defines the key set; every other language is
 * typed as `Catalog`, so a missing or misspelled key is a compile error
 * rather than a German string leaking into a translated screen.
 */

import { ar } from '@/i18n/locales/ar';
import { de } from '@/i18n/locales/de';
import { en } from '@/i18n/locales/en';
import { es } from '@/i18n/locales/es';
import { fr } from '@/i18n/locales/fr';
import { it } from '@/i18n/locales/it';
import { pl } from '@/i18n/locales/pl';
import { pt } from '@/i18n/locales/pt';
import { ru } from '@/i18n/locales/ru';
import { tr } from '@/i18n/locales/tr';
import { uk } from '@/i18n/locales/uk';
import type { Locale } from '@/i18n/locales';
import type { Message } from '@/i18n/message';

export type TranslationKey = keyof typeof de;

export type Catalog = Record<TranslationKey, Message>;

export const CATALOGS: Record<Locale, Catalog> = {
  ar,
  de,
  en,
  es,
  fr,
  it,
  pl,
  pt,
  ru,
  tr,
  uk,
};

export { de };
