import { CATALOGS } from '@/i18n/catalog';
import { de } from '@/i18n/locales/de';
import { LOCALES, LOCALE_META, matchLocale, isLocale } from '@/i18n/locales';
import {
  formatMessage,
  interpolate,
  pluralCategory,
  selectPlural,
  type Message,
} from '@/i18n/message';

const KEYS = Object.keys(de) as (keyof typeof de)[];

/** Every `{name}` a message expects, so translations can be compared to German. */
function placeholders(message: Message): Set<string> {
  const texts = typeof message === 'string' ? [message] : Object.values(message);
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/\{(\w+)\}/g)) names.add(match[1]);
  }
  return names;
}

describe('catalogs', () => {
  it('ships one catalog per supported locale', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s has exactly the German key set', (locale) => {
    expect(Object.keys(CATALOGS[locale]).sort()).toEqual([...KEYS].sort());
  });

  it.each(LOCALES)('%s has no blank messages', (locale) => {
    // The tour's German headline needs no gloss when the UI is German.
    const mayBeEmpty = (key: string) => key === 'tour.finish.headlineGloss' && locale === 'de';
    const blank = KEYS.filter((key) => {
      if (mayBeEmpty(key)) return false;
      const message = CATALOGS[locale][key];
      const texts = typeof message === 'string' ? [message] : Object.values(message);
      return texts.some((text) => text.trim() === '');
    });
    expect(blank).toEqual([]);
  });

  /**
   * A dropped or misspelled placeholder renders as a literal `{cost}` in the
   * app, which type checking cannot catch — so compare against German.
   */
  it.each(LOCALES.filter((l) => l !== 'de'))('%s uses the same placeholders as German', (locale) => {
    const mismatches: string[] = [];
    for (const key of KEYS) {
      const expected = [...placeholders(de[key])].sort();
      const actual = [...placeholders(CATALOGS[locale][key])].sort();
      if (expected.join() !== actual.join()) {
        mismatches.push(`${key}: expected {${expected}} but found {${actual}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  /** A one-form plural record says nothing a plain string would not. */
  it.each(LOCALES)('%s plural records carry more than one form', (locale) => {
    const single = KEYS.filter((key) => {
      const message = CATALOGS[locale][key];
      return typeof message !== 'string' && Object.values(message).length < 2;
    });
    expect(single).toEqual([]);
  });

  it('every locale has metadata and a BCP-47 tag', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_META[locale].nativeName.length).toBeGreaterThan(0);
      expect(LOCALE_META[locale].tag).toContain(locale);
    }
  });
});

describe('matchLocale', () => {
  it('drops the region and takes the first supported tag', () => {
    expect(matchLocale(['pt-BR', 'en-US'])).toBe('pt');
    expect(matchLocale(['de_AT'])).toBe('de');
    expect(matchLocale(['sv-SE', 'tr-TR'])).toBe('tr');
  });

  it('falls back to German for unsupported or empty input', () => {
    expect(matchLocale(['ja-JP'])).toBe('de');
    expect(matchLocale([])).toBe('de');
  });

  it('recognises supported locale codes', () => {
    expect(isLocale('uk')).toBe(true);
    expect(isLocale('ja')).toBe(false);
  });
});

describe('pluralCategory', () => {
  it('splits one from the rest in the two-form languages', () => {
    for (const locale of ['de', 'en', 'es', 'it', 'tr'] as const) {
      expect(pluralCategory(locale, 1)).toBe('one');
      expect(pluralCategory(locale, 0)).toBe('other');
      expect(pluralCategory(locale, 5)).toBe('other');
    }
  });

  it('groups zero with one in French and Portuguese', () => {
    expect(pluralCategory('fr', 0)).toBe('one');
    expect(pluralCategory('pt', 1)).toBe('one');
    expect(pluralCategory('fr', 2)).toBe('other');
  });

  it('follows the Slavic one/few/many split', () => {
    expect(pluralCategory('ru', 1)).toBe('one');
    expect(pluralCategory('ru', 21)).toBe('one');
    expect(pluralCategory('ru', 11)).toBe('many');
    expect(pluralCategory('ru', 3)).toBe('few');
    expect(pluralCategory('ru', 14)).toBe('many');
    expect(pluralCategory('uk', 22)).toBe('few');
    expect(pluralCategory('pl', 1)).toBe('one');
    expect(pluralCategory('pl', 2)).toBe('few');
    expect(pluralCategory('pl', 12)).toBe('many');
  });

  it('covers the six Arabic forms', () => {
    expect(pluralCategory('ar', 0)).toBe('zero');
    expect(pluralCategory('ar', 1)).toBe('one');
    expect(pluralCategory('ar', 2)).toBe('two');
    expect(pluralCategory('ar', 7)).toBe('few');
    expect(pluralCategory('ar', 50)).toBe('many');
    expect(pluralCategory('ar', 101)).toBe('other');
  });
});

describe('selectPlural', () => {
  it('falls back to `other` when the exact form is missing', () => {
    // Polish writes its "many" form as `other`.
    expect(selectPlural({ one: 'a', few: 'b', other: 'c' }, 'pl', 5)).toBe('c');
    expect(selectPlural({ one: 'a', few: 'b', other: 'c' }, 'pl', 3)).toBe('b');
    expect(selectPlural({ one: 'a', other: 'c' }, 'de', 2)).toBe('c');
  });
});

describe('interpolate', () => {
  it('fills known names and leaves unknown ones alone', () => {
    expect(interpolate('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2');
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(interpolate('plain', undefined)).toBe('plain');
  });
});

describe('formatMessage', () => {
  it('picks the plural form and still fills {count}', () => {
    const message = { one: '{count} Karte', other: '{count} Karten' };
    expect(formatMessage(message, 'de', { count: 1 })).toBe('1 Karte');
    expect(formatMessage(message, 'de', { count: 7 })).toBe('7 Karten');
  });

  it('renders every German counted message for a spread of counts', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        const message = CATALOGS[locale][key];
        if (typeof message === 'string') continue;
        for (const count of [0, 1, 2, 3, 5, 11, 21, 101]) {
          expect(formatMessage(message, locale, { count })).not.toContain('{count}');
        }
      }
    }
  });
});
