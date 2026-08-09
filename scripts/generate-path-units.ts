/**
 * Drafts Lernpfad units for one CEFR level into scripts/data/path/ —
 * one-shot generation into committed authoring files (never build-time), so
 * a human can review and tweak before `npm run build:db` validates them.
 *
 * Run: npx tsx scripts/generate-path-units.ts --level A2
 *
 * Grouping: theme membership first (scripts/data/themes.json, via each
 * word's authoring batch), remainder by frequency rank. Words already used
 * anywhere on the path are skipped; grammar topics of the level that no
 * lesson covers yet are spread across the new units, one per unit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const VOCAB_DIR = path.join(ROOT, 'scripts/data/vocab');
const GRAMMAR_DIR = path.join(ROOT, 'scripts/data/grammar');
const PATH_DIR = path.join(ROOT, 'scripts/data/path');
const THEMES_FILE = path.join(ROOT, 'scripts/data/themes.json');

/** How much of a level the path teaches (top-frequency first). */
const WORD_CAPS: Record<string, number> = {
  A1: 700,
  A2: 2000,
  B1: 1600,
  B2: 1200,
  C1: 800,
  C2: 400,
};

/** Words per lesson node (validator allows 4–10). */
const LESSON_WORDS: Record<string, number> = { A1: 8, A2: 10, B1: 10, B2: 10, C1: 10, C2: 10 };
/** Content lessons per unit (a review node is appended on top). */
const LESSONS_PER_UNIT: Record<string, number> = { A1: 3, A2: 4, B1: 4, B2: 4, C1: 4, C2: 4 };
/** A theme needs at least this many unused words to earn its own unit. */
const THEME_MIN = 12;
const GRAMMAR_QUESTIONS = 4;

const GENERAL_EMOJI = ['📚', '💬', '🧩', '🌟', '🎒', '🗒️', '🔤', '🧠'];

interface VocabWord {
  lemma: string;
  pos: string;
  level: string;
  freq: number;
  batch: string;
}

interface Lesson {
  slug: string;
  kind: 'lesson' | 'review';
  title: string;
  words?: { lemma: string; pos: string }[];
  grammar?: { topic: string; questions: number }[];
}

interface Unit {
  slug: string;
  title: string;
  emoji: string;
  level: string;
  lessons: Lesson[];
}

function loadVocab(): VocabWord[] {
  const words: VocabWord[] = [];
  for (const file of fs.readdirSync(VOCAB_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const batch = file.replace(/\.json$/, '');
    for (const e of JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, file), 'utf8'))) {
      words.push({ lemma: e.lemma, pos: e.pos, level: e.level, freq: e.freq ?? 999999, batch });
    }
  }
  return words;
}

function loadExistingPath(): { units: Unit[]; nextFileNum: number } {
  if (!fs.existsSync(PATH_DIR)) fs.mkdirSync(PATH_DIR, { recursive: true });
  const files = fs.readdirSync(PATH_DIR).filter((f) => f.endsWith('.json')).sort();
  const units = files.map((f) => JSON.parse(fs.readFileSync(path.join(PATH_DIR, f), 'utf8')) as Unit);
  const nums = files.map((f) => Number(f.split('-')[0])).filter((n) => Number.isFinite(n));
  return { units, nextFileNum: (nums.length ? Math.max(...nums) : 0) + 1 };
}

