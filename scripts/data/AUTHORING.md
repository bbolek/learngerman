# Vocabulary authoring guide

Vocabulary lives in `scripts/data/vocab/*.json` — each file is a JSON array of
entries. All files are merged by `npm run build:db`; duplicate `lemma|pos`
pairs across files fail the build.

## Entry schema

```jsonc
{
  "lemma": "machen",          // dictionary form; nouns capitalized
  "pos": "verb",              // verb|noun|adj|adv|prep|pron|conj|num|other
  "level": "A1",              // A1|A2|B1|B2|C1
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
  concrete/common word wins; abstract words stay imageless on purpose.
- The SVG text ships inside the DB (`lemma_images` content table) and is
  covered by the content hash, so image changes reach installed apps via the
  normal in-place content update.
For pronouns list case forms in `note` (`"mich (Akk.) · mir (Dat.)"`).

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
  entries: A1 only), ≤ 8 words where possible; B2/C1 examples may run longer
  but keep the surrounding words simpler than the headword.
- Glosses are lowercase except proper nouns; verbs start with "to".
- `freq`: rough rank within the whole seed dictionary (1–3000); don't agonize.
- German spelling: ß/ä/ö/ü used properly (no ASCII folding in content).

## Validation

`npm run build:db` validates everything (schema, duplicates, question
payloads) and fails loudly. JSON syntax can be checked standalone:
`node -e "JSON.parse(require('fs').readFileSync('scripts/data/vocab/FILE.json','utf8'))"`.

## Grammar topics

Grammar lives in `scripts/data/grammar/*.json` — one topic per file, named
`NN-slug.json`. The numeric prefix defines `sort_order` (group by level:
01–08 A1, 09–16 A2, 17–22 B1).

```jsonc
{
  "slug": "akkusativ",        // stable id, kebab-case
  "title": "Akkusativ",       // shown on the topic card (German)
  "level": "A1",              // A1|A2|B1 — practice screen groups by this
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

`difficulty` is 1–3 (easy rounds are served first). Aim for ≥ 12 questions
per topic and a mix of at least three qtypes where the topic allows it.
