# Vocabulary authoring guide

Vocabulary lives in `scripts/data/vocab/*.json` — each file is a JSON array of
entries. All files are merged by `npm run build:db`; duplicate `lemma|pos`
pairs across files fail the build.

## Entry schema

```jsonc
{
  "lemma": "machen",          // dictionary form; nouns capitalized
  "pos": "verb",              // verb|noun|adj|adv|prep|pron|conj|num|other
  "level": "A1",              // A1|A2|B1|B2|C1|C2
  "freq": 8,                  // approximate frequency rank (1 = most common)
  "verb": { ... },            // required for pos=verb
  "noun": { ... },            // required for pos=noun
  "adj": { ... },             // optional for pos=adj
  "senses": [                 // 1–3 senses, most common first
    {
      "en": "to make, to do",           // concise gloss, verbs with "to"
      "example_de": "Was machst du?",   // short A1-level sentence
      "example_en": "What are you doing?",
      "note": "+ Dativ"                 // optional usage hint
    }
  ]
}
```

### Verbs (`verb` block)

- Regular weak verb: just `{ "aux": "haben" }` — conjugation is derived
  (incl. e-insertion for -t/-d stems and s/ß/x/z du-forms).
- Präsens stem change: add `"du"` and `"er"` (`"du": "fährst", "er": "fährt"`).
- Strong/mixed: add `"praeteritum"` (3sg: `"ging"`) and `"partizip2"`
  (`"gegangen"`). Omit for weak verbs.
- Fully irregular Präsens (sein/haben/werden/wissen pattern): give the whole
  `"praesens": {"ich","du","er","wir","ihr","sie"}` object.
- Separable: `"separablePrefix": "auf"` (lemma is `aufmachen`); partizip2 is
  derived (`aufgemacht`) unless the base verb is strong — then give it
  (`"partizip2": "ferngesehen"`).
- `aux` is `"sein"` for motion/change verbs (gehen, kommen, fahren…).

### Nouns (`noun` block)

- `"gender"`: `m` | `f` | `n` | `pl` (plural-only words like Eltern).
- `"plural"`: bare plural form (`"Häuser"`, no article) or `null` if none.
- `"genitive"`: only when the default (lemma+s / +es after s-sounds) is wrong
  (`"Mannes"`, `"Hauses"` — strong m/n often prefer -es).

### Adjectives (`adj` block, optional)

- Umlaut/irregular comparison: `{ "comparative": "größer", "superlative": "größt" }`
  (superlative WITHOUT ending: `größt`, not `größten`).
- Regular adjectives need no block at all.
- `{ "indeclinable": true }` for adjectives never declined (rosa, prima).

### Other POS

adv/prep/pron/conj/num/other take no morphology block. For prepositions put
the case in `note` (`"+ Dativ"`, `"+ Akkusativ"`, `"Wechselpräposition: …"`).

## Vocabulary images (`images.json`)

