import { Pressable, StyleSheet, View } from 'react-native';

import { CEFR_LEVELS, useThemeFilter } from '@/store/themeFilter';
import { AppText } from '@/ui/components/AppText';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** CEFR level toggles for the Themen screens — drives the shared filter store. */
export function LevelFilter() {
  const t = useTheme();
  const { levels, toggle } = useThemeFilter();
  const selected = new Set(levels);
  return (
    <View style={styles.row}>
      {CEFR_LEVELS.map((lvl) => {
        const on = selected.has(lvl);
        return (
          <Pressable
            key={lvl}
            onPress={() => toggle(lvl)}
            style={[
              styles.chip,
              { backgroundColor: on ? t.primaryDim : t.surface, borderColor: on ? t.primary : t.line },
            ]}>
            <AppText
              variant="caption"
              color={on ? t.onPrimaryDim : t.inkMuted}
              style={{ fontFamily: fonts.extrabold }}>
              {lvl}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 8,
    alignItems: 'center',
  },
});
