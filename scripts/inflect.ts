/**
 * Programmatic German inflection for the dictionary build.
 * Authors declare morphology in vocab JSON; this module expands every surface
 * form a learner might type, each tagged so the app can label matches
 * ("gemacht → Partizip II von machen").
 *
 * Known v1 limitation: separable verbs are only expanded in their JOINED
 * forms (aufmacht, aufgemacht) — split "macht … auf" is not resolved.
 */

export interface Sense {
  en: string;
  example_de?: string | null;
  example_en?: string | null;
  note?: string | null;
}

export interface VerbSpec {
  aux: 'haben' | 'sein';
  /** Separable prefix, e.g. "auf" for aufmachen. */
  separablePrefix?: string;
  /** Präteritum 3sg ("machte", "ging"). Default: weak stem+te. */
  praeteritum?: string;
  /** Partizip II ("gemacht", "gegangen"). Default: derived weak form. */
  partizip2?: string;
  /** Präsens stem-change overrides (fahren → fährst / fährt). */
  du?: string;
  er?: string;
  /** Fully irregular Präsens (sein, haben, werden, wissen…). */
  praesens?: { ich: string; du: string; er: string; wir: string; ihr: string; sie: string };
}

export interface NounSpec {
  gender: 'm' | 'f' | 'n' | 'pl';
  /** Plural surface form ("Häuser"), null when there is none. */
  plural: string | null;
  /** Genitive singular override ("Hauses"); default lemma+s for m/n. */
  genitive?: string;
}

export interface AdjSpec {
  comparative?: string;
  superlative?: string;
  /** Skip declension endings (for adverb-ish adjectives like "gern"). */
  indeclinable?: boolean;
}

export interface VocabEntry {
  lemma: string;
  pos: 'verb' | 'noun' | 'adj' | 'adv' | 'prep' | 'pron' | 'conj' | 'num' | 'other';
  level: 'A1' | 'A2' | 'B1';
  freq?: number;
  verb?: VerbSpec;
  noun?: NounSpec;
  adj?: AdjSpec;
  senses: Sense[];
}

export interface Form {
  form: string;
  tag: string;
}

export function expandForms(e: VocabEntry): Form[] {
  switch (e.pos) {
    case 'verb':
      return e.verb ? verbForms(e.lemma, e.verb) : [];
    case 'noun':
      return e.noun ? nounForms(e.lemma, e.noun) : [];
    case 'adj':
      return adjForms(e.lemma, e.adj ?? {});
    default:
      return [];
  }
}

// ---------- verbs ----------

function stemOf(infinitive: string): string {
  if (infinitive.endsWith('en')) return infinitive.slice(0, -2);
  if (infinitive.endsWith('n')) return infinitive.slice(0, -1);
  return infinitive;
}

/** Stems like arbeit-, öffn-, atm- need an e before -st/-t. */
function needsE(stem: string): boolean {
  if (/[dt]$/.test(stem)) return true;
  return /[^aeiouäöülrh][mn]$/.test(stem);
}

/** du-form after s/ß/x/z stems drops the s of -st (heißen → du heißt). */
function sibilant(stem: string): boolean {
  return /(s|ß|x|z)$/.test(stem);
}

function verbForms(lemma: string, v: VerbSpec): Form[] {
  const prefix = v.separablePrefix ?? '';
  const base = prefix ? lemma.slice(prefix.length) : lemma;
  const stem = stemOf(base);
  const e = needsE(stem) ? 'e' : '';

  const praesens = v.praesens ?? {
    ich: stem + 'e',
    du: v.du ?? (sibilant(stem) ? stem + 't' : stem + e + 'st'),
    er: v.er ?? stem + e + 't',
    wir: base,
    ihr: stem + e + 't',
    sie: base,
  };

  const praet3 = v.praeteritum ?? stem + e + 'te';
  const weak = praet3.endsWith('e');
  const praeteritum = {
    ich: praet3,
    du: praet3 + 'st',
    er: praet3,
    wir: weak ? praet3 + 'n' : praet3 + 'en',
    ihr: praet3 + 't',
  };

  const partizip2 =
    v.partizip2 ??
    (base.endsWith('ieren') ? stem + 't' : prefix ? `${prefix}ge${stem}${e}t` : `ge${stem}${e}t`);

  const join = (f: string) => prefix + f;
  const forms: Form[] = [
    { form: join(praesens.ich), tag: 'präsens_ich' },
    { form: join(praesens.du), tag: 'präsens_du' },
    { form: join(praesens.er), tag: 'präsens_er' },
    { form: join(praesens.wir), tag: 'präsens_wir' },
    { form: join(praesens.ihr), tag: 'präsens_ihr' },
    { form: join(praeteritum.ich), tag: 'präteritum_ich' },
    { form: join(praeteritum.du), tag: 'präteritum_du' },
    { form: join(praeteritum.er), tag: 'präteritum_er' },
    { form: join(praeteritum.wir), tag: 'präteritum_wir' },
    { form: join(praeteritum.ihr), tag: 'präteritum_ihr' },
    { form: partizip2, tag: 'partizip2' },
    { form: join(stem + (e ? 'e' : '')), tag: 'imperativ_du' },
    { form: join(praesens.ihr), tag: 'imperativ_ihr' },
  ];
  if (!e && !v.praesens) forms.push({ form: join(stem + 'e'), tag: 'imperativ_du' });
  return forms;
}

// ---------- nouns ----------

function nounForms(lemma: string, n: NounSpec): Form[] {
  const forms: Form[] = [];
  if (n.gender === 'pl') return forms; // plural-only lemma is its own form

  if (n.plural && n.plural !== '–' && n.plural !== '-') {
    const plural = n.plural;
    forms.push({ form: plural, tag: 'plural' });
    if (!/[ns]$/.test(plural)) forms.push({ form: plural + 'n', tag: 'plural_dativ' });
  }
  if (n.gender === 'm' || n.gender === 'n') {
    const gen = n.genitive ?? (/(s|ß|x|z)$/.test(lemma) ? lemma + 'es' : lemma + 's');
    forms.push({ form: gen, tag: 'genitiv' });
  }
  return forms;
}

// ---------- adjectives ----------

const ADJ_ENDINGS = ['e', 'er', 'es', 'en', 'em'] as const;

/** blau→blau-, dunkel→dunkl-, teuer→teur- (e-elision before endings). */
function adjStem(adj: string): string {
  if (/[^aeiouäöü]e[lr]$/.test(adj)) {
    return adj.slice(0, -2) + adj.slice(-1);
  }
  return adj;
}

function adjForms(lemma: string, a: AdjSpec): Form[] {
  if (a.indeclinable) return [];
  const forms: Form[] = [];
  const stem = adjStem(lemma);
  for (const end of ADJ_ENDINGS) {
    forms.push({ form: stem + end, tag: 'dekliniert' });
  }

  const comp = a.comparative ?? stem + 'er';
  forms.push({ form: comp, tag: 'komparativ' });
  for (const end of ['e', 'en', 'es', 'em'] as const) {
    forms.push({ form: comp + end, tag: 'komparativ' });
  }

  const sup =
    a.superlative ?? (/(d|t|s|ß|x|z)$/.test(lemma) ? lemma + 'est' : lemma + 'st');
  forms.push({ form: 'am ' + sup + 'en', tag: 'superlativ' });
  for (const end of ADJ_ENDINGS) {
    forms.push({ form: sup + end, tag: 'superlativ' });
  }
  return forms;
}
