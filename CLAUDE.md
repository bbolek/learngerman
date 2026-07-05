# LernGerman — development notes

Offline German learning app (Expo SDK 57, TypeScript, expo-router, expo-sqlite).

## Commands

- `npm test` — jest (pure logic tested in node against the real built DB via better-sqlite3)
- `npm run typecheck` — tsc --noEmit
- `npm run build:db` — regenerate `assets/db/dictionary.db` from `scripts/data/` (run after ANY content or schema change; the DB is committed)
- `npx expo start` — dev server (Expo Go)
- `npx expo export --platform ios` — bundle smoke test

## Architecture rules

- Routes live in `src/app/` (expo-router). All colors/spacing/fonts come from `src/ui/theme.ts` tokens via `useTheme()` — never hardcode colors in screens (dark mode depends on it).
- Pure logic (`src/logic/`) must stay free of RN imports and `Date.now()` — clocks are injected so jest can control time.
- The bundled dictionary is read-only content; user data lives in the same SQLite file via `src/db/migrations.ts` (versioned user-schema migrations). Content ships as a snapshot: the build stamps a content hash (`assets/db/content-meta.json` + `meta` table), and on launch `src/logic/contentUpdate.ts` swaps stale content tables in place, remapping user rows by natural keys (lemma+pos, topic slug+prompt) — app updates deliver new content without reinstall. Content schema changes only need `npm run build:db`; user-table changes need a new migration.
- Vocabulary & grammar authoring schema: `scripts/data/AUTHORING.md` (vocab batches in `scripts/data/vocab/`, one grammar topic per file in `scripts/data/grammar/`). The build script validates everything and fails loudly — trust its error messages.
- German UI copy throughout the app; English used in grammar explanations.
