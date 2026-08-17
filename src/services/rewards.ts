import { checkAchievements } from '@/db/achievementsRepo';
import { type RecordOutcome } from '@/db/gamesRepo';
import { claimCompletedQuests } from '@/db/questsRepo';
import { grantFreeze } from '@/db/streakRepo';
import { grantXp, type XpGrant } from '@/db/xpRepo';
import { tr } from '@/i18n';
import { achievementDescription, achievementTitle, levelTitle, questTitle } from '@/i18n/labels';
import { xpForGameScore, type XpKind } from '@/logic/xp';
import { celebrate } from '@/store/celebration';

/** Level-up subtitle: the new rank, plus the bonus freeze when one was paid. */
function levelUpSubtitle(level: number, freezeGranted: boolean): string {
  const rank = levelTitle(tr, level);
  return freezeGranted
    ? tr('reward.levelUp.subtitleWithFreeze', { rank })
    : tr('reward.levelUp.subtitle', { rank });
}

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
      title: tr('reward.levelUp.title', { level: grant.level }),
      subtitle: levelUpSubtitle(grant.level, freezeGranted),
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
        title: tr('reward.quest.title'),
        subtitle: tr('reward.quest.subtitle', {
          title: questTitle(tr, quest.key),
          xp: quest.xp,
        }),
      });
      // Quest XP is granted inside the repo, so a crossed level boundary
      // has to be celebrated (and pay its freeze) here.
      if (grant.leveledUp) {
        const freezeGranted = await grantFreeze();
        celebrate({
          kind: 'levelUp',
          emoji: '🎉',
          title: tr('reward.levelUp.title', { level: grant.level }),
          subtitle: levelUpSubtitle(grant.level, freezeGranted),
        });
      }
    }
    const fresh = await checkAchievements(now);
    for (const def of fresh.slice(0, 3)) {
      celebrate({
        kind: 'achievement',
        emoji: def.emoji,
        title: tr('reward.achievement.title', { title: achievementTitle(tr, def.id) }),
        subtitle: achievementDescription(tr, def.id),
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
        title: tr('reward.record.title'),
        subtitle: tr('reward.record.subtitle', { score, game: gameTitle }),
      });
    }
    await settleRewards(now);
  } catch {
    // best-effort by design
  }
  return xp;
}
