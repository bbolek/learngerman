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

const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'So' },
];

const INTERVAL_OPTIONS = [
  { value: 30, label: '30 Min' },
  { value: 60, label: '1 Std' },
  { value: 180, label: '3 Std' },
  { value: 360, label: '6 Std' },
];

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

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
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">Vokabel-Erinnerungen</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              Push-Benachrichtigung mit einem gespeicherten Wort + Beispiel
            </AppText>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={settings.setNotificationsEnabled}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>

        {settings.notificationsEnabled && (
          <>
            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              Tage
            </AppText>
            <View style={styles.segmentRow}>
              {DAY_OPTIONS.map((d) => {
                const selected = settings.notificationDays.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => {
                      const next = selected
                        ? settings.notificationDays.filter((v) => v !== d.value)
                        : [...settings.notificationDays, d.value];
                      settings.setNotificationDays(next);
                    }}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: selected ? t.primaryDim : t.surface,
                        borderColor: selected ? t.primary : t.line,
                      },
                    ]}>
                    <AppText variant="caption" color={selected ? t.onPrimaryDim : t.inkMuted}>
                      {d.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              Zeitfenster
            </AppText>
            <View style={styles.hourRow}>
              <HourStepper
                value={settings.notificationStartHour}
                onChange={settings.setNotificationStartHour}
                max={settings.notificationEndHour - 1}
              />
              <AppText variant="secondary" muted>
                bis
              </AppText>
              <HourStepper
                value={settings.notificationEndHour}
                onChange={settings.setNotificationEndHour}
                min={settings.notificationStartHour + 1}
              />
            </View>

            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              Intervall
            </AppText>
            <View style={styles.segmentRow}>
              {INTERVAL_OPTIONS.map((opt) => {
                const selected = settings.notificationIntervalMinutes === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => settings.setNotificationIntervalMinutes(opt.value)}
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
          </>
        )}
      </Card>

      <Card style={styles.section}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">Gelernte Wörter anzeigen</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              Zeigt als „Gelernt" markierte Wörter in Meine Wörter, damit du sie wieder entmarkieren kannst
            </AppText>
          </View>
          <Switch
            value={settings.showLearnedWords}
            onValueChange={settings.setShowLearnedWords}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">Über Deutschly</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 6, lineHeight: 21 }}>
          Offline Deutsch-Lern-App: Wörterbuch (Goethe A1/A2-Wortschatz), Karteikarten
          mit Spaced Repetition und Grammatik-Übungen zu den Fällen. Alle Daten bleiben
          auf deinem Gerät.
        </AppText>
      </Card>
    </Screen>
  );
}

function HourStepper({
  value,
  onChange,
  min = 0,
  max = 23,
}: {
  value: number;
  onChange: (h: number) => void;
  min?: number;
  max?: number;
}) {
  const t = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: t.line }]}>
      <Pressable hitSlop={8} disabled={value <= min} onPress={() => onChange(value - 1)}>
        <Ionicons name="remove" size={16} color={value <= min ? t.inkFaint : t.ink} />
      </Pressable>
      <AppText variant="secondary" style={{ minWidth: 44, textAlign: 'center' }}>
        {formatHour(value)}
      </AppText>
      <Pressable hitSlop={8} disabled={value >= max} onPress={() => onChange(value + 1)}>
        <Ionicons name="add" size={16} color={value >= max ? t.inkFaint : t.ink} />
      </Pressable>
    </View>
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
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
});