`scripts/data/images.json` maps entries to a [Noto emoji](https://github.com/googlefonts/noto-emoji)
illustration (OFL/Apache-2.0), shown as a gender-tinted tile in the
dictionary, word detail, flashcard backs and Wort des Tages:

```jsonc
[{ "lemma": "Apfel", "pos": "noun", "emoji": "🍎" }]
```

Rules:

- The `lemma|pos` pair must exist in a vocab batch; duplicates fail the build.
- The matching SVG must be vendored under `scripts/data/images/noto/`
  (`emoji_uXXXX.svg`, codepoints joined by `_`, variation selectors dropped —
  download from the noto-emoji repo's `svg/` folder). Builds never touch the
  network; the build fails loudly if the file is missing.
- Only map words whose meaning the picture shows **unambiguously** (concrete
  nouns, mostly A1/A2). When two candidates compete for one emoji, the more
  concrete/common word wins; abstract words stay imageless on purpose. Never
  map two lemmas to the same emoji/icon — the Bilderrätsel game would show
  one picture with two valid answers.
- The SVG text ships inside the DB (`lemma_images` content table) and is
  covered by the content hash, so image changes reach installed apps via the
  normal in-place content update.

Besides Noto emoji, entries can reference other vendored icon sets via
`icon` + `source` instead of `emoji`:

```jsonc
[{ "lemma": "Stethoskop", "pos": "noun",
   "icon": "filled/devices/stethoscope", "source": "healthicons" }]
```

- `source` names a vendor dir under `scripts/data/images/<source>/`; the icon
  path resolves to `<source>/<icon>.svg`. Known sources: `noto` (emoji,
  OFL/Apache-2.0), `healthicons` ([healthicons.org](https://healthicons.org),
  MIT — medical/hospital objects that have no emoji).
- Monochrome sets must draw with `fill="currentColor"` — the app tints them
  at render time with the tile's gender foreground so dark mode works.
  Health Icons "filled" variants already do this.
For pronouns list case forms in `note` (`"mich (Akk.) · mir (Dat.)"`).

## Synonyms (`synonyms.json`)

`scripts/data/synonyms.json` links entries to words the learner can use
instead, shown as tappable rows in a "Synonyme" section on the word-detail
screen:

```jsonc
[
  {
    "lemma": "anfangen", "pos": "verb",
    "synonyms": [
      { "lemma": "beginnen", "note": "formeller" },
      { "lemma": "starten", "note": "umgangssprachlich; auch für Geräte und Motoren" }
    ]
  }
]
```

Rules:

- Every lemma (headword and synonym) must exist in a vocab batch; the build
  fails otherwise. Synonym refs only need `"pos"` when the lemma exists under
  more than one pos — the build tells you when it's ambiguous.
- Links are **directional**: an entry only shows the synonyms authored for
  it. Author both directions when both words should show the connection —
  notes usually differ per direction ("erhalten: formeller" vs.
  "bekommen: alltäglicher").
- `note` is optional and explains the nuance in short **German** fragments
  ("formeller", "umgangssprachlich", "stärker", "nur für Personen"). Add one
  whenever the words are not freely interchangeable.
- Duplicate headword entries, duplicate refs and self-references fail the
  build.

### Form examples (`examples`, optional)

Extra example sentences that demonstrate specific tenses/forms, shown in a
"Beispiele" section on the word-detail screen (the per-sense `example_de` stays
the primary example):

```jsonc
"examples": [
  { "tag": "präsens",    "de": "Was machst du am Wochenende?", "en": "What are you doing on the weekend?" },
  { "tag": "präteritum", "de": "Er machte seine Hausaufgaben.", "en": "He did his homework." },
  { "tag": "perfekt",    "de": "Ich habe das Essen gemacht.",   "en": "I made the food." },
  { "tag": "imperativ",  "de": "Mach das Fenster zu!",          "en": "Close the window!" }
]
```

Allowed tags: `präsens` `präteritum` `perfekt` `imperativ` `frage` `negation`
`plural` `dativ` `akkusativ` `komparativ` `superlativ` `allgemein`.
Guidelines: verbs get präsens/präteritum/perfekt (+ imperativ where natural);
adjectives with comparison get komparativ + superlativ; common nouns get a
plural example. The sentence MUST actually use the tagged form of the lemma.

## Style rules

- Example sentences use vocabulary at or below the entry's level (A1/A2
  entries: A1 only), ≤ 8 words where possible; B2/C1/C2 examples may run longer
  but keep the surrounding words simpler than the headword.
- Glosses are lowercase except proper nouns; verbs start with "to".
- `freq`: rough rank within the whole seed dictionary (1–3000, C2 entries may
  run higher); don't agonize.
- German spelling: ß/ä/ö/ü used properly (no ASCII folding in content).

## Validation

`npm run build:db` validates everything (schema, duplicates, question
payloads) and fails loudly. JSON syntax can be checked standalone:
`node -e "JSON.parse(require('fs').readFileSync('scripts/data/vocab/FILE.json','utf8'))"`.

## Grammar topics

Grammar lives in `scripts/data/grammar/*.json` — one topic per file, named
`NN-slug.json`. The numeric prefix defines `sort_order` (group by level:
01–09 A1, 10–19 A2, 20–30 B1, 31–40 B2, 41–48 C1, 49–52 C2). Topics must
stay level-contiguous in that order — a test asserts levels never go
backwards — so inserting a topic into a level means renumbering the files
after it (slugs are the stable key, so renaming files is safe for user
data). Keep prefixes at two digits below 100: filename sort is
lexicographic, `100-` would sort before `31-`.

```jsonc
{
  "slug": "akkusativ",        // stable id, kebab-case
  "title": "Akkusativ",       // shown on the topic card (German)
  "level": "A1",              // A1|A2|B1|B2|C1|C2 — practice screen groups by this
  "explainer_md": "…",        // intro shown before the first quiz round
  "questions": [ … ]
}
```

### Explainer style

Explanations are written in **English** with German examples (app UI copy is
German, grammar explanations English). The renderer is `MarkdownLite`:
paragraphs (blank-line separated), `**bold**`, `*italic*` and pipe tables —
no headers or bullet lists. Every rule needs at least one easy example
sentence with an English translation. Keep example vocabulary at the topic's
level or below.

### Vocabulary markers

Wrap words worth introducing in `[[…]]` — the app renders them underlined
and tappable; a tap opens a dictionary popup (meaning, examples,
save-to-flashcards). `[[Wort]]` looks up the word itself (inflected forms
resolve too); `[[display|lookup]]` shows one word but looks up another
(`[[möchten|mögen]]`). The build fails if a marker doesn't resolve to a
dictionary lemma or form — add the word to a vocab batch first. Mark each
word once per explainer, ideally in the verb/preposition lists rather than
mid-example. Markers also work in question `explanation` strings (the
feedback panel renders them tappable); the convention there is to mark the
„quoted“ verb/preposition the explanation refers to. The build derives
`grammar_topics.vocab_count` (distinct lookups per topic) from all markers.

### Question types

- `mc` — `prompt`, `options` (2–4), `correctIndex`, `explanation`
- `fill` — `prompt`, `accept` (all correct answers, first one is shown as
  "the" answer; grading is case-insensitive with umlaut near-miss),
  optional `hint`, `explanation`
- `order` — `tokens` (shuffled for display), `solutions` (arrays that use
  exactly the token pool), optional `translation`, `explanation`
- `case_id` — `sentence` with the phrase marked `**…**`, `correctCase`,
  `reasons` (one correct), `correctReasonIndex`, `explanation`. Only for
  case-related topics.

`difficulty` is 1–3 (easy rounds are served first). Every topic ships 48
questions (a test asserts ≥ 48) with a mix of at least three qtypes and at
least one difficulty-1 question; the going ratio is roughly 24 mc / 13 fill /
10 order, with ~6 case_id replacing mc on case-related topics.

## Reading texts (Leseecke)

One graded text per file in `scripts/data/reading/*.json`:

```jsonc
{
  "slug": "im-cafe",          // kebab-case, stable — reading_progress keys on it
  "title": "Im Café",
  "level": "A1",              // A1|A2|B1
  "teaser": "Lena hat Durst …",   // one-line hook for the list screen
  "paragraphs": [
    { "de": "…", "en": "…" }  // German paragraph + English translation
  ]
}
```

Rules:

- Never rename a `slug` — the user's completion state (`reading_progress`)
  is keyed by it and would be orphaned.
- Keep texts short (80–160 words) and level-appropriate: A1 Präsens and
  core vocab, A2 may use Perfekt, B1 subordinate clauses.
- Every word is tappable in the reader (fuzzy dictionary lookup) — prefer
  vocabulary the dictionary knows, but unmatched words are simply not
  linked; nothing breaks.
- The list orders by level, then German title; the build derives the
  word count shown in the UI.

## Learning path (Lernpfad)

One unit per file in `scripts/data/path/NNN-slug.json`; the numeric filename
prefix is the sort order along the path (same convention as grammar topics).
Units must run in CEFR order A1 → C2.

```jsonc
{
  "slug": "a1-hallo",          // stable forever — see rules below
  "title": "Hallo!",
  "emoji": "👋",
  "level": "A1",               // A1|A2|B1|B2|C1|C2
  "lessons": [
    {
      "slug": "a1-hallo-1",    // globally unique, stable forever
      "kind": "lesson",
      "title": "Erste Wörter",
      "words": [               // 4–10 new words, taught nowhere else on the path
        { "lemma": "hallo", "pos": "other" }
      ],
      "grammar": [             // optional: interleave quiz questions
        { "topic": "praesens", "questions": 4 }   // grammar_topics.slug
      ]
    },
    { "slug": "a1-hallo-wdh", "kind": "review", "title": "Wiederholung" }
  ]
}
```

Rules:

- **Never rename a slug** (unit or lesson) — the user's completion state
  (`path_progress`) is keyed by lesson slug and would be orphaned. Only add.
- 3–6 nodes per unit; the **last node must be `kind: "review"`** — it carries
  no content of its own (the session is computed at runtime from due
  spaced-repetition material introduced earlier on the path).
- Every `{lemma, pos}` must exist in the dictionary and may be taught by
  only one lesson path-wide; every grammar `topic` slug must exist and may
  be covered by only one lesson path-wide.
- A1 units are hand-curated (thematic arcs, highest-frequency words first);
  A2–C2 units are drafted by `scripts/generate-path-units.ts` and committed
  after review.
