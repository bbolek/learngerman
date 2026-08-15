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

export interface FormExample {
  /** Which form/tense the sentence demonstrates (validated tag set). */
  tag: string;
  de: string;
  en: string;
}

export interface VocabEntry {
  lemma: string;
  pos:
    | 'verb' | 'noun' | 'adj' | 'adv' | 'prep' | 'pron' | 'det' | 'conj' | 'num' | 'name' | 'other';
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  freq?: number;
  verb?: VerbSpec;
  noun?: NounSpec;
  adj?: AdjSpec;
  senses: Sense[];
  /** Extra examples per tense/form, shown on the word-detail screen. */
  examples?: FormExample[];
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
    // Pronouns, articles and determiners all draw on the same closed-class
    // tables; 'other' is included because a few function words (kein) were
    // authored under it before 'det' existed.
    case 'pron':
    case 'det':
    case 'adv':
    case 'other':
      return functionWordForms(e.lemma);
    case 'prep':
      return prepForms(e.lemma);
    case 'num':
      return numForms(e.lemma);
    case 'name':
      return nameForms(e.lemma);
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

/** Stems like arbeit-, öffn-, atm- need an e before -st/-t. Doubled consonants
 * (komm-, stimm-, renn-) don't, so m/n count as "easy" precedents too. */
function needsE(stem: string): boolean {
  if (/[dt]$/.test(stem)) return true;
  // rechn- and zeichn- need the e, wohn- and lern- do not: what matters is
  // whether a consonant precedes the h/l/r, not the h/l/r itself.
  if (/[^aeiouäöü][hlr][mn]$/.test(stem)) return true;
  return /[^aeiouäöülrhmn][mn]$/.test(stem);
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

  /** machend, tuend, seiend — the base of every participial adjective. */
  const partizip1 = /(en|ln|rn)$/.test(base) ? base + 'd' : stem + 'end';

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

  // Verbs that shift e→i keep the shift in the imperative and drop the ending
  // (du siehst → sieh!, du gibst → gib!). Umlauting verbs do not (du fährst →
  // fahr!), so the shift has to be visible in the vowel itself.
  const duStem = (v.du ?? praesens.du).replace(/e?st$/, '');
  if (/e/.test(stem) && /i/.test(duStem) && duStem !== stem) {
    forms.push({ form: join(duStem), tag: 'imperativ_du' });
  }

  // Participles also work as adjectives (die erstarrende Luft, das zugesagte
  // Geld). Only the bare forms are indexed — lookupGerman strips the adjective
  // ending, which keeps ~28k declined participles out of the shipped DB.
  forms.push({ form: join(partizip1), tag: 'partizip1' });

  // Separable verbs wrap the zu inside the word: zurücklassen → zurückzulassen.
  if (prefix) forms.push({ form: `${prefix}zu${base}`, tag: 'zu_infinitiv' });

  // Konjunktiv I (indirect speech) only shows up in the 3rd person singular;
  // for weak verbs it is spelled like "ich mache" and adds nothing.
  for (const f of KONJUNKTIV1[base] ?? [stem + 'e']) {
    if (!Object.values(praesens).includes(f)) forms.push({ form: join(f), tag: 'konjunktiv1' });
  }

  for (const [form, tag] of EXTRA_FORMS[base] ?? []) forms.push({ form: join(form), tag });

  const k2 = konjunktiv2(base, praet3);
  if (k2) {
    for (const end of ['', 'st', 'n', 't'] as const) {
      forms.push({ form: join(k2 + end), tag: 'konjunktiv2' });
    }
    // Spoken short forms of sein ("wärst du hier") are common enough to index.
    if (base === 'sein') {
      forms.push({ form: join('wärst'), tag: 'konjunktiv2' });
      forms.push({ form: join('wärt'), tag: 'konjunktiv2' });
    }
  }
  return forms;
}

/** Konjunktiv I of sein is suppletive; every other verb takes stem + e. */
const KONJUNKTIV1: Record<string, string[]> = { sein: ['sei', 'seien', 'seiest'] };

/** Forms that fall outside every paradigm. */
const EXTRA_FORMS: Record<string, [string, string][]> = {
  // Passive perfect drops the ge-: "es ist gemacht worden".
  werden: [['worden', 'partizip2']],
};

/** Konjunktiv II forms that no rule produces (modals, mixed verbs, wissen). */
const KONJUNKTIV2: Record<string, string> = {
  haben: 'hätte',
  sein: 'wäre',
  werden: 'würde',
  können: 'könnte',
  müssen: 'müsste',
  dürfen: 'dürfte',
  mögen: 'möchte',
  sollen: 'sollte',
  wollen: 'wollte',
  wissen: 'wüsste',
  bringen: 'brächte',
  denken: 'dächte',
  stehen: 'stünde',
  sterben: 'stürbe',
  helfen: 'hülfe',
  werfen: 'würfe',
  beginnen: 'begänne',
  gewinnen: 'gewänne',
};

/**
 * Konjunktiv II stem: the Präteritum with an umlaut on its stem vowel
 * (kam → käme, zog → zöge). Weak verbs are spelled exactly like the
 * Präteritum, so they add nothing to the index and return null.
 */
function konjunktiv2(base: string, praet3: string): string | null {
  const fixed = KONJUNKTIV2[base];
  if (fixed) return fixed;
  if (praet3.endsWith('te')) return null;

  let stem = praet3;
  if (/au/.test(stem)) stem = stem.replace('au', 'äu');
  else if (/[aou]/.test(stem)) stem = stem.replace(/[aou]/, (v) => ({ a: 'ä', o: 'ö', u: 'ü' })[v]!);
  return stem.endsWith('e') ? stem : stem + 'e';
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
    if (takesDativeE(lemma)) forms.push({ form: lemma + 'e', tag: 'dativ' });
  }
  return forms;
}

