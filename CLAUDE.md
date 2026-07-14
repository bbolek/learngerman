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
- German UI copy throughout the app; English used in grammar explanations.

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
