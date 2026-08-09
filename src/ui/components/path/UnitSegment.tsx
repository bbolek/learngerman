import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { type NodeStateResult } from '@/logic/path';
import { AppText } from '@/ui/components/AppText';
import { Chip } from '@/ui/components/Chip';
import { HerePill, NODE_SIZE, PathNode } from '@/ui/components/path/PathNode';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** Fixed geometry so the FlatList can getItemLayout without measuring. */
export const UNIT_HEADER_HEIGHT = 86;
export const NODE_SPACING = 96;
export const UNIT_BOTTOM_PAD = 18;
/** Horizontal snake amplitude around the center line. */
const AMPLITUDE = 68;
/** Radians per node along the global path — gives the snaking rhythm. */
const WAVE = 0.85;

export function unitHeight(nodeCount: number): number {
  return UNIT_HEADER_HEIGHT + nodeCount * NODE_SPACING + UNIT_BOTTOM_PAD;
}

export interface UnitNodeVM {
  slug: string;
  title: string;
  kind: 'lesson' | 'review';
  /** Global node order — drives the snake phase across unit boundaries. */
  order: number;
  state: NodeStateResult['state'];
  stars: number;
}

export interface UnitVM {
  slug: string;
  title: string;
  emoji: string;
  level: string;
  nodes: UnitNodeVM[];
}

/**
 * One unit of the path map: a header card and its nodes laid on a sine
 * "snake", connected by an SVG path. One SVG per unit keeps the list
 * virtualizable — never one giant canvas.
 */
export function UnitSegment({
  unit,
  onNodePress,
}: {
  unit: UnitVM;
  onNodePress: (node: UnitNodeVM) => void;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const centerX = width / 2;

  const pointFor = (i: number) => ({
    x: centerX + AMPLITUDE * Math.sin(unit.nodes[i].order * WAVE),
    y: UNIT_HEADER_HEIGHT + i * NODE_SPACING + NODE_SIZE / 2,
  });

  const done = unit.nodes.filter((n) => n.stars > 0).length;
  const height = unitHeight(unit.nodes.length);

  return (
    <View style={{ height }}>
      <View style={[styles.header, { backgroundColor: t.surface, borderColor: t.line }]}>
        <AppText style={{ fontSize: 30 }}>{unit.emoji}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {unit.title}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
            <Chip label={unit.level} kind="level" small />
            <AppText variant="caption" muted>
              {done}/{unit.nodes.length} Lektionen
            </AppText>
          </View>
        </View>
        <ProgressRing progress={unit.nodes.length === 0 ? 0 : done / unit.nodes.length} size={40} strokeWidth={5} color={t.accent} />
      </View>

      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {unit.nodes.slice(0, -1).map((n, i) => {
          const a = pointFor(i);
          const b = pointFor(i + 1);
          const midY = (a.y + b.y) / 2;
          const reached = unit.nodes[i + 1].state === 'done' || unit.nodes[i].state === 'done';
          return (
            <Path
              key={n.slug}
              d={`M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`}
              stroke={reached ? t.accent : t.line}
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
      </Svg>

      {unit.nodes.map((n, i) => {
        const p = pointFor(i);
        return (
          <View
            key={n.slug}
            style={{
              position: 'absolute',
              left: p.x - NODE_SIZE / 2,
              top: p.y - NODE_SIZE / 2,
              alignItems: 'center',
            }}>
            {n.state === 'active' && (
              <View style={styles.pillWrap} pointerEvents="none">
                <HerePill level={unit.level} />
              </View>
            )}
            <PathNode state={n.state} stars={n.stars} kind={n.kind} onPress={() => onNodePress(n)} />
            <AppText
              variant="caption"
              muted={n.state === 'locked'}
              numberOfLines={1}
              style={{ marginTop: 3, maxWidth: 130, textAlign: 'center' }}>
              {n.title}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    height: UNIT_HEADER_HEIGHT - spacing.md,
  },
  pillWrap: {
    position: 'absolute',
    top: -30,
    zIndex: 2,
    width: 220,
    alignItems: 'center',
  },
});
