/**
 * Message shape, `{placeholder}` interpolation and plural selection.
 *
 * Plural categories follow CLDR but are hand-rolled rather than taken from
 * `Intl.PluralRules`: the app ships offline on old Android builds where the
 * bundled ICU data is unreliable, and eleven fixed languages are a short
 * table. Everything here is pure so jest can test it directly.
 */

import type { Locale } from '@/i18n/locales';

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * A message is either a plain string or, when it has to agree with a count,
 * a record of plural forms. Only `other` is required, so a language that
 * needs three forms can declare them for a key where German needs two.
 */
export interface PluralMessage {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type Message = string | PluralMessage;

export type MessageVars = Record<string, string | number>;

export function pluralCategory(locale: Locale, n: number): PluralCategory {
  const abs = Math.abs(n);
  const i10 = abs % 10;
  const i100 = abs % 100;
  switch (locale) {
    case 'fr':
    case 'pt':
      // 0 and 1 share the singular.
      return abs < 2 ? 'one' : 'other';
    case 'pl':
      if (abs === 1) return 'one';
      if (i10 >= 2 && i10 <= 4 && !(i100 >= 12 && i100 <= 14)) return 'few';
      return 'many';
    case 'ru':
    case 'uk':
      if (i10 === 1 && i100 !== 11) return 'one';
      if (i10 >= 2 && i10 <= 4 && !(i100 >= 12 && i100 <= 14)) return 'few';
      return 'many';
    case 'ar':
      if (abs === 0) return 'zero';
      if (abs === 1) return 'one';
      if (abs === 2) return 'two';
      if (i100 >= 3 && i100 <= 10) return 'few';
      if (i100 >= 11 && i100 <= 99) return 'many';
      return 'other';
    default:
      // de, en, tr, es, it
      return abs === 1 ? 'one' : 'other';
  }
}

/**
 * A missing form falls back to `other` — the only category every message is
 * required to carry — before trying its neighbours. Languages whose widest
 * form is the catch-all (Polish, Russian, Ukrainian write their "many" form
 * as `other`) therefore resolve correctly without duplicating the text.
 */
const CATEGORY_FALLBACKS: Record<PluralCategory, PluralCategory[]> = {
  zero: ['zero', 'other'],
  one: ['one', 'other'],
  two: ['two', 'other', 'few', 'many'],
  few: ['few', 'other', 'many'],
  many: ['many', 'other', 'few'],
  other: ['other'],
};

export function selectPlural(message: PluralMessage, locale: Locale, n: number): string {
  const wanted = pluralCategory(locale, n);
  for (const category of CATEGORY_FALLBACKS[wanted]) {
    const form = message[category];
    if (form != null) return form;
  }
  return message.other;
}

/** Replaces every `{name}` with the matching var; unknown names stay put. */
export function interpolate(template: string, vars: MessageVars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/**
 * Resolve one catalog entry. A `count` var both picks the plural form and
 * stays available as `{count}` inside it.
 */
export function formatMessage(
  message: Message,
  locale: Locale,
  vars?: MessageVars
): string {
  const count = vars?.count;
  const template =
    typeof message === 'string'
      ? message
      : selectPlural(message, locale, typeof count === 'number' ? count : 0);
  return interpolate(template, vars);
}
