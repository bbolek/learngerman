import { normalizeToken, segmentExample, wordTokens } from '@/logic/exampleLinks';

describe('segmentExample', () => {
  it('splits words and separators losslessly', () => {
    const text = 'Ich habe gestern einen Antrag gestellt.';
    const segs = segmentExample(text);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.filter((s) => s.word).map((s) => s.text)).toEqual([
      'Ich', 'habe', 'gestern', 'einen', 'Antrag', 'gestellt',
    ]);
  });

  it('keeps umlauts, ß and inner hyphens inside words', () => {
    const segs = segmentExample('Die E-Mail über die Größe war schön.');
    expect(segs.filter((s) => s.word).map((s) => s.text)).toEqual([
      'Die', 'E-Mail', 'über', 'die', 'Größe', 'war', 'schön',
    ]);
  });

  it('treats quotes and punctuation as separators', () => {
    const segs = segmentExample('„Los geht’s!“, sagte er — sofort.');
    expect(segs.filter((s) => s.word).map((s) => s.text)).toEqual([
      'Los', 'geht', 's', 'sagte', 'er', 'sofort',
    ]);
  });

  it('handles empty and word-less strings', () => {
    expect(segmentExample('')).toEqual([]);
    expect(segmentExample('123 …!')).toEqual([{ text: '123 …!', word: false }]);
  });
});

describe('wordTokens', () => {
  it('returns unique normalized tokens, dropping single letters', () => {
    const segs = segmentExample('Die Frau sieht die FRAU — o ja.');
    expect(wordTokens(segs).sort()).toEqual(['die', 'frau', 'ja', 'sieht']);
  });

  it('normalizeToken matches the DB norm convention', () => {
    expect(normalizeToken('Größe')).toBe('größe');
    expect(normalizeToken(' Haus ')).toBe('haus');
  });
});
