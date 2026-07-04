import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useSettings, type ThemePreference } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const NEW_LIMITS = [5, 10, 20];
const SESSION_CAPS = [20, 30, 50];

export default function SettingsScreen() {
  const t = useTheme();
  const settings = useSettings();

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="title">Einstellungen</AppText>

      <Card style={styles.section}>
        <AppText variant="subtitle">Design</AppText>
        <View style={styles.segmentRow}>
          {THEME_OPTIONS.map((opt) => {
            const selected = settings.themePreference === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => settings.setThemePreference(opt.value)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <AppText variant="secondary" color={selected ? t.onPrimaryDim : t.inkMuted}>
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">Haptik</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              Vibration bei richtigen/falschen Antworten
            </AppText>
          </View>
          <Switch
            value={settings.hapticsEnabled}
            onValueChange={settings.setHapticsEnabled}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">Neue Karten pro Tag</AppText>
        <View style={styles.segmentRow}>
          {NEW_LIMITS.map((n) => {
            const selected = settings.dailyNewLimit === n;
            return (
              <Pressable
                key={n}
                onPress={() => settings.setDailyNewLimit(n)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <AppText variant="secondary" color={selected ? t.onPrimaryDim : t.inkMuted}>
                  {n}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">Karten pro Lernsession</AppText>
        <View style={styles.segmentRow}>
          {SESSION_CAPS.map((n) => {
            const selected = settings.sessionCap === n;
            return (
              <Pressable
                key={n}
                onPress={() => settings.setSessionCap(n)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <AppText variant="secondary" color={selected ? t.onPrimaryDim : t.inkMuted}>
                  {n}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">Über LernGerman</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 6, lineHeight: 21 }}>
          Offline Deutsch-Lern-App: Wörterbuch (Goethe A1/A2-Wortschatz), Karteikarten
          mit Spaced Repetition und Grammatik-Übungen zu den Fällen. Alle Daten bleiben
          auf deinem Gerät.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  section: { marginTop: spacing.md },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  segment: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
