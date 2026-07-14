import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listAchievements, type AchievementStatus } from '@/db/achievementsRepo';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function AchievementsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<AchievementStatus[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listAchievements(new Date()).then(setItems).catch(() => {});
    }, [])
  );

  const earned = items?.filter((a) => a.unlockedAt != null) ?? [];
  const locked = items?.filter((a) => a.unlockedAt == null) ?? [];

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="title">Abzeichen</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 2 }}>
        {items ? `${earned.length} von ${items.length} freigeschaltet` : '…'}
      </AppText>

      {earned.length > 0 && (
        <View style={styles.grid}>
          {earned.map((a) => (
            <Badge key={a.def.id} item={a} />
          ))}
        </View>
      )}

      {locked.length > 0 && (
        <>
          <AppText variant="label" muted style={{ marginTop: spacing.xl }}>
            Noch zu holen
          </AppText>
          <View style={styles.grid}>
            {locked.map((a) => (
              <Badge key={a.def.id} item={a} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function Badge({ item }: { item: AchievementStatus }) {
  const t = useTheme();
  const unlocked = item.unlockedAt != null;
  const ratio = item.target === 0 ? 0 : item.current / item.target;
  return (
    <Card style={[styles.badge, !unlocked && { opacity: 0.75 }]}>
      <View
        style={[
          styles.badgeIcon,
          { backgroundColor: unlocked ? t.primaryDim : t.line },
        ]}>
        <AppText style={{ fontSize: 26, opacity: unlocked ? 1 : 0.45 }}>{item.def.emoji}</AppText>
      </View>
      <AppText
        variant="secondary"
        style={{ fontFamily: fonts.extrabold, textAlign: 'center', marginTop: spacing.sm }}
        numberOfLines={1}>
        {item.def.title}
      </AppText>
      <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: 2 }} numberOfLines={2}>
        {item.def.description}
      </AppText>
      {unlocked ? (
        <View style={[styles.badgeState, { backgroundColor: t.successDim }]}>
          <AppText variant="caption" color={t.onSuccessDim} style={{ fontFamily: fonts.extrabold }}>
            ✓ Geschafft
          </AppText>
        </View>
      ) : (
        <>
          <View style={[styles.progressTrack, { backgroundColor: t.line }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(Math.min(1, ratio) * 100)}%`, backgroundColor: t.primary },
              ]}
            />
          </View>
          <AppText variant="caption" muted style={{ marginTop: 4 }}>
            {item.current}/{item.target}
          </AppText>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  badge: {
    width: '47.6%',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeState: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: 999 },
});
