# Deutschly 🇩🇪

A beautiful, **fully offline** German learning app, A1–C1, built with
React Native (Expo). Warm "paper & marigold" design in light and dark mode.
Free, no account, no login, no payment, no network required.

## Features

- **📖 Offline dictionary** — 10,000+ words (A1–C1) with a form-aware lookup:
  type any inflected form (*macht*, *gemacht*, *fährt*, *Häuser*) and land on the
  right word, with an explanation of which form you typed. Works both directions
  (German → English and English → German), tolerates missing umlauts
  (*hauser* → *Häuser*), and shows full conjugation/declension tables. Every
  word, form, and example sentence has a tap-to-listen pronunciation.
- **🃏 Spaced-repetition flashcards** — save any word with the heart button and
  review it with an Anki-style SM-2 scheduler (Nochmal / Schwer / Gut / Einfach,
  with next-interval previews). Daily queue, streak tracking, progress rings.
  Mistakes from quizzes/games/duels (Fehlerbuch) feed back into the queue.
- **🎯 Grammar practice** — 607 authored questions across 30 topics in 4
  exercise styles: multiple choice, fill-in-the-blank, sentence ordering
  (tap-to-place tiles), and case identification. Questions you miss come back
  more often; every answer gets an explanation.
- **🎮 Mini-games & multiplayer** — Wort-Blitz, Bilderrätsel, Der-die-das,
  Wortpaare, plus WLAN duels (up to 30 players on the same network, live).
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
