import { buildCloze, CLOZE_BLANK } from '@/logic/cloze';

describe('buildCloze', () => {
  it('blanks the matching form and keeps the rest of the sentence intact', () => {
    const c = buildCloze('Ich mache das gern.', new Set(['mache', 'machst', 'macht']));
    expect(c).toEqual({ masked: `Ich ${CLOZE_BLANK} das gern.`, answer: 'mache' });
  });

  it('matches case-insensitively but preserves the original surface form', () => {
    const c = buildCloze('Das Haus ist groß.', new Set(['haus']));
    expect(c?.answer).toBe('Haus');
    expect(c?.masked).toBe(`Das ${CLOZE_BLANK} ist groß.`);
  });

  it('only blanks the first occurrence', () => {
    const c = buildCloze('Tag für Tag.', new Set(['tag']));
    expect(c?.masked).toBe(`${CLOZE_BLANK} für Tag.`);
  });

  it('returns null when no form appears in the sentence', () => {
    expect(buildCloze('Ich gehe nach Hause.', new Set(['machen', 'mache']))).toBeNull();
  });

  it('skips forms shorter than three letters', () => {
    expect(buildCloze('Er ist da.', new Set(['er']))).toBeNull();
  });

  it('preserves punctuation adjacent to the blank', () => {
    const c = buildCloze('Kommst du, Anna?', new Set(['kommst']));
    expect(c?.masked).toBe(`${CLOZE_BLANK} du, Anna?`);
  });
});
