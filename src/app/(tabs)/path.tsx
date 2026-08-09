import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPlacement, listPath, setPlacement, type PathUnit } from '@/db/pathRepo';
import { computeNodeStates, currentPosition } from '@/logic/path';
import { AppText } from '@/ui/components/AppText';
import {
  UnitSegment,
  unitHeight,
  type UnitNodeVM,
  type UnitVM,
} from '@/ui/components/path/UnitSegment';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function PathScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [units, setUnits] = useState<PathUnit[] | null>(null);
  const [boundaryOrder, setBoundaryOrder] = useState<number | null>(null);
  const [showPlacementBanner, setShowPlacementBanner] = useState(false);
  const listRef = useRef<FlatList<UnitVM>>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [path, placement] = await Promise.all([listPath(), getPlacement()]);
        if (!alive) return;
        // Boundary by unit slug when possible (stable across curriculum
        // growth); the stored order covers the all-or-nothing extremes.
        let boundary: number | null = null;
        if (placement && 'boundaryUnitSlug' in placement) {
          const unit = path.find((u) => u.slug === placement.boundaryUnitSlug);
          boundary = unit?.nodes[0]?.order ?? placement.boundaryOrder ?? null;
        }
        const hasProgress = path.some((u) => u.nodes.some((n) => n.stars > 0));
        setShowPlacementBanner(placement == null && !hasProgress);
        setBoundaryOrder(boundary);
        setUnits(path);
      })().catch(() => {});
      return () => {
        alive = false;
      };
    }, [])
  );

  const vms: UnitVM[] = useMemo(() => {
    if (!units) return [];
    const allNodes = units.flatMap((u) => u.nodes);
    const states = new Map(
      computeNodeStates(
        allNodes.map((n) => ({ slug: n.slug, order: n.order, stars: n.stars })),
        boundaryOrder
      ).map((s) => [s.slug, s])
    );
    return units.map((u) => ({
      slug: u.slug,
      title: u.title,
      emoji: u.emoji,
      level: u.level,
      nodes: u.nodes.map((n) => ({
        slug: n.slug,
        title: n.title,
        kind: n.kind,
        order: n.order,
        state: states.get(n.slug)?.state ?? 'locked',
        stars: n.stars,
      })),
    }));
  }, [units, boundaryOrder]);

  const activeUnitIndex = useMemo(() => {
    const allStates = vms.flatMap((u) => u.nodes);
    const active = currentPosition(
      allStates.map((n) => ({ slug: n.slug, state: n.state, stars: n.stars }))
    );
    if (!active) return Math.max(0, vms.length - 1);
    return Math.max(0, vms.findIndex((u) => u.nodes.some((n) => n.slug === active.slug)));
  }, [vms]);

  const onNodePress = (node: UnitNodeVM) => {
    if (node.state === 'locked') return;
    router.push({ pathname: '/lesson/[slug]', params: { slug: node.slug } });
  };

  const getItemLayout = (data: ArrayLike<UnitVM> | null | undefined, index: number) => {
    let offset = 0;
    for (let i = 0; i < index; i++) offset += unitHeight(data?.[i]?.nodes.length ?? 0);
    return { length: unitHeight(data?.[index]?.nodes.length ?? 0), offset, index };
  };

  if (!units) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.titleRow}>
        <AppText variant="title">Lernpfad</AppText>
        <Pressable
          hitSlop={10}
          onPress={() => router.push('/placement')}
          style={[styles.placementBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
          <Ionicons name="speedometer-outline" size={16} color={t.inkMuted} />
          <AppText variant="caption" muted>
            Einstufung
          </AppText>
        </Pressable>
      </View>

      {showPlacementBanner && (
        <View style={[styles.banner, { backgroundColor: t.primaryDim }]}>
          <AppText variant="subtitle" color={t.onPrimaryDim}>
            Schon Vorkenntnisse?
          </AppText>
          <AppText variant="secondary" color={t.onPrimaryDim} style={{ marginTop: 2, opacity: 0.9 }}>
            Mach den Einstufungstest und starte auf deinem Niveau — oder fang ganz vorne an.
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <Pressable
              onPress={() => router.push('/placement')}
              style={[styles.bannerBtn, { backgroundColor: t.primary }]}>
              <AppText variant="secondary" color="#fff" style={{ fontFamily: fonts.extrabold }}>
                Einstufungstest
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setPlacement({ skipped: true }).catch(() => {});
                setShowPlacementBanner(false);
              }}
              style={[styles.bannerBtn, { backgroundColor: t.surface }]}>
              <AppText variant="secondary" style={{ fontFamily: fonts.extrabold }}>
                Bei Null anfangen
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={vms}
        keyExtractor={(u) => u.slug}
        renderItem={({ item }) => <UnitSegment unit={item} onNodePress={onNodePress} />}
        getItemLayout={getItemLayout}
        initialScrollIndex={activeUnitIndex}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={{ paddingBottom: spacing.xxl, paddingTop: spacing.md }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  placementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 18,
    padding: spacing.lg,
  },
  bannerBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
