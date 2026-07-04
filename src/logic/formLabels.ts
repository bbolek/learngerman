/** Human-readable German labels for form tags ("gemacht → Partizip II"). */
const LABELS: Record<string, string> = {
  präsens_ich: 'Präsens, ich-Form',
  präsens_du: 'Präsens, du-Form',
  präsens_er: 'Präsens, er/sie/es-Form',
  präsens_wir: 'Präsens, wir-Form',
  präsens_ihr: 'Präsens, ihr-Form',
  präteritum_ich: 'Präteritum, ich-Form',
  präteritum_du: 'Präteritum, du-Form',
  präteritum_er: 'Präteritum, er/sie/es-Form',
  präteritum_wir: 'Präteritum, wir-Form',
  präteritum_ihr: 'Präteritum, ihr-Form',
  partizip2: 'Partizip II',
  imperativ_du: 'Imperativ (du)',
  imperativ_ihr: 'Imperativ (ihr)',
  plural: 'Plural',
  plural_dativ: 'Dativ Plural',
  genitiv: 'Genitiv',
  komparativ: 'Komparativ',
  superlativ: 'Superlativ',
  dekliniert: 'deklinierte Form',
};

/** Labels for the example-sentence tags shown on the word-detail screen. */
const EXAMPLE_TAG_LABELS: Record<string, string> = {
  präsens: 'Präsens',
  präteritum: 'Präteritum',
  perfekt: 'Perfekt',
  imperativ: 'Imperativ',
  frage: 'Frage',
  negation: 'Verneinung',
  plural: 'Plural',
  dativ: 'Dativ',
  akkusativ: 'Akkusativ',
  komparativ: 'Komparativ',
  superlativ: 'Superlativ',
  allgemein: 'Beispiel',
};

export function exampleTagLabel(tag: string): string {
  return EXAMPLE_TAG_LABELS[tag] ?? tag;
}

export function formLabel(tag: string | undefined | null): string | null {
  if (!tag) return null;
  return LABELS[tag] ?? null;
}

/** Article for a noun gender: "das Haus". */
export function articleFor(gender: string | null): string | null {
  switch (gender) {
    case 'm':
      return 'der';
    case 'f':
      return 'die';
    case 'n':
      return 'das';
    case 'pl':
      return 'die';
    default:
      return null;
  }
}
