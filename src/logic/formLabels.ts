/**
 * Which German form tags the app can name. The names themselves are UI copy
 * and live in the translation catalogs (`form.*`, `exampleTag.*`); this
 * module only knows which tags are covered, so it stays free of copy.
 * See src/i18n/labels.ts for the lookup helpers.
 */

export const FORM_TAGS = [
  'präsens_ich',
  'präsens_du',
  'präsens_er',
  'präsens_wir',
  'präsens_ihr',
  'präteritum_ich',
  'präteritum_du',
  'präteritum_er',
  'präteritum_wir',
  'präteritum_ihr',
  'partizip2',
  'imperativ_du',
  'imperativ_ihr',
  'konjunktiv2',
  'plural',
  'plural_dativ',
  'genitiv',
  'akkusativ',
  'dativ',
  'possessiv',
  'kontraktion',
  'komparativ',
  'superlativ',
  'dekliniert',
] as const;

export type FormTag = (typeof FORM_TAGS)[number];

export const EXAMPLE_TAGS = [
  'präsens',
  'präteritum',
  'perfekt',
  'imperativ',
  'frage',
  'negation',
  'plural',
  'dativ',
  'akkusativ',
  'komparativ',
  'superlativ',
  'allgemein',
] as const;

export type ExampleTag = (typeof EXAMPLE_TAGS)[number];

const FORM_TAG_SET = new Set<string>(FORM_TAGS);
const EXAMPLE_TAG_SET = new Set<string>(EXAMPLE_TAGS);

export function isFormTag(tag: string | undefined | null): tag is FormTag {
  return tag != null && FORM_TAG_SET.has(tag);
}

export function isExampleTag(tag: string): tag is ExampleTag {
  return EXAMPLE_TAG_SET.has(tag);
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
