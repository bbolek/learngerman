# Deutschly — development notes

Offline German learning app (Expo SDK 57, TypeScript, expo-router, expo-sqlite).

## Commands

- `npm test` — jest (pure logic tested in node against the real built DB via better-sqlite3)
- `npm run typecheck` — tsc --noEmit
- `npm run build:db` — regenerate `assets/db/dictionary.db` from `scripts/data/` (run after ANY content or schema change; the DB is committed)
- `npm run build:sounds` — regenerate the synthesized WAV cues in `assets/sounds/` (committed; deterministic)
- `npx expo start` — dev server (Expo Go)
- `npx expo export --platform ios` — bundle smoke test

## Architecture rules

- Routes live in `src/app/` (expo-router). All colors/spacing/fonts come from `src/ui/theme.ts` tokens via `useTheme()` — never hardcode colors in screens (dark mode depends on it).
- Pure logic (`src/logic/`) must stay free of RN imports and `Date.now()` — clocks are injected so jest can control time.
- The bundled dictionary is read-only content; user data lives in the same SQLite file via `src/db/migrations.ts` (versioned user-schema migrations). Content ships as a snapshot: the build stamps a content hash (`assets/db/content-meta.json` + `meta` table), and on launch `src/logic/contentUpdate.ts` swaps stale content tables in place, remapping user rows by natural keys (lemma+pos, topic slug+prompt) — app updates deliver new content without reinstall. Content schema changes only need `npm run build:db`; user-table changes need a new migration.
- Vocabulary & grammar authoring schema: `scripts/data/AUTHORING.md` (vocab batches in `scripts/data/vocab/`, one grammar topic per file in `scripts/data/grammar/`). The build script validates everything and fails loudly — trust its error messages.
- Backup/restore (Einstellungen → Backup): `src/logic/backup.ts` serializes every user table into one JSON file (content refs stored as natural keys, same as the content swap) and restore replaces the whole user state in one transaction; the file goes through the share sheet so it survives uninstall. **When adding a user table or a content-id column, extend the table lists in `backup.ts`** — `__tests__/backup.test.ts` round-trips against the real built DB.
- **UI copy is translated; the German *content* is not.** Every user-facing
  string lives in the flat, dotted catalogs under `src/i18n/locales/` — German
  (`de.ts`) defines the key set and the other ten catalogs are typed
  `Catalog`, so a missing key is a compile error. Screens read copy through
  `const tr = useTr()` (the theme hook already owns `t`); services and alerts
  use the module-level `tr()`. Lemmas, example sentences, grammar explainers,
  the pronouns in the conjugation table and the der/die/das articles stay
  German everywhere — that is the subject being taught.
- **Eleven catalogs exist; `ENABLED_LOCALES` decides which ship.** Today that
  is English (the default) and German. The other nine are complete and stay
  under test, so releasing one means adding it to that array — nothing else.
  `matchLocale` only resolves to enabled locales, so a device set to Turkish
  gets English rather than a language the picker cannot show, and
  `resolveLocale` clamps a stored preference the same way.
- `src/logic/` never holds copy: games, badges, quests, tour steps, form tags,
  level ranks, SRS interval previews and forecast labels return stable ids, and
  `src/i18n/labels.ts` turns an id plus `tr` into a string. Adding a game or a
  badge therefore means adding catalog entries in all eleven catalogs —
  `npm test` checks key parity, `{placeholder}` parity against German, and the
  plural rules per language.
- Plurals: a catalog value is a string or a `{ one, few, other, … }` record;
  `{count}` picks the form via the hand-rolled CLDR table in
  `src/i18n/message.ts` (no `Intl` dependency). Polish, Russian and Ukrainian
  write their "many" form as `other`, the one category every message carries.
- Language preference lives in the settings blob (`uiLanguage`, no migration
  needed); `'system'` follows the device, read without a native module so OTA
  updates keep working. Arabic is the only RTL language — switching to or from
  it flips `I18nManager` and restarts the app (`src/i18n/rtl.ts`).
- English is used in grammar explanations.
- OTA updates (EAS Update, `runtimeVersion: appVersion`): an update publishes JS only, and it lands on every store binary with the same `version`. **Adding a dependency with native code therefore requires bumping `version` in app.json in the same PR** — otherwise the OTA bundle reaches binaries that lack the native module and `requireNativeModule` crashes at import. New native modules must additionally be imported lazily (see `src/services/backup.ts`) so screens degrade instead of crashing on older binaries.

## Gamification (XP · streak insurance · quests · badges)

Fully offline — no accounts, no ads, no network. Pure rules live in `src/logic/`
(`xp.ts` level curve & award sizes, `quests.ts` seeded daily rotation,
`achievements.ts` badge defs, `streakSafe.ts` freeze/repair planning); state
lives in migration-v6 tables (`xp_events` append-only ledger, `quest_claims`,
`achievements_unlocked`, `streak_freeze_days`) plus `user_meta`
(`streak_freezes`, `last_streak_milestone`).

- **XP flows through `awardXp()` / `settleGameRound()` in `src/services/rewards.ts`** —
  never call `grantXp` from a screen, or level-ups skip their celebration and
  freeze payout. Level = lifetime earned XP (positive ledger rows only);
  spending (streak repair) is a negative row and can never de-level.
- `settleRewards()` auto-claims finished Tagesziele and unlocks badges; it runs
  on Home focus and after every session/round, and must stay idempotent.
- Streak-Retter: earned on level-ups & streak milestones (cap 3), auto-consumed
  by `streakState()` on Home load; the XP repair offer only exists the day
  after a 1-day gap. `currentStreak()` counts frozen days — always go through
  `countedDays()`.
- Reward moments (level-up, milestone, badge, record, quest) go through
  `celebrate()` (`src/store/celebration.ts`) → global confetti overlay in
  `_layout.tsx`; sounds via `playSound()` respect the `soundEnabled` setting,
  haptics the `hapticsEnabled` setting.
- Quest keys and achievement ids are persisted — never rename existing ones,
  only add.
