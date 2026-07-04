import { asciiFold, normalize, umlautVariants } from '@/logic/normalize';

describe('normalize', () => {
  it('lowercases, trims and keeps umlauts', () => {
    expect(normalize('  Häuser ')).toBe('häuser');
    expect(normalize('GROSSE Straße')).toBe('grosse straße');
  });
});

describe('asciiFold', () => {
  it('folds umlauts and ß to digraphs', () => {
    expect(asciiFold('häuser')).toBe('haeuser');
    expect(asciiFold('straße')).toBe('strasse');
    expect(asciiFold('öül')).toBe('oeuel');
  });
});

describe('umlautVariants', () => {
  it('expands digraphs into umlaut spellings', () => {
    expect(umlautVariants('haeuser')).toContain('häuser');
    expect(umlautVariants('strasse')).toContain('straße');
    expect(umlautVariants('gruen')).toContain('grün');
  });

  it('returns no variants for words without digraphs', () => {
    expect(umlautVariants('haus')).toEqual([]);
  });

  it('caps the number of variants', () => {
    expect(umlautVariants('aeoeuessaeoeuess').length).toBeLessThanOrEqual(8);
  });
});
