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
- The bundled dictionary is read-only content; user data lives in the same SQLite file via `src/db/migrations.ts`. Content schema changes require bumping migration logic AND rebuilding the DB.
- Vocabulary authoring schema: `scripts/data/AUTHORING.md`. The build script validates everything and fails loudly — trust its error messages.
- German UI copy throughout the app; English used in grammar explanations.
