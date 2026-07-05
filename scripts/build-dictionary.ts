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
const IMAGES_FILE = path.join(ROOT, 'scripts/data/images.json');
const NOTO_DIR = path.join(ROOT, 'scripts/data/images/noto');
const OUT_FILE = path.join(ROOT, 'assets/db/dictionary.db');
const META_FILE = path.join(ROOT, 'assets/db/content-meta.json');

const CONTENT_VERSION = 4;

const POS = new Set(['verb', 'noun', 'adj', 'adv', 'prep', 'pron', 'conj', 'num', 'other']);
/** Vocabulary spans the full CEFR range; grammar topics stay A1–B1. */
const VOCAB_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const GRAMMAR_LEVELS = new Set(['A1', 'A2', 'B1']);
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
  emoji: string;
}

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
function loadImages(vocab: VocabEntry[]): (ImageEntry & { svg: string })[] {
  if (!fs.existsSync(IMAGES_FILE)) return [];
  const entries = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf8')) as ImageEntry[];
  const known = new Set(vocab.map((e) => `${e.lemma}|${e.pos}`));
  const seen = new Set<string>();
  const errors: string[] = [];
  const out: (ImageEntry & { svg: string })[] = [];

  for (const img of entries) {
    const where = `images.json ${img?.lemma ?? '?'}`;
    if (!img.lemma || !img.pos || !img.emoji) {
      errors.push(`${where}: needs lemma/pos/emoji`);
      continue;
    }
    const key = `${img.lemma}|${img.pos}`;
    if (seen.has(key)) errors.push(`${where}: duplicate mapping`);
    seen.add(key);
    if (!known.has(key)) errors.push(`${where}: no vocab entry for ${key}`);
    const file = path.join(NOTO_DIR, notoFileName(img.emoji));
    if (!fs.existsSync(file)) {
      errors.push(`${where}: missing vendored SVG ${notoFileName(img.emoji)}`);
      continue;
    }
    out.push({ ...img, svg: fs.readFileSync(file, 'utf8').trim() });
  }

  if (errors.length) {
    console.error(`✗ image validation failed (${errors.length} errors):`);
    for (const err of errors.slice(0, 40)) console.error('  -', err);
    process.exit(1);
  }
  return out;
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
  validateVocabMarkers(grammar, vocab);

  // Fingerprint of everything that ends up in the DB. The app compares this
  // against the hash stored in the installed DB and applies an in-place
  // content update when they differ (src/logic/contentUpdate.ts).
  const contentHash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ contentVersion: CONTENT_VERSION, vocab, grammar, images }))
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
      level TEXT NOT NULL CHECK (level IN ('A1','A2','B1')),
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
      insImage.run(lemmaIds.get(`${img.lemma}|${img.pos}`)!, img.svg, 'noto');
    }

    grammar.forEach((t, ti) => {
      const info = db
        .prepare(
          'INSERT INTO grammar_topics (slug, title, level, explainer_md, sort_order, vocab_count) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(t.slug, t.title, t.level, t.explainer_md, ti + 1, topicVocab(t).size);
      const topicId = info.lastInsertRowid as number;
      const insQ = db.prepare(
        'INSERT INTO grammar_questions (topic_id, qtype, payload, difficulty) VALUES (?, ?, ?, ?)'
      );
      for (const q of t.questions ?? []) {
        insQ.run(topicId, q.qtype, JSON.stringify(q.payload), q.difficulty ?? 1);
      }
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
  db.exec('VACUUM');
  db.close();

  fs.writeFileSync(
    META_FILE,
    JSON.stringify({ version: CONTENT_VERSION, hash: contentHash }, null, 2) + '\n'
  );

  const sizeKb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(
    `✓ dictionary.db built: ${lemmaCount} lemmas, ${formCount} forms, ${senseCount} senses, ` +
      `${exampleCount} examples, ${images.length} images, ${grammar.length} topics, ${qCount} questions — ${sizeKb} KB ` +
      `(content ${contentHash.slice(0, 8)})`
  );
}

/** "Häuser" → "die Häuser" for display; keeps explicit dashes ("–") as-is. */
function formatPlural(plural: string): string {
  if (!plural || plural === '–' || plural === '-') return '–';
  return plural.startsWith('die ') ? plural : `die ${plural}`;
}

build();
