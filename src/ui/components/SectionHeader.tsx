import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface SectionHeaderProps {
  title: string;
  /** Right-side action label; defaults to "Alle". Hidden without onAction. */
  actionLabel?: string;
  onAction?: () => void;
}

/** Shelf/section heading with the "Alle ›" see-all affordance. */
export function SectionHeader({ title, actionLabel = 'Alle', onAction }: SectionHeaderProps) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <AppText variant="subtitle" style={{ fontFamily: fonts.extrabold, fontSize: 19 }}>
        {title}
      </AppText>
      {onAction && (
        <Pressable hitSlop={8} onPress={onAction} style={styles.action}>
          <AppText variant="secondary" muted style={{ fontFamily: fonts.bold }}>
            {actionLabel}
          </AppText>
          <Ionicons name="chevron-forward" size={15} color={t.inkMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
