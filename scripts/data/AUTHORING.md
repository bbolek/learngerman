# Vocabulary authoring guide

Vocabulary lives in `scripts/data/vocab/*.json` — each file is a JSON array of
entries. All files are merged by `npm run build:db`; duplicate `lemma|pos`
pairs across files fail the build.

## Entry schema

```jsonc
{
  "lemma": "machen",          // dictionary form; nouns capitalized
  "pos": "verb",              // verb|noun|adj|adv|prep|pron|conj|num|other
  "level": "A1",              // A1|A2|B1
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
For pronouns list case forms in `note` (`"mich (Akk.) · mir (Dat.)"`).

## Style rules

- Example sentences use ONLY A1-level vocabulary, ≤ 8 words where possible.
- Glosses are lowercase except proper nouns; verbs start with "to".
- `freq`: rough rank within the whole seed dictionary (1–3000); don't agonize.
- German spelling: ß/ä/ö/ü used properly (no ASCII folding in content).

## Validation

`npm run build:db` validates everything (schema, duplicates, question
payloads) and fails loudly. JSON syntax can be checked standalone:
`node -e "JSON.parse(require('fs').readFileSync('scripts/data/vocab/FILE.json','utf8'))"`.
