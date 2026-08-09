/**
 * Lernpfad map state — pure rules, no RN imports, no clocks.
 *
 * The path is a single global sequence of nodes (lessons & reviews across
 * all units). Progression is linear: a node is reachable once every earlier
 * node is done — or when the Einstufungstest placed the user past it, which
 * unlocks without awarding stars.
 */

export type NodeState = 'locked' | 'open' | 'active' | 'done';

export interface PathNodeInput {
  slug: string;
  /** Global 0-based position along the whole path. */
  order: number;
  /** 0 = not completed, else best run 1–3. */
  stars: number;
}

export interface NodeStateResult {
  slug: string;
  state: NodeState;
  stars: number;
}

/**
 * States for every node.
 * - `done`    — completed at least once (stars ≥ 1).
 * - `active`  — the single "you are here" node: the first not-done node that
 *               is reachable (all earlier done, or placement skipped past it).
 * - `open`    — not done but reachable only because placement skipped it
 *               (nodes before the boundary the user never played).
 * - `locked`  — everything else.
 *
 * `placementBoundaryOrder` is the first order NOT unlocked by placement
 * (null/0 = no placement). Nodes with order < boundary are always reachable.
 */
export function computeNodeStates(
  nodes: PathNodeInput[],
  placementBoundaryOrder: number | null
): NodeStateResult[] {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const boundary = placementBoundaryOrder ?? 0;

  // A node is reachable when every earlier node is satisfied — done, or
  // skipped over by the placement (order < boundary) — or when it is itself
  // inside the placed range.
  const reachable: boolean[] = [];
  let prefixSatisfied = true;
  for (const n of sorted) {
    reachable.push(prefixSatisfied || n.order < boundary);
    if (n.stars === 0 && n.order >= boundary) prefixSatisfied = false;
  }

  // "You are here" prefers the first open node at/after the placement
  // boundary — skipped-over nodes stay quietly playable, the journey
  // continues where the Einstufungstest placed the user.
  let activeIdx = sorted.findIndex(
    (n, i) => n.stars === 0 && reachable[i] && n.order >= boundary
  );
  if (activeIdx === -1) activeIdx = sorted.findIndex((n, i) => n.stars === 0 && reachable[i]);

  return sorted.map((n, i) => ({
    slug: n.slug,
    state:
      n.stars > 0 ? 'done' : i === activeIdx ? 'active' : reachable[i] ? 'open' : 'locked',
    stars: n.stars,
  }));
}

/** The "you are here" node, or null when every node is done. */
export function currentPosition(states: NodeStateResult[]): NodeStateResult | null {
  return states.find((s) => s.state === 'active') ?? null;
}

/** Session accuracy → stars. Completion always earns at least one. */
export function starsForAccuracy(correct: number, total: number): 1 | 2 | 3 {
  if (total <= 0) return 1;
  const ratio = correct / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}

/** Real completions only — placement-skipped nodes don't count as done. */
export function unitProgress(nodes: PathNodeInput[]): { done: number; total: number } {
  return {
    done: nodes.filter((n) => n.stars > 0).length,
    total: nodes.length,
  };
}
