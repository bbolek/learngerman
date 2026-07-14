import { checkAchievements } from '@/db/achievementsRepo';
import { type RecordOutcome } from '@/db/gamesRepo';
import { claimCompletedQuests } from '@/db/questsRepo';
import { grantFreeze } from '@/db/streakRepo';
import { grantXp, type XpGrant } from '@/db/xpRepo';
import { levelTitle, xpForGameScore, type XpKind } from '@/logic/xp';
import { celebrate } from '@/store/celebration';

/**
 * Central reward plumbing: every XP award flows through here so level-ups
 * always celebrate (and pay out a Streak-Retter) no matter which screen
 * earned the XP.
 */
export async function awardXp(kind: XpKind, amount: number, now: Date): Promise<XpGrant> {
  const grant = await grantXp(kind, amount, now);
  if (grant.leveledUp) {
    const freezeGranted = await grantFreeze();
    celebrate({
      kind: 'levelUp',
      emoji: '🎉',
      title: `Level ${grant.level}!`,
      subtitle: `${levelTitle(grant.level)}${freezeGranted ? ' · +1 Streak-Retter 🧊' : ''}`,
    });
  }
  return grant;
}

/**
 * End-of-activity sweep: auto-claim finished Tagesziele (with a toast each)
 * and unlock any badges the session earned. Call after a review session,
 * quiz round, game round or duel — errors are swallowed, rewards must never
 * break the flow that earned them.
 */
export async function settleRewards(now: Date): Promise<void> {
  try {
    const claims = await claimCompletedQuests(now);
    for (const { quest, grant } of claims) {
      celebrate({
        kind: 'quest',
        emoji: quest.emoji,
        title: 'Tagesziel geschafft!',
        subtitle: `${quest.title} · +${quest.xp} XP`,
      });
      // Quest XP is granted inside the repo, so a crossed level boundary
      // has to be celebrated (and pay its freeze) here.
      if (grant.leveledUp) {
        const freezeGranted = await grantFreeze();
        celebrate({
          kind: 'levelUp',
          emoji: '🎉',
          title: `Level ${grant.level}!`,
          subtitle: `${levelTitle(grant.level)}${freezeGranted ? ' · +1 Streak-Retter 🧊' : ''}`,
        });
      }
    }
    const fresh = await checkAchievements(now);
    for (const def of fresh.slice(0, 3)) {
      celebrate({
        kind: 'achievement',
        emoji: def.emoji,
        title: `Abzeichen: ${def.title}`,
        subtitle: def.description,
      });
    }
  } catch {
    // best-effort by design
  }
}

/**
 * Everything a finished arcade round owes the player: score → XP, a "new
 * record" celebration when a previous best was actually beaten, then the
 * quest/achievement sweep. Returns the XP earned for the result screen.
 */
export async function settleGameRound(
  gameTitle: string,
  score: number,
  outcome: RecordOutcome,
  now: Date
): Promise<number> {
  const xp = xpForGameScore(score);
  try {
    await awardXp('game', xp, now);
    if (outcome.newRecord && outcome.previousBest > 0) {
      celebrate({
        kind: 'record',
        emoji: '🏆',
        title: 'Neuer Rekord!',
        subtitle: `${score} Punkte in ${gameTitle}`,
      });
    }
    await settleRewards(now);
  } catch {
    // best-effort by design
  }
  return xp;
}
