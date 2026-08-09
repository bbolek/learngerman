/**
 * Builds assets/db/dictionary.db from scripts/data/vocab/*.json and
 * scripts/data/grammar-questions.json.
 *
 * Run: npm run build:db
 *
 * The output DB ships read-only inside the app bundle; user tables are
 * created at runtime by src/db/migrations.ts against the same file.
 */
import Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expandForms, type VocabEntry } from './inflect';

const ROOT = path.join(__dirname, '..');
const VOCAB_DIR = path.join(ROOT, 'scripts/data/vocab');
const GRAMMAR_DIR = path.join(ROOT, 'scripts/data/grammar');
const READING_DIR = path.join(ROOT, 'scripts/data/reading');
const PATH_DIR = path.join(ROOT, 'scripts/data/path');
const IMAGES_FILE = path.join(ROOT, 'scripts/data/images.json');
const SYNONYMS_FILE = path.join(ROOT, 'scripts/data/synonyms.json');
const NOTO_DIR = path.join(ROOT, 'scripts/data/images/noto');
const OUT_FILE = path.join(ROOT, 'assets/db/dictionary.db');
const META_FILE = path.join(ROOT, 'assets/db/content-meta.json');

const CONTENT_VERSION = 7;

const POS = new Set(['verb', 'noun', 'adj', 'adv', 'prep', 'pron', 'conj', 'num', 'other']);
/** Vocabulary and grammar span the full CEFR range; reading stays A1–B1. */
const VOCAB_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const GRAMMAR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const READING_LEVELS = ['A1', 'A2', 'B1'];
const QTYPES = new Set(['mc', 'fill', 'order', 'case_id']);
const EXAMPLE_TAGS = new Set([
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
]);

function normalize(input: string): string {
  return input.normalize('NFC').trim().toLowerCase();
}

function asciiFold(s: string): string {
  return s.replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss');
}

/** Plain fold for sloppy typing: ä→a, ö→o, ü→u, ß→s. */
function plainFold(s: string): string {
  return s.replaceAll('ä', 'a').replaceAll('ö', 'o').replaceAll('ü', 'u').replaceAll('ß', 's');
}

// ---------- load & validate vocab ----------

