import { compoundCandidates, reducedCandidates, resolveByParts } from '@/logic/wordParts';

/** A toy dictionary: only these spellings "exist". */
const lemmas = new Set([
  'apfel',
  'kuchen',
  'fisch',
  'brötchen',
  'könig',
  'tochter',
  'nach',
  'sehen',
  'ehe',
  'ort',
  'name',
  'personal',
  'chef',
  'läufer',
  'erstarrend',
  'straße',
  'rand',
]);
const forms = new Set(['ehen', 'namen', 'sieht', 'erstarrende']);

const resolve = (w: string) => resolveByParts(w, (p) => lemmas.has(p), (p) => forms.has(p));

describe('reducedCandidates', () => {
  it('offers the stem without its adjective ending, longest ending first', () => {
    expect(reducedCandidates('erstarrenden')).toEqual(['erstarrend', 'erstarrende']);
    expect(reducedCandidates('zugesagtes')).toEqual(['zugesagt']);
    expect(reducedCandidates('goldene')).toEqual(['golden']);
  });

  it('undoes the diminutive, umlaut and all: Töpfchen → Topf', () => {
    expect(reducedCandidates('töpfchen')).toContain('topf');
    expect(reducedCandidates('entlein')).toContain('ente');
    expect(reducedCandidates('häuschen')).toContain('haus');
  });

  it('strips the feminine suffix: Läuferinnen → Läufer', () => {
    expect(reducedCandidates('läuferinnen')).toContain('läufer');
    expect(reducedCandidates('läuferin')).toContain('läufer');
  });

  it('leaves words too short to have an ending alone', () => {
    expect(reducedCandidates('die')).toEqual([]);
  });
});

describe('compoundCandidates', () => {
  it('offers the longest head first', () => {
    const heads = compoundCandidates('apfelkuchen').map((c) => c.head);
    expect(heads.indexOf('kuchen')).toBeLessThan(heads.indexOf('chen'));
  });

  it('accounts for linking morphemes', () => {
    expect(compoundCandidates('königstochter')).toContainEqual({
      modifier: 'könig',
      head: 'tochter',
    });
  });
});

describe('resolveByParts', () => {
  it('links a compound to its head: Apfelkuchen → Kuchen', () => {
    expect(resolve('apfelkuchen')).toBe('kuchen');
    expect(resolve('fischbrötchen')).toBe('brötchen');
  });

  it('handles a linking -s: Königstochter → Tochter', () => {
    expect(resolve('königstochter')).toBe('tochter');
  });

  it('prefers a lemma head over a longer-matching inflected one', () => {
    // nach + Ehen would be a plausible-looking split; nach + sehen is right.
    expect(resolve('nachsehen')).toBe('sehen');
  });

  it('falls back to an inflected head when no lemma splits: Ortsnamen → Namen', () => {
    expect(resolve('ortsnamen')).toBe('namen');
  });

  it('reduces before splitting: Personalchefin → Chef', () => {
    expect(resolve('personalchefin')).toBe('chef');
  });

  it('strips endings before trying anything else', () => {
    expect(resolve('erstarrenden')).toBe('erstarrend');
  });

  it('gives up rather than inventing a split', () => {
    expect(resolve('xyzzyquux')).toBeNull();
    expect(resolve('rotkäppchen')).toBeNull();
  });
});