function main() {
  const levelArg = process.argv.indexOf('--level');
  const level = levelArg >= 0 ? process.argv[levelArg + 1] : null;
  if (!level || !WORD_CAPS[level]) {
    console.error('Usage: npx tsx scripts/generate-path-units.ts --level A2');
    process.exit(1);
  }

  const vocab = loadVocab();
  const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8')) as {
    slug: string;
    title: string;
    emoji: string;
    batches: string[];
  }[];
  const { units: existing, nextFileNum } = loadExistingPath();

  const used = new Set<string>();
  const usedTopics = new Set<string>();
  const usedUnitSlugs = new Set<string>();
  for (const u of existing) {
    usedUnitSlugs.add(u.slug);
    for (const l of u.lessons) {
      for (const w of l.words ?? []) used.add(`${w.lemma}|${w.pos}`);
      for (const g of l.grammar ?? []) usedTopics.add(g.topic);
    }
  }

  // Level's grammar topics not covered yet, in curriculum order.
  const topics: { slug: string; title: string }[] = [];
  for (const f of fs.readdirSync(GRAMMAR_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const t = JSON.parse(fs.readFileSync(path.join(GRAMMAR_DIR, f), 'utf8'));
    if (t.level === level && !usedTopics.has(t.slug)) topics.push({ slug: t.slug, title: t.title });
  }

  // Candidate pool: the level's most frequent unused words.
  const pool = vocab
    .filter((w) => w.level === level && !used.has(`${w.lemma}|${w.pos}`))
    .sort((a, b) => a.freq - b.freq)
    .slice(0, WORD_CAPS[level]);
  const inPool = new Set(pool.map((w) => `${w.lemma}|${w.pos}`));

  const batchTheme = new Map<string, { slug: string; title: string; emoji: string }>();
  for (const t of themes) {
    for (const b of t.batches) {
      if (!batchTheme.has(b)) batchTheme.set(b, { slug: t.slug, title: t.title, emoji: t.emoji });
    }
  }

  const unitWordCount = LESSON_WORDS[level] * LESSONS_PER_UNIT[level];

  // Theme buckets in themes.json order; leftovers go to the frequency pool.
  const themeBuckets = new Map<string, { theme: { slug: string; title: string; emoji: string }; words: VocabWord[] }>();
  const general: VocabWord[] = [];
  for (const w of pool) {
    const theme = batchTheme.get(w.batch);
    if (theme) {
      const bucket = themeBuckets.get(theme.slug) ?? { theme, words: [] };
      bucket.words.push(w);
      themeBuckets.set(theme.slug, bucket);
    } else {
      general.push(w);
    }
  }
  for (const [slug, bucket] of [...themeBuckets]) {
    if (bucket.words.length < THEME_MIN) {
      general.push(...bucket.words);
      themeBuckets.delete(slug);
    }
  }
  general.sort((a, b) => a.freq - b.freq);

  interface Draft {
    title: string;
    emoji: string;
    slugBase: string;
    words: VocabWord[];
    avgFreq: number;
  }
  const drafts: Draft[] = [];
  const lv = level.toLowerCase();

  for (const { theme, words } of themeBuckets.values()) {
    // Split oversized themes into parts of at most one unit's words.
    for (let i = 0, part = 1; i < words.length; i += unitWordCount, part++) {
      let chunk = words.slice(i, i + unitWordCount);
      if (chunk.length < THEME_MIN) {
        general.push(...chunk);
        break;
      }
      const multi = words.length > unitWordCount;
      drafts.push({
        title: multi ? `${theme.title} ${part}` : theme.title,
        emoji: theme.emoji,
        slugBase: multi ? `${lv}-${theme.slug}-${part}` : `${lv}-${theme.slug}`,
        words: chunk,
        avgFreq: chunk.reduce((s, w) => s + w.freq, 0) / chunk.length,
      });
    }
  }
  general.sort((a, b) => a.freq - b.freq);
  for (let i = 0, part = 1; i < general.length; i += unitWordCount, part++) {
    const chunk = general.slice(i, i + unitWordCount);
    if (chunk.length < THEME_MIN) break; // tail too small for a unit — leave untaught
    drafts.push({
      title: `Wortschatz ${part}`,
      emoji: GENERAL_EMOJI[(part - 1) % GENERAL_EMOJI.length],
      slugBase: `${lv}-wortschatz-${part}`,
      words: chunk,
      avgFreq: chunk.reduce((s, w) => s + w.freq, 0) / chunk.length,
    });
  }

  // Easiest (most frequent) units first along the path.
  drafts.sort((a, b) => a.avgFreq - b.avgFreq);

  // One grammar topic per unit, spread evenly from the start of the level.
  const topicGap = topics.length ? Math.max(1, Math.floor(drafts.length / topics.length)) : 0;

  const units: Unit[] = drafts.map((d, di) => {
    if (usedUnitSlugs.has(d.slugBase)) {
      console.error(`✗ unit slug collision: ${d.slugBase} already exists`);
      process.exit(1);
    }
    const perLesson = LESSON_WORDS[level];
    const lessons: Lesson[] = [];
    // Balanced lesson sizes (13 words → 7+6, never a 3-word tail) so every
    // lesson satisfies the validator's 4–10 range.
    const lessonCount = Math.max(2, Math.ceil(d.words.length / perLesson));
    const base = Math.floor(d.words.length / lessonCount);
    const extra = d.words.length % lessonCount;
    const chunks: VocabWord[][] = [];
    for (let i = 0, off = 0; i < lessonCount; i++) {
      const size = base + (i < extra ? 1 : 0);
      chunks.push(d.words.slice(off, off + size));
      off += size;
    }
    chunks.forEach((chunk, i) => {
      lessons.push({
        slug: `${d.slugBase}-${i + 1}`,
        kind: 'lesson',
        title: chunks.length === 1 ? 'Neue Wörter' : `Neue Wörter ${i + 1}`,
        words: chunk.map((w) => ({ lemma: w.lemma, pos: w.pos })),
      });
    });
    // Grammar rides in the middle lesson of every `topicGap`-th unit.
    const topicIdx = topicGap && di % topicGap === 0 ? Math.floor(di / topicGap) : -1;
    if (topicIdx >= 0 && topicIdx < topics.length) {
      const lesson = lessons[Math.min(1, lessons.length - 1)];
      lesson.grammar = [{ topic: topics[topicIdx].slug, questions: GRAMMAR_QUESTIONS }];
      lesson.title = topics[topicIdx].title;
    }
    lessons.push({ slug: `${d.slugBase}-wdh`, kind: 'review', title: 'Wiederholung' });
    return { slug: d.slugBase, title: d.title, emoji: d.emoji, level, lessons };
  });

  // Any topics that didn't land (more topics than gap slots) go into the
  // last units' middle lessons.
  const placed = new Set(
    units.flatMap((u) => u.lessons.flatMap((l) => (l.grammar ?? []).map((g) => g.topic)))
  );
  const missing = topics.filter((t) => !placed.has(t.slug));
  let ui = 0;
  for (const t of missing) {
    while (ui < units.length) {
      const lessons = units[ui].lessons.filter((l) => l.kind === 'lesson');
      const free = lessons.find((l) => !l.grammar);
      ui++;
      if (free) {
        free.grammar = [{ topic: t.slug, questions: GRAMMAR_QUESTIONS }];
        break;
      }
    }
  }

  units.forEach((u, i) => {
    const num = String(nextFileNum + i).padStart(3, '0');
    const file = path.join(PATH_DIR, `${num}-${u.slug}.json`);
    fs.writeFileSync(file, JSON.stringify(u, null, 2) + '\n');
  });

  const wordCount = units.reduce(
    (s, u) => s + u.lessons.reduce((s2, l) => s2 + (l.words?.length ?? 0), 0),
    0
  );
  console.log(
    `✓ ${level}: wrote ${units.length} units (${wordCount} words, ${topics.length} grammar topics) ` +
      `starting at ${String(nextFileNum).padStart(3, '0')}-…`
  );
}

main();
