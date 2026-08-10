/**
 * "Weiter im Lernpfad" — turns the path map plus placement into the single
 * node Home should offer to resume. Pure rules, no RN imports, no clocks;
 * inputs are structural so both pathRepo rows and test fixtures fit.
 */

import { computeNodeStates, currentPosition } from '@/logic/path';

export interface ResumeNode {
  slug: string;
  title: string;
  /** Global 0-based position along the whole path. */
  order: number;
  /** 0 = not completed, else best run 1–3. */
  stars: number;
}

export interface ResumeUnit {
  slug: string;
  title: string;
  emoji: string;
  level: string;
  nodes: ResumeNode[];
}

/** Shape-compatible with pathRepo's PathPlacement. */
export type PlacementLike =
  | { skipped: true }
  | { boundaryUnitSlug: string | null; boundaryOrder: number };

export interface PathResume {
  slug: string;
  title: string;
  unitTitle: string;
  unitEmoji: string;
  unitLevel: string;
}

/**
 * Boundary by unit slug when possible (stable across curriculum growth);
 * the stored order covers the all-or-nothing extremes.
 */
export function resolveBoundaryOrder(
  units: ResumeUnit[],
  placement: PlacementLike | null
): number | null {
  if (!placement || !('boundaryUnitSlug' in placement)) return null;
  const unit = units.find((u) => u.slug === placement.boundaryUnitSlug);
  return unit?.nodes[0]?.order ?? placement.boundaryOrder ?? null;
}

/** The map's active node as a Home-renderable target, or null when the path is done/empty. */
export function findPathResume(
  units: ResumeUnit[],
  boundaryOrder: number | null
): PathResume | null {
  if (units.length === 0) return null;
  const allNodes = units.flatMap((u) => u.nodes);
  const active = currentPosition(
    computeNodeStates(
      allNodes.map((n) => ({ slug: n.slug, order: n.order, stars: n.stars })),
      boundaryOrder
    )
  );
  if (!active) return null;
  const unit = units.find((u) => u.nodes.some((n) => n.slug === active.slug))!;
  const node = unit.nodes.find((n) => n.slug === active.slug)!;
  return {
    slug: node.slug,
    title: node.title,
    unitTitle: unit.title,
    unitEmoji: unit.emoji,
    unitLevel: unit.level,
  };
}