/**
 * The dative -e (dem Kinde, im Jahre, zu Hause) survives on one-syllable
 * masculine and neuter nouns. Longer nouns and any that already end in a
 * vowel never take it.
 */
function takesDativeE(lemma: string): boolean {
  if (!/[^aeiouäöü]$/i.test(lemma)) return false;
  const vowels = lemma.toLowerCase().match(/[aeiouäöüy]+/g) ?? [];
  return vowels.length === 1;
}

// ---------- adjectives ----------

const ADJ_ENDINGS = ['e', 'er', 'es', 'en', 'em'] as const;

/**
 * Adjectives whose citation form already carries the weak -e (leise, müde,
 * nächste) decline off the bare stem: leis-er, müd-es, nächst-en. This is also
 * the base the superlative is built on (teuer → teuerst, dunkel → dunkelst).
 */
function baseStem(adj: string): string {
  return adj.endsWith('e') ? adj.slice(0, -1) : adj;
}

/** Vowel groups ≈ syllables: "schwer" has one, "sauber" two. */
function syllables(word: string): number {
  return (word.toLowerCase().match(/[aeiouäöüy]+/g) ?? []).length;
}

/**
 * Stem before an adjective ending: blau→blau-, dunkel→dunkl-, teuer→teur-.
 * The final -e of -el/-er drops only where it is a schwa, which needs a
 * syllable in front of it: "sauber" elides to saubr-, "schwer" never does.
 * Elision is the standard spelling after a diphthong (teuer → teure), and an
 * attested variant elsewhere (saubere/saubre) — adjStemVariant indexes those.
 */
function adjStem(adj: string): string {
  const base = baseStem(adj);
  if (syllables(base) < 2) return base;
  if (base.endsWith('el')) return base.slice(0, -2) + 'l';
  if (/(au|eu)er$/.test(base) || base === 'integer') return base.slice(0, -2) + 'r';
  return base;
}

