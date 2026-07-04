# LernGerman 🇩🇪

A beautiful, **fully offline** German learning app for A1–A2 learners, built with
React Native (Expo). Warm "paper & marigold" design in light and dark mode.

## Features

- **📖 Offline dictionary** — 1,300+ Goethe A1/A2 words with a form-aware lookup:
  type any inflected form (*macht*, *gemacht*, *fährt*, *Häuser*) and land on the
  right word, with an explanation of which form you typed. Works both directions
  (German → English and English → German), tolerates missing umlauts
  (*hauser* → *Häuser*), and shows full conjugation/declension tables.
- **🃏 Spaced-repetition flashcards** — save any word with the heart button and
  review it with an Anki-style SM-2 scheduler (Nochmal / Schwer / Gut / Einfach,
  with next-interval previews). Daily queue, streak tracking, progress rings.
- **🎯 Grammar practice** — 240 authored questions across 8 case topics
  (Akkusativ, Dativ, Präpositionen, Wechselpräpositionen, Dativ-Verben,
  Personalpronomen, Possessivartikel) in 4 exercise styles: multiple choice,
  fill-in-the-blank, sentence ordering (tap-to-place tiles), and case
  identification. Questions you miss come back more often; every answer gets an
  explanation.
- **📊 Stats** — streak, 14-day activity chart, per-topic accuracy.

Everything runs on-device in a single SQLite database — no account, no network.

## Getting started

```bash
npm install
npx expo start        # scan the QR code with Expo Go (iOS/Android)
```

## Development

```bash
npm test              # jest: SM-2 scheduler, lookup engine, graders
npm run typecheck     # tsc --noEmit
npm run build:db      # regenerate assets/db/dictionary.db from scripts/data/
```

### Content pipeline

Vocabulary lives in `scripts/data/vocab/*.json` (schema in
`scripts/data/AUTHORING.md`); grammar questions in
`scripts/data/grammar-questions.json`. `npm run build:db` validates everything,
expands German inflections programmatically (strong verbs, separable prefixes,
noun plurals/cases, adjective comparison), and emits the bundled SQLite file —
which the app imports on first launch (`src/db/client.ts`), then layers user
tables on top (saved words, SRS state, quiz attempts, activity).

### Architecture

```
src/app/       expo-router screens (tabs: Start · Wörterbuch · Wörter · Üben)
src/db/        repositories over expo-sqlite
src/logic/     pure logic: lookup, SM-2, graders (unit-tested in node)
src/ui/        design tokens (theme.ts) + reusable components
design/        HTML design-system previews
```

Known v1 limitation: split separable verbs in a sentence ("macht … auf") don't
resolve to *aufmachen* — the joined forms (*aufmacht*, *aufgemacht*) do.
