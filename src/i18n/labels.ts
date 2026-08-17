/**
 * Catalog lookups for values that are identified by a stable id elsewhere in
 * the app — games, badges, daily quests and German form tags. Each takes the
 * `tr` from `useTr()` so callers stay reactive to language changes.
 */

import type { TranslateFn } from '@/i18n';
import { isExampleTag, isFormTag } from '@/logic/formLabels';
import type { GameKey } from '@/logic/games';
import type { ForecastLabel } from '@/logic/heatmap';
import type { IntervalPreview } from '@/logic/sm2';
import { levelRankId } from '@/logic/xp';
import type { ColorThemeName } from '@/ui/theme';

/** Display name of a colour swatch ("Marigold", "Rosé", …). */
export function colorThemeLabel(tr: TranslateFn, name: ColorThemeName): string {
  return tr(`color.${name}`);
}

/** Playful rank name for an XP level ("Neuling", "Deutschmeister:in", …). */
export function levelTitle(tr: TranslateFn, level: number): string {
  return tr(`rank.${levelRankId(level)}`);
}

export function gameTitle(tr: TranslateFn, key: GameKey): string {
  return tr(`game.${key}.title`);
}

export function gameTagline(tr: TranslateFn, key: GameKey): string {
  return tr(`game.${key}.tagline`);
}

export function gameRules(tr: TranslateFn, key: GameKey): string {
  return tr(`game.${key}.rules`);
}

export function achievementTitle(tr: TranslateFn, id: string): string {
  return tr(`achievement.${id}.title` as Parameters<TranslateFn>[0]);
}

export function achievementDescription(tr: TranslateFn, id: string): string {
  return tr(`achievement.${id}.description` as Parameters<TranslateFn>[0]);
}

export function questTitle(tr: TranslateFn, key: string): string {
  return tr(`quest.${key}.title` as Parameters<TranslateFn>[0]);
}

/** Named German form tag ("Partizip II"), or null for tags with no label. */
export function formLabel(tr: TranslateFn, tag: string | undefined | null): string | null {
  return isFormTag(tag) ? tr(`form.${tag}`) : null;
}

/** "10 Min" / "3 Tage" / "5 Mon." for the review rating buttons. */
export function intervalLabel(tr: TranslateFn, preview: IntervalPreview): string {
  return tr(`interval.${preview.unit}`, { count: preview.count });
}

const WEEKDAY_SHORT_KEYS = [
  'weekdayShort.mon',
  'weekdayShort.tue',
  'weekdayShort.wed',
  'weekdayShort.thu',
  'weekdayShort.fri',
  'weekdayShort.sat',
  'weekdayShort.sun',
] as const;

/** "Heute" / "Morgen" / "Fr." for a forecast row. */
export function forecastLabelText(tr: TranslateFn, label: ForecastLabel): string {
  if (label.kind === 'today') return tr('forecast.today');
  if (label.kind === 'tomorrow') return tr('forecast.tomorrow');
  return tr(WEEKDAY_SHORT_KEYS[label.index] ?? 'weekdayShort.mon');
}

/** Label for an example-sentence tag; unknown tags show as-is. */
export function exampleTagLabel(tr: TranslateFn, tag: string): string {
  return isExampleTag(tag) ? tr(`exampleTag.${tag}`) : tag;
}