/** The second attested spelling of an -er adjective, or null when there is none. */
function adjStemVariant(adj: string): string | null {
  const base = baseStem(adj);
  if (!base.endsWith('er') || syllables(base) < 2) return null;
  const elided = base.slice(0, -2) + 'r';
  return adjStem(adj) === elided ? base : elided;
}

function adjForms(lemma: string, a: AdjSpec): Form[] {
  if (a.indeclinable) return [];
  const forms: Form[] = [];
  const stem = adjStem(lemma);
  for (const end of ADJ_ENDINGS) {
    forms.push({ form: stem + end, tag: 'dekliniert' });
  }
  const variant = adjStemVariant(lemma);
  if (variant) {
    for (const end of ADJ_ENDINGS) forms.push({ form: variant + end, tag: 'dekliniert' });
  }

  const comp = a.comparative ?? stem + 'er';
  forms.push({ form: comp, tag: 'komparativ' });
  for (const end of ['e', 'en', 'es', 'em'] as const) {
    forms.push({ form: comp + end, tag: 'komparativ' });
  }

  // "nächst", "meist" and friends are superlatives already — adding another
  // -st would only produce forms nobody types.
  const supStem = baseStem(lemma);
  if (!a.superlative && /st$/.test(supStem)) return forms;

  const sup =
    a.superlative ?? (/(d|t|s|ß|x|z|sch)$/.test(supStem) ? supStem + 'est' : supStem + 'st');
  forms.push({ form: 'am ' + sup + 'en', tag: 'superlativ' });
  for (const end of ADJ_ENDINGS) {
    forms.push({ form: sup + end, tag: 'superlativ' });
  }
  return forms;
}

// ---------- pronouns, articles & determiners ----------

/** Endings of the der/dieser paradigm (the bare stem is never a word). */
const DER_ENDINGS = ['e', 'en', 'em', 'er', 'es'] as const;
/** Endings of the ein/mein paradigm — the bare stem is a form of its own. */
const EIN_ENDINGS = ['', 'e', 'en', 'em', 'er', 'es'] as const;

/** Suppletive case forms: nothing here can be derived from the lemma. */
const CASE_FORMS: Record<string, [string, string][]> = {
  ich: [
    ['mich', 'akkusativ'],
    ['mir', 'dativ'],
    ['meiner', 'genitiv'],
  ],
  du: [
    ['dich', 'akkusativ'],
    ['dir', 'dativ'],
    ['deiner', 'genitiv'],
  ],
  er: [
    ['ihn', 'akkusativ'],
    ['ihm', 'dativ'],
    ['seiner', 'genitiv'],
  ],
  es: [
    ['ihm', 'dativ'],
    ['seiner', 'genitiv'],
  ],
  sie: [
    ['ihr', 'dativ'],
    ['ihnen', 'dativ'],
    ['ihrer', 'genitiv'],
  ],
  wir: [
    ['uns', 'akkusativ'],
    ['uns', 'dativ'],
    ['unser', 'genitiv'],
  ],
  ihr: [
    ['euch', 'akkusativ'],
    ['euch', 'dativ'],
    ['euer', 'genitiv'],
  ],
  man: [
    ['einen', 'akkusativ'],
    ['einem', 'dativ'],
  ],
  wer: [
    ['wen', 'akkusativ'],
    ['wem', 'dativ'],
    ['wessen', 'genitiv'],
  ],
  was: [['wessen', 'genitiv']],
  jemand: [
    ['jemanden', 'akkusativ'],
    ['jemandem', 'dativ'],
    ['jemandes', 'genitiv'],
  ],
  niemand: [
    ['niemanden', 'akkusativ'],
    ['niemandem', 'dativ'],
    ['niemandes', 'genitiv'],
  ],
  derselbe: [
    ['dieselbe', 'dekliniert'],
    ['dasselbe', 'dekliniert'],
    ['denselben', 'dekliniert'],
    ['demselben', 'dekliniert'],
    ['desselben', 'dekliniert'],
    ['derselben', 'dekliniert'],
    ['dieselben', 'dekliniert'],
    ['denselben', 'dekliniert'],
  ],
  der: [
    ['die', 'dekliniert'],
    ['das', 'dekliniert'],
    ['den', 'dekliniert'],
    ['dem', 'dekliniert'],
    ['des', 'dekliniert'],
    ['denen', 'dekliniert'],
    ['dessen', 'genitiv'],
    ['deren', 'genitiv'],
    ['derer', 'genitiv'],
  ],
};