function loadVocab(): VocabEntry[] {
  const files = fs
    .readdirSync(VOCAB_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const entries: VocabEntry[] = [];
  const seen = new Map<string, string>(); // lemma|pos -> file
  const errors: string[] = [];

  for (const file of files) {
    const batch = JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), 'utf8'));
    if (!Array.isArray(batch)) {
      errors.push(`${file}: not an array`);
      continue;
    }
    batch.forEach((e: VocabEntry, i: number) => {
      const where = `${file}[${i}] ${e?.lemma ?? '?'}`;
      if (!e.lemma || typeof e.lemma !== 'string') return void errors.push(`${where}: missing lemma`);
      if (!POS.has(e.pos)) return void errors.push(`${where}: bad pos '${e.pos}'`);
      if (!VOCAB_LEVELS.has(e.level)) return void errors.push(`${where}: bad level '${e.level}'`);
      if (!Array.isArray(e.senses) || e.senses.length === 0)
        return void errors.push(`${where}: needs at least one sense`);
      for (const s of e.senses) {
        if (!s.en) return void errors.push(`${where}: sense missing 'en'`);
      }
      if (e.pos === 'noun') {
        if (!e.noun || !['m', 'f', 'n', 'pl'].includes(e.noun.gender))
          return void errors.push(`${where}: noun needs gender m|f|n|pl`);
      }
      if (e.pos === 'verb' && !e.verb)
        return void errors.push(`${where}: verb entry needs 'verb' block`);
      if (e.examples != null) {
        if (!Array.isArray(e.examples))
          return void errors.push(`${where}: examples must be an array`);
        for (const ex of e.examples) {
          if (!EXAMPLE_TAGS.has(ex.tag))
            return void errors.push(`${where}: bad example tag '${ex.tag}'`);
          if (!ex.de || !ex.en)
            return void errors.push(`${where}: example needs both 'de' and 'en'`);
        }
      }
      const key = `${e.lemma}|${e.pos}`;
      const dup = seen.get(key);
      if (dup) return void errors.push(`${where}: duplicate of entry in ${dup}`);
      seen.set(key, file);
      entries.push(e);
    });
  }

  if (errors.length) {
    console.error(`✗ vocab validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return entries;
}

// ---------- load & validate images ----------

interface ImageEntry {
  lemma: string;
  pos: string;
  /** Noto emoji shorthand — resolved to a vendored emoji_uXXXX.svg. */
  emoji?: string;
  /** Icon path within the source's vendor dir, e.g. "filled/devices/stethoscope". */
  icon?: string;
  /** Vendor dir under scripts/data/images/; defaults to 'noto' for emoji entries. */
  source?: string;
}

/** Known vendored icon sets (all permissively licensed, shipped inside the DB). */
const IMAGE_SOURCES = new Set(['noto', 'healthicons']);

/** Noto emoji asset name: codepoints joined by _, variation selectors dropped. */
function notoFileName(emoji: string): string {
  const cps = [...emoji]
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16));
  return `emoji_u${cps.join('_')}.svg`;
}

/**
 * scripts/data/images.json maps lemma+pos → emoji; the matching Noto SVG must
 * be vendored under scripts/data/images/noto/ (see AUTHORING.md). The SVG text
 * ships inside the DB (lemma_images) so the app renders it offline via SvgXml.
 */
function loadImages(vocab: VocabEntry[]): (ImageEntry & { svg: string; source: string })[] {
  if (!fs.existsSync(IMAGES_FILE)) return [];
  const entries = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf8')) as ImageEntry[];
  const known = new Set(vocab.map((e) => `${e.lemma}|${e.pos}`));
  const seen = new Set<string>();
  const errors: string[] = [];
  const out: (ImageEntry & { svg: string; source: string })[] = [];

  for (const img of entries) {
    const where = `images.json ${img?.lemma ?? '?'}`;
    if (!img.lemma || !img.pos || (!img.emoji && !img.icon)) {
      errors.push(`${where}: needs lemma/pos and emoji or icon`);
      continue;
    }
    if (img.emoji && img.icon) {
      errors.push(`${where}: give either emoji or icon, not both`);
      continue;
    }
    const source = img.source ?? (img.emoji ? 'noto' : undefined);
    if (!source || !IMAGE_SOURCES.has(source)) {
      errors.push(`${where}: unknown image source '${img.source}'`);
      continue;
    }
    const key = `${img.lemma}|${img.pos}`;
    if (seen.has(key)) errors.push(`${where}: duplicate mapping`);
    seen.add(key);
    if (!known.has(key)) errors.push(`${where}: no vocab entry for ${key}`);
    const file = img.emoji
      ? path.join(NOTO_DIR, notoFileName(img.emoji))
      : path.join(ROOT, 'scripts/data/images', source, `${img.icon}.svg`);
    if (!fs.existsSync(file)) {
      errors.push(`${where}: missing vendored SVG ${path.relative(ROOT, file)}`);
      continue;
    }
    out.push({ ...img, source, svg: fs.readFileSync(file, 'utf8').trim() });
  }

  if (errors.length) {
    console.error(`✗ image validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return out;
}

// ---------- load & validate synonyms ----------

interface SynonymRef {
  lemma: string;
  /** Only needed when the lemma exists under more than one pos. */
  pos?: string;
  /** Short German nuance hint ("formeller", "nur für Personen"). */
  note?: string;
}

interface SynonymEntry {
  lemma: string;
  pos: string;
  synonyms: SynonymRef[];
}

/** A resolved, directional synonym link between two lemma|pos keys. */
interface SynonymLink {
  fromKey: string;
  toKey: string;
  note: string | null;
}

/**
 * scripts/data/synonyms.json links dictionary entries to alternatives the
 * learner can use instead, with an optional short German note explaining the
 * nuance. Links are directional — author both directions when both entries
 * should show the connection (notes usually differ per direction).
 */
function loadSynonyms(vocab: VocabEntry[]): SynonymLink[] {
  if (!fs.existsSync(SYNONYMS_FILE)) return [];
  const entries = JSON.parse(fs.readFileSync(SYNONYMS_FILE, 'utf8')) as SynonymEntry[];
  const byKey = new Set(vocab.map((e) => `${e.lemma}|${e.pos}`));
  const posByLemma = new Map<string, string[]>();
  for (const e of vocab) {
    const list = posByLemma.get(e.lemma) ?? [];
    list.push(e.pos);
    posByLemma.set(e.lemma, list);
  }

  const errors: string[] = [];
  const seenHeads = new Set<string>();
  const links: SynonymLink[] = [];

  /** lemma (+optional pos) → unique lemma|pos key, or null with an error. */
  const resolve = (where: string, ref: { lemma: string; pos?: string }): string | null => {
    if (ref.pos) {
      const key = `${ref.lemma}|${ref.pos}`;
      if (!byKey.has(key)) {
        errors.push(`${where}: no vocab entry for ${key}`);
        return null;
      }
      return key;
    }
    const poses = posByLemma.get(ref.lemma) ?? [];
    if (poses.length === 0) {
      errors.push(`${where}: '${ref.lemma}' not in dictionary`);
      return null;
    }
    if (poses.length > 1) {
      errors.push(`${where}: '${ref.lemma}' is ambiguous (${poses.join(', ')}) — add "pos"`);
      return null;
    }
    return `${ref.lemma}|${poses[0]}`;
  };

  for (const entry of entries) {
    const where = `synonyms.json ${entry?.lemma ?? '?'}`;
    if (!entry.lemma || !entry.pos || !Array.isArray(entry.synonyms) || entry.synonyms.length === 0) {
      errors.push(`${where}: needs lemma, pos and a non-empty synonyms array`);
      continue;
    }
    const fromKey = resolve(where, { lemma: entry.lemma, pos: entry.pos });
    if (!fromKey) continue;
    if (seenHeads.has(fromKey)) errors.push(`${where}: duplicate entry for ${fromKey}`);
    seenHeads.add(fromKey);

    const seenRefs = new Set<string>();
    for (const ref of entry.synonyms) {
      if (!ref.lemma) {
        errors.push(`${where}: synonym ref missing lemma`);
        continue;
      }
      const toKey = resolve(`${where} → ${ref.lemma}`, ref);
      if (!toKey) continue;
      if (toKey === fromKey) {
        errors.push(`${where}: refers to itself`);
        continue;
      }
      if (seenRefs.has(toKey)) {
        errors.push(`${where}: duplicate synonym ${toKey}`);
        continue;
      }
      seenRefs.add(toKey);
      links.push({ fromKey, toKey, note: ref.note?.trim() || null });
    }
  }

  if (errors.length) {
    console.error(`✗ synonym validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return links;
}

// ---------- load & validate grammar ----------

interface GrammarTopic {
  slug: string;
  title: string;
  level: string;
  explainer_md: string;
  questions: {
    qtype: string;
    difficulty?: number;
    payload: Record<string, unknown>;
  }[];
}

function loadGrammar(): GrammarTopic[] {
  if (!fs.existsSync(GRAMMAR_DIR)) return [];
  const files = fs
    .readdirSync(GRAMMAR_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const topics: GrammarTopic[] = files.map(
    (f) => JSON.parse(fs.readFileSync(path.join(GRAMMAR_DIR, f), 'utf8')) as GrammarTopic
  );
  const errors: string[] = [];
  const slugs = new Set<string>();
  topics.forEach((t) => {
    if (!t.slug || slugs.has(t.slug)) errors.push(`topic ${t.slug}: missing/duplicate slug`);
    slugs.add(t.slug);
    if (!t.title || !t.explainer_md) errors.push(`topic ${t.slug}: missing title/explainer`);
    if (!GRAMMAR_LEVELS.has(t.level)) errors.push(`topic ${t.slug}: bad level '${t.level}'`);
    (t.questions ?? []).forEach((q, i) => {
      const where = `${t.slug}[${i}]`;
      if (!QTYPES.has(q.qtype)) return void errors.push(`${where}: bad qtype '${q.qtype}'`);
      const p = q.payload as any;
      if (q.qtype === 'mc') {
        if (!p.prompt || !Array.isArray(p.options) || typeof p.correctIndex !== 'number' || !p.explanation)
          errors.push(`${where}: mc needs prompt/options/correctIndex/explanation`);
        else if (p.correctIndex < 0 || p.correctIndex >= p.options.length)
          errors.push(`${where}: correctIndex out of range`);
      } else if (q.qtype === 'fill') {
        if (!p.prompt || !Array.isArray(p.accept) || p.accept.length === 0 || !p.explanation)
          errors.push(`${where}: fill needs prompt/accept/explanation`);
      } else if (q.qtype === 'order') {
        if (!Array.isArray(p.tokens) || !Array.isArray(p.solutions) || p.solutions.length === 0 || !p.explanation)
          errors.push(`${where}: order needs tokens/solutions/explanation`);
        else
          for (const sol of p.solutions) {
            const a = [...(sol as string[])].sort().join('');
            const b = [...(p.tokens as string[])].sort().join('');
            if (a !== b) errors.push(`${where}: solution tokens don't match token pool`);
          }
      } else if (q.qtype === 'case_id') {
        if (
          !p.sentence ||
          !['nominativ', 'akkusativ', 'dativ', 'genitiv'].includes(p.correctCase) ||
          !Array.isArray(p.reasons) ||
          typeof p.correctReasonIndex !== 'number' ||
          !p.explanation
        )
          errors.push(`${where}: case_id needs sentence/correctCase/reasons/correctReasonIndex/explanation`);
        else if (!(p.sentence as string).includes('**'))
          errors.push(`${where}: sentence must mark the noun phrase with **…**`);
      }
    });
  });
  if (errors.length) {
    console.error(`✗ grammar validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return topics;
}

// ---------- load & validate reading texts ----------

interface ReadingParagraph {
  de: string;
  en: string;
}

interface ReadingText {
  slug: string;
  title: string;
  level: string;
  /** One-line hook shown on the Leseecke list. */
  teaser: string;
  paragraphs: ReadingParagraph[];
}

/**
 * scripts/data/reading/*.json — one graded text per file for the Leseecke.
 * Sorted by level, then title, so the list screen reads easiest-first.
 */
function loadReading(): ReadingText[] {
  if (!fs.existsSync(READING_DIR)) return [];
  const files = fs
    .readdirSync(READING_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const texts = files.map(
    (f) => JSON.parse(fs.readFileSync(path.join(READING_DIR, f), 'utf8')) as ReadingText
  );
  const errors: string[] = [];
  const slugs = new Set<string>();
  for (const t of texts) {
    const where = `reading ${t?.slug ?? '?'}`;
    if (!t.slug || !/^[a-z0-9-]+$/.test(t.slug)) errors.push(`${where}: bad slug`);
    if (slugs.has(t.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(t.slug);
    if (!t.title || !t.teaser) errors.push(`${where}: missing title/teaser`);
    if (!READING_LEVELS.includes(t.level)) errors.push(`${where}: bad level '${t.level}'`);
    if (!Array.isArray(t.paragraphs) || t.paragraphs.length === 0) {
      errors.push(`${where}: needs at least one paragraph`);
      continue;
    }
    for (const p of t.paragraphs) {
      if (!p.de || !p.en) errors.push(`${where}: paragraph needs both 'de' and 'en'`);
    }
  }
  if (errors.length) {
    console.error(`✗ reading validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return texts.sort(
    (a, b) =>
      READING_LEVELS.indexOf(a.level) - READING_LEVELS.indexOf(b.level) ||
      a.title.localeCompare(b.title, 'de')
  );
}

/** German words in a text, for the "≈ 120 Wörter" badge. */
function readingWordCount(t: ReadingText): number {
  return t.paragraphs.reduce((sum, p) => sum + p.de.trim().split(/\s+/).length, 0);
}

// ---------- load & validate learning path ----------

interface PathWordRef {
  lemma: string;
  pos: string;
}

interface PathGrammarRef {
  /** grammar_topics.slug */
  topic: string;
  /** Questions drawn from this topic per lesson session. */
  questions: number;
}

interface PathLessonDef {
  slug: string;
  kind: 'lesson' | 'review';
  title: string;
  words?: PathWordRef[];
  grammar?: PathGrammarRef[];
}

interface PathUnit {
  slug: string;
  title: string;
  emoji: string;
  level: string;
  lessons: PathLessonDef[];
}

/** CEFR order for the path — lexicographic sorting breaks past B1. */
const LEVEL_RANK: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

const PATH_WORDS_MIN = 4;
const PATH_WORDS_MAX = 10;
const PATH_NODES_MIN = 3;
const PATH_NODES_MAX = 6;

/**
 * scripts/data/path/*.json — one Lernpfad unit per file, numeric filename
 * prefix = sort order (grammar-topic convention). Slugs are stable natural
 * keys: user progress (path_progress) references lesson slugs, so renaming
 * one orphans progress. Never rename, only add.
 */
function loadPath(): PathUnit[] {
  if (!fs.existsSync(PATH_DIR)) return [];
  const files = fs
    .readdirSync(PATH_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const units = files.map(
    (f) => JSON.parse(fs.readFileSync(path.join(PATH_DIR, f), 'utf8')) as PathUnit
  );
  const errors: string[] = [];
  const slugs = new Set<string>();
  let prevRank = 0;
  for (const u of units) {
    const where = `path ${u?.slug ?? '?'}`;
    if (!u.slug || !/^[a-z0-9-]+$/.test(u.slug)) errors.push(`${where}: bad slug`);
    if (slugs.has(u.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(u.slug);
    if (!u.title || !u.emoji) errors.push(`${where}: missing title/emoji`);
    const rank = LEVEL_RANK[u.level];
    if (rank == null) errors.push(`${where}: bad level '${u.level}'`);
    else if (rank < prevRank) errors.push(`${where}: level ${u.level} out of order (units must run A1→C2)`);
    else prevRank = rank;
    if (!Array.isArray(u.lessons) || u.lessons.length < PATH_NODES_MIN || u.lessons.length > PATH_NODES_MAX) {
      errors.push(`${where}: needs ${PATH_NODES_MIN}–${PATH_NODES_MAX} lessons`);
      continue;
    }
    u.lessons.forEach((l, i) => {
      const lwhere = `${where} › ${l?.slug ?? `[${i}]`}`;
      if (!l.slug || !/^[a-z0-9-]+$/.test(l.slug)) errors.push(`${lwhere}: bad slug`);
      if (slugs.has(l.slug)) errors.push(`${lwhere}: duplicate slug`);
      slugs.add(l.slug);
      if (!l.title) errors.push(`${lwhere}: missing title`);
      if (l.kind !== 'lesson' && l.kind !== 'review')
        return void errors.push(`${lwhere}: kind must be 'lesson' or 'review'`);
      if (l.kind === 'review') {
        if (l.words?.length || l.grammar?.length)
          errors.push(`${lwhere}: review nodes carry no words/grammar — their session is computed`);
        return;
      }
      if (!Array.isArray(l.words) || l.words.length < PATH_WORDS_MIN || l.words.length > PATH_WORDS_MAX)
        errors.push(`${lwhere}: needs ${PATH_WORDS_MIN}–${PATH_WORDS_MAX} words`);
      for (const g of l.grammar ?? []) {
        if (!g.topic) errors.push(`${lwhere}: grammar ref missing topic slug`);
        if (typeof g.questions !== 'number' || g.questions < 1 || g.questions > 8)
          errors.push(`${lwhere}: grammar '${g.topic}' questions must be 1–8`);
      }
    });
    const last = u.lessons[u.lessons.length - 1];
    if (last && last.kind !== 'review')
      errors.push(`${where}: last lesson must be kind 'review' (the unit's repetition node)`);
  }
  if (errors.length) {
    console.error(`✗ path validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return units;
}

/** Every path word must resolve in the dictionary (once, path-wide), every grammar ref to a topic. */
function validatePathRefs(units: PathUnit[], vocab: VocabEntry[], grammar: GrammarTopic[]) {
  const known = new Set(vocab.map((e) => `${e.lemma}|${e.pos}`));
  const topics = new Set(grammar.map((t) => t.slug));
  const errors: string[] = [];
  const taught = new Map<string, string>(); // lemma|pos -> lesson slug
  const topicUsed = new Map<string, string>(); // topic slug -> lesson slug
  for (const u of units) {
    for (const l of u.lessons) {
      for (const w of l.words ?? []) {
        const key = `${w.lemma}|${w.pos}`;
        if (!known.has(key)) errors.push(`${l.slug}: word '${key}' not in dictionary`);
        const dup = taught.get(key);
        if (dup) errors.push(`${l.slug}: word '${key}' already taught in ${dup}`);
        else taught.set(key, l.slug);
      }
      for (const g of l.grammar ?? []) {
        if (!topics.has(g.topic)) errors.push(`${l.slug}: grammar topic '${g.topic}' not found`);
        const dup = topicUsed.get(g.topic);
        if (dup) errors.push(`${l.slug}: grammar topic '${g.topic}' already covered in ${dup}`);
        else topicUsed.set(g.topic, l.slug);
      }
    }
  }
  if (errors.length) {
    console.error(`✗ path reference validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
}

// ---------- vocab markers in explainers & question explanations ----------

/** All texts of a topic that may contain [[vocab]] markers. */
function markerTexts(t: GrammarTopic): string[] {
  return [
    t.explainer_md,
    ...(t.questions ?? []).map((q) => String((q.payload as any)?.explanation ?? '')),
  ];
}

/** Distinct dictionary lookups a topic's markers introduce ("vocab_count"). */
function topicVocab(t: GrammarTopic): Set<string> {
  const words = new Set<string>();
  for (const text of markerTexts(t)) {
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const parts = m[1].split('|');
      words.add(normalize(parts[parts.length - 1]));
    }
  }
  return words;
}

/**
 * Every [[word]] marker (explainer or question explanation) must resolve in
 * the dictionary as a lemma or an inflected form — the app renders these as
 * tappable vocabulary links backed by lookupGerman().
 */
function validateVocabMarkers(topics: GrammarTopic[], vocab: VocabEntry[]) {
  const known = new Set<string>();
  for (const e of vocab) {
    known.add(normalize(e.lemma));
    for (const f of expandForms(e)) known.add(normalize(f.form));
  }
  const errors: string[] = [];
  for (const t of topics) {
    for (const text of markerTexts(t)) {
      for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        // [[Wort]] or [[display|lookup]] — the lookup part must resolve
        const parts = m[1].split('|');
        const lookup = parts[parts.length - 1];
        if (parts.length > 2 || parts.some((p) => !p.trim()))
          errors.push(`${t.slug}: malformed vocab marker [[${m[1]}]]`);
        else if (!known.has(normalize(lookup)))
          errors.push(`${t.slug}: vocab marker [[${m[1]}]] not found in dictionary`);
      }
      const stripped = text.replace(/\[\[[^\]]+\]\]/g, '');
      if (stripped.includes('[[') || stripped.includes(']]'))
        errors.push(`${t.slug}: unbalanced [[ ]] marker in "${stripped.slice(0, 40)}…"`);
    }
  }
  if (errors.length) {
    console.error(`✗ vocab marker validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
}

// ---------- build ----------

function build() {
  const vocab = loadVocab();
  const grammar = loadGrammar();
  const images = loadImages(vocab);
  const synonyms = loadSynonyms(vocab);
  const reading = loadReading();
  const pathUnits = loadPath();
  validateVocabMarkers(grammar, vocab);
  validatePathRefs(pathUnits, vocab, grammar);

  // Fingerprint of everything that ends up in the DB. The app compares this
  // against the hash stored in the installed DB and applies an in-place
  // content update when they differ (src/logic/contentUpdate.ts).
  const contentHash = crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        contentVersion: CONTENT_VERSION,
        vocab,
        grammar,
        images,
        synonyms,
        reading,
        path: pathUnits,
      })
    )
    .digest('hex');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.rmSync(OUT_FILE, { force: true });
  const db = new Database(OUT_FILE);
  db.pragma('journal_mode = MEMORY');

  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE lemmas (
      id INTEGER PRIMARY KEY,
      lemma TEXT NOT NULL,
      lemma_norm TEXT NOT NULL,
      lemma_fold TEXT NOT NULL,
      lemma_plain TEXT NOT NULL,
      pos TEXT NOT NULL,
      gender TEXT,
      plural TEXT,
      verb_aux TEXT,
      verb_partizip2 TEXT,
      verb_praeteritum TEXT,
      level TEXT NOT NULL,
      freq_rank INTEGER
    );
    CREATE INDEX idx_lemmas_norm ON lemmas(lemma_norm);
    CREATE INDEX idx_lemmas_fold ON lemmas(lemma_fold);
    CREATE INDEX idx_lemmas_plain ON lemmas(lemma_plain);

    CREATE TABLE forms (
      id INTEGER PRIMARY KEY,
      lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      form TEXT NOT NULL,
      form_norm TEXT NOT NULL,
      form_fold TEXT NOT NULL,
      form_plain TEXT NOT NULL,
      tag TEXT NOT NULL
    );
    CREATE INDEX idx_forms_norm ON forms(form_norm);
    CREATE INDEX idx_forms_fold ON forms(form_fold);
    CREATE INDEX idx_forms_plain ON forms(form_plain);

    CREATE TABLE senses (
      id INTEGER PRIMARY KEY,
      lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      sense_order INTEGER NOT NULL,
      en TEXT NOT NULL,
      en_norm TEXT NOT NULL,
      example_de TEXT,
      example_en TEXT,
      note TEXT
    );
    CREATE INDEX idx_senses_en ON senses(en_norm);
    CREATE VIRTUAL TABLE senses_fts USING fts5(en, content='senses', content_rowid='id');

    CREATE TABLE examples (
      id INTEGER PRIMARY KEY,
      lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      tag TEXT NOT NULL,
      de TEXT NOT NULL,
      en TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE INDEX idx_examples_lemma ON examples(lemma_id);

    CREATE TABLE grammar_topics (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
      explainer_md TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      vocab_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE grammar_questions (
      id INTEGER PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES grammar_topics(id),
      qtype TEXT NOT NULL CHECK (qtype IN ('mc','fill','order','case_id')),
      payload TEXT NOT NULL,
      difficulty INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX idx_gq_topic ON grammar_questions(topic_id);

    CREATE TABLE lemma_images (
      lemma_id INTEGER PRIMARY KEY REFERENCES lemmas(id),
      svg TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE synonyms (
      id INTEGER PRIMARY KEY,
      lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      syn_lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      note TEXT,
      sort_order INTEGER NOT NULL
    );
    CREATE INDEX idx_synonyms_lemma ON synonyms(lemma_id);

    CREATE TABLE reading_texts (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1')),
      teaser TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE reading_paragraphs (
      id INTEGER PRIMARY KEY,
      text_id INTEGER NOT NULL REFERENCES reading_texts(id),
      sort_order INTEGER NOT NULL,
      de TEXT NOT NULL,
      en TEXT NOT NULL
    );
    CREATE INDEX idx_reading_paragraphs_text ON reading_paragraphs(text_id);

    CREATE TABLE path_units (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      emoji TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE path_lessons (
      id INTEGER PRIMARY KEY,
      unit_id INTEGER NOT NULL REFERENCES path_units(id),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('lesson','review')),
      sort_order INTEGER NOT NULL
    );
    CREATE INDEX idx_path_lessons_unit ON path_lessons(unit_id);

    CREATE TABLE path_lesson_words (
      lesson_id INTEGER NOT NULL REFERENCES path_lessons(id),
      lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (lesson_id, lemma_id)
    );

    CREATE TABLE path_lesson_topics (
      lesson_id INTEGER NOT NULL REFERENCES path_lessons(id),
      topic_id INTEGER NOT NULL REFERENCES grammar_topics(id),
      question_count INTEGER NOT NULL DEFAULT 4,
      PRIMARY KEY (lesson_id, topic_id)
    );
  `);

  const insLemma = db.prepare(`
    INSERT INTO lemmas (lemma, lemma_norm, lemma_fold, lemma_plain, pos, gender, plural, verb_aux,
      verb_partizip2, verb_praeteritum, level, freq_rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insForm = db.prepare(
    'INSERT INTO forms (lemma_id, form, form_norm, form_fold, form_plain, tag) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insSense = db.prepare(`
    INSERT INTO senses (lemma_id, sense_order, en, en_norm, example_de, example_en, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insExample = db.prepare(
    'INSERT INTO examples (lemma_id, tag, de, en, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  const insImage = db.prepare('INSERT INTO lemma_images (lemma_id, svg, source) VALUES (?, ?, ?)');
  const insSynonym = db.prepare(
    'INSERT INTO synonyms (lemma_id, syn_lemma_id, note, sort_order) VALUES (?, ?, ?, ?)'
  );

  let formCount = 0;
  let exampleCount = 0;
  const lemmaIds = new Map<string, number>(); // lemma|pos -> id (for images)
  const insertAll = db.transaction(() => {
    for (const e of vocab) {
      const norm = normalize(e.lemma);
      const info = insLemma.run(
        e.lemma,
        norm,
        asciiFold(norm),
        plainFold(norm),
        e.pos,
        e.noun?.gender ?? null,
        e.noun ? (e.noun.plural === null ? null : formatPlural(e.noun.plural)) : null,
        e.verb?.aux ?? null,
        e.verb?.partizip2 ?? null,
        e.verb?.praeteritum ?? null,
        e.level,
        e.freq ?? null
      );
      const lemmaId = info.lastInsertRowid as number;
      lemmaIds.set(`${e.lemma}|${e.pos}`, lemmaId);

      const forms = expandForms(e);
      const seenForms = new Set<string>();
      for (const f of forms) {
        const fnorm = normalize(f.form);
        if (fnorm === norm) continue; // lemma itself matches via lemmas table
        const key = fnorm + '' + f.tag;
        if (seenForms.has(key)) continue;
        seenForms.add(key);
        insForm.run(lemmaId, f.form, fnorm, asciiFold(fnorm), plainFold(fnorm), f.tag);
        formCount++;
      }

      e.senses.forEach((s, i) => {
        insSense.run(
          lemmaId,
          i + 1,
          s.en,
          normalize(s.en),
          s.example_de ?? null,
          s.example_en ?? null,
          s.note ?? null
        );
      });

      (e.examples ?? []).forEach((ex, i) => {
        insExample.run(lemmaId, ex.tag, ex.de, ex.en, i + 1);
        exampleCount++;
      });
    }

    for (const img of images) {
      insImage.run(lemmaIds.get(`${img.lemma}|${img.pos}`)!, img.svg, img.source);
    }

    const orderPerHead = new Map<string, number>();
    for (const syn of synonyms) {
      const order = (orderPerHead.get(syn.fromKey) ?? 0) + 1;
      orderPerHead.set(syn.fromKey, order);
      insSynonym.run(lemmaIds.get(syn.fromKey)!, lemmaIds.get(syn.toKey)!, syn.note, order);
    }

    const insReadingText = db.prepare(
      'INSERT INTO reading_texts (slug, title, level, teaser, word_count, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insReadingPara = db.prepare(
      'INSERT INTO reading_paragraphs (text_id, sort_order, de, en) VALUES (?, ?, ?, ?)'
    );
    reading.forEach((t, ti) => {
      const info = insReadingText.run(t.slug, t.title, t.level, t.teaser, readingWordCount(t), ti + 1);
      const textId = info.lastInsertRowid as number;
      t.paragraphs.forEach((p, pi) => {
        insReadingPara.run(textId, pi + 1, p.de, p.en);
      });
    });

    const topicIds = new Map<string, number>(); // slug -> id (for path refs)
    grammar.forEach((t, ti) => {
      const info = db
        .prepare(
          'INSERT INTO grammar_topics (slug, title, level, explainer_md, sort_order, vocab_count) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(t.slug, t.title, t.level, t.explainer_md, ti + 1, topicVocab(t).size);
      const topicId = info.lastInsertRowid as number;
      topicIds.set(t.slug, topicId);
      const insQ = db.prepare(
        'INSERT INTO grammar_questions (topic_id, qtype, payload, difficulty) VALUES (?, ?, ?, ?)'
      );
      for (const q of t.questions ?? []) {
        insQ.run(topicId, q.qtype, JSON.stringify(q.payload), q.difficulty ?? 1);
      }
    });

    const insPathUnit = db.prepare(
      'INSERT INTO path_units (slug, title, emoji, level, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    const insPathLesson = db.prepare(
      'INSERT INTO path_lessons (unit_id, slug, title, kind, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    const insPathWord = db.prepare(
      'INSERT INTO path_lesson_words (lesson_id, lemma_id, sort_order) VALUES (?, ?, ?)'
    );
    const insPathTopic = db.prepare(
      'INSERT INTO path_lesson_topics (lesson_id, topic_id, question_count) VALUES (?, ?, ?)'
    );
    pathUnits.forEach((u, ui) => {
      const unitId = insPathUnit.run(u.slug, u.title, u.emoji, u.level, ui + 1)
        .lastInsertRowid as number;
      u.lessons.forEach((l, li) => {
        const lessonId = insPathLesson.run(unitId, l.slug, l.title, l.kind, li + 1)
          .lastInsertRowid as number;
        (l.words ?? []).forEach((w, wi) => {
          insPathWord.run(lessonId, lemmaIds.get(`${w.lemma}|${w.pos}`)!, wi + 1);
        });
        for (const g of l.grammar ?? []) {
          insPathTopic.run(lessonId, topicIds.get(g.topic)!, g.questions);
        }
      });
    });

    db.exec("INSERT INTO senses_fts(senses_fts) VALUES('rebuild')");
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
      'content_version',
      String(CONTENT_VERSION)
    );
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('content_hash', contentHash);
  });
  insertAll();

  const lemmaCount = (db.prepare('SELECT COUNT(*) c FROM lemmas').get() as any).c;
  const senseCount = (db.prepare('SELECT COUNT(*) c FROM senses').get() as any).c;
  const qCount = (db.prepare('SELECT COUNT(*) c FROM grammar_questions').get() as any).c;
  const pathLessonCount = (db.prepare('SELECT COUNT(*) c FROM path_lessons').get() as any).c;
  db.exec('VACUUM');
  db.close();

  fs.writeFileSync(
    META_FILE,
    JSON.stringify({ version: CONTENT_VERSION, hash: contentHash }, null, 2) + '\n'
  );

  const sizeKb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(
    `✓ dictionary.db built: ${lemmaCount} lemmas, ${formCount} forms, ${senseCount} senses, ` +
      `${exampleCount} examples, ${images.length} images, ${synonyms.length} synonyms, ` +
      `${grammar.length} topics, ${qCount} questions, ${reading.length} reading texts, ` +
      `${pathUnits.length} path units (${pathLessonCount} lessons) — ` +
      `${sizeKb} KB (content ${contentHash.slice(0, 8)})`
  );
}

/** "Häuser" → "die Häuser" for display; keeps explicit dashes ("–") as-is. */
function formatPlural(plural: string): string {
  if (!plural || plural === '–' || plural === '-') return '–';
  return plural.startsWith('die ') ? plural : `die ${plural}`;
}

build();
