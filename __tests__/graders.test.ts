import {
  gradeCaseId,
  gradeFillBlank,
  gradeMultipleChoice,
  gradeOrdering,
  shuffled,
  splitHighlight,
  type CaseIdPayload,
  type FillPayload,
  type OrderPayload,
} from '@/logic/graders';

describe('gradeMultipleChoice', () => {
  const payload = { prompt: 'Ich sehe ___ Mann.', options: ['der', 'den'], correctIndex: 1, explanation: '' };
  it('accepts the right index and rejects others', () => {
    expect(gradeMultipleChoice(payload, 1)).toBe(true);
    expect(gradeMultipleChoice(payload, 0)).toBe(false);
  });
});

describe('gradeFillBlank', () => {
  const payload: FillPayload = { prompt: '…', accept: ['einen'], explanation: '' };

  it('accepts exact answers ignoring case and whitespace', () => {
    expect(gradeFillBlank(payload, ' Einen ')).toMatchObject({ correct: true, nearMiss: false });
  });

  it('rejects wrong answers with the expected form', () => {
    expect(gradeFillBlank(payload, 'einem')).toMatchObject({ correct: false, expected: 'einen' });
  });

  it('accepts umlaut-folded spelling as a near miss', () => {
    const p: FillPayload = { prompt: '…', accept: ['große'], explanation: '' };
    expect(gradeFillBlank(p, 'grosse')).toMatchObject({ correct: true, nearMiss: true });
    expect(gradeFillBlank(p, 'große')).toMatchObject({ correct: true, nearMiss: false });
  });

  it('checks alternate accepted answers', () => {
    const p: FillPayload = { prompt: '…', accept: ['zum', 'zu dem'], explanation: '' };
    expect(gradeFillBlank(p, 'zu  dem').correct).toBe(true);
  });
});

describe('gradeOrdering', () => {
  const payload: OrderPayload = {
    tokens: ['gebe', 'dem', 'Kind', 'ich', 'einen', 'Apfel'],
    solutions: [
      ['Ich', 'gebe', 'dem', 'Kind', 'einen', 'Apfel'],
      ['Dem', 'Kind', 'gebe', 'ich', 'einen', 'Apfel'],
    ],
    explanation: '',
  };

  it('accepts any listed valid order', () => {
    expect(gradeOrdering(payload, ['Ich', 'gebe', 'dem', 'Kind', 'einen', 'Apfel'])).toBe(true);
    expect(gradeOrdering(payload, ['Dem', 'Kind', 'gebe', 'ich', 'einen', 'Apfel'])).toBe(true);
  });

  it('rejects wrong orders and incomplete sequences', () => {
    expect(gradeOrdering(payload, ['Ich', 'dem', 'gebe', 'Kind', 'einen', 'Apfel'])).toBe(false);
    expect(gradeOrdering(payload, ['Ich', 'gebe', 'dem', 'Kind'])).toBe(false);
  });
});

describe('gradeCaseId', () => {
  const payload: CaseIdPayload = {
    sentence: 'Der Lehrer gibt **dem Schüler** ein Buch.',
    correctCase: 'dativ',
    reasons: ['a', 'b', 'c', 'd'],
    correctReasonIndex: 2,
    explanation: '',
  };

  it('requires both parts for full credit', () => {
    expect(gradeCaseId(payload, 'dativ', 2)).toEqual({ caseCorrect: true, reasonCorrect: true, correct: true });
    expect(gradeCaseId(payload, 'dativ', 0)).toMatchObject({ caseCorrect: true, correct: false });
    expect(gradeCaseId(payload, 'akkusativ', 2)).toMatchObject({ reasonCorrect: true, correct: false });
  });
});

describe('splitHighlight', () => {
  it('splits around the marked phrase', () => {
    expect(splitHighlight('Der Lehrer gibt **dem Schüler** ein Buch.')).toEqual([
      'Der Lehrer gibt ',
      'dem Schüler',
      ' ein Buch.',
    ]);
  });
});

describe('shuffled', () => {
  it('is deterministic per seed and keeps all items', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
    expect([...shuffled(items, 7)].sort()).toEqual([...items].sort());
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('produces different permutations for nearby Date.now()-sized seeds', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const base = 1751700000000 & 0x7fffffff;
    const perms = new Set(
      Array.from({ length: 8 }, (_, i) => shuffled(items, base + i).join(''))
    );
    expect(perms.size).toBeGreaterThan(4);
  });
});