/** Determiners declined like "dieser": lemma → stem. */
const DER_WORDS: Record<string, string> = {
  dieser: 'dies',
  jener: 'jen',
  mancher: 'manch',
  solcher: 'solch',
  welcher: 'welch',
  jeder: 'jed',
  alle: 'all',
  beide: 'beid',
  einige: 'einig',
  selb: 'selb',
  mehrere: 'mehrer',
  andere: 'ander',
  // Adverbs that still take adjective endings before a noun.
  viel: 'viel',
  wenig: 'wenig',
  ganz: 'ganz',
};

/** Determiners declined like "ein" (euer elides its second e: eure). */
const EIN_WORDS: Record<string, string> = {
  ein: 'ein',
  kein: 'kein',
  mein: 'mein',
  dein: 'dein',
  ihr: 'ihr',
  unser: 'unser',
  euer: 'eur',
};

/**
 * Possessives with no lemma of their own — "sein" would collide with the verb
 * and "unser" is rarely looked up alone, so both hang off their personal
 * pronoun ("seine → Possessivform von er").
 */
const POSSESSIVE_OF: Record<string, string> = { er: 'sein', es: 'sein', wir: 'unser' };

function functionWordForms(lemma: string): Form[] {
  const forms: Form[] = [];
  for (const [form, tag] of CASE_FORMS[lemma] ?? []) forms.push({ form, tag });

  const derStem = DER_WORDS[lemma];
  if (derStem) {
    for (const end of DER_ENDINGS) forms.push({ form: derStem + end, tag: 'dekliniert' });
  }

  const einStem = EIN_WORDS[lemma];
  if (einStem) {
    for (const end of EIN_ENDINGS) forms.push({ form: einStem + end, tag: 'dekliniert' });
  }

  const poss = POSSESSIVE_OF[lemma];
  if (poss) {
    for (const end of EIN_ENDINGS) forms.push({ form: poss + end, tag: 'possessiv' });
  }
  return forms;
}

// ---------- prepositions ----------

/** Preposition + article contractions, indexed under the preposition. */
const CONTRACTIONS: Record<string, string[]> = {
  in: ['im', 'ins'],
  an: ['am', 'ans'],
  auf: ['aufs'],
  bei: ['beim'],
  durch: ['durchs'],
  für: ['fürs'],
  hinter: ['hinters'],
  über: ['übers'],
  um: ['ums'],
  unter: ['unters'],
  von: ['vom'],
  vor: ['vors'],
  zu: ['zum', 'zur'],
};

function prepForms(lemma: string): Form[] {
  return (CONTRACTIONS[lemma] ?? []).map((form) => ({ form, tag: 'kontraktion' }));
}

// ---------- proper names ----------

/** Names only inflect in the genitive: Ninas Buch, Hans' Buch. */
function nameForms(lemma: string): Form[] {
  if (/(s|ß|x|z)$/.test(lemma)) return [{ form: lemma + "'", tag: 'genitiv' }];
  return [{ form: lemma + 's', tag: 'genitiv' }];
}

// ---------- numerals ----------

/** Ordinals (erste, zwanzigste) take adjective endings; cardinals do not. */
function numForms(lemma: string): Form[] {
  if (!/(te|ste)$/.test(lemma)) return functionWordForms(lemma);
  const stem = lemma.slice(0, -1);
  return DER_ENDINGS.map((end) => ({ form: stem + end, tag: 'dekliniert' }));
}
