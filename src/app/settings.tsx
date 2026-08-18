import Ionicons from '@expo/vector-icons/Ionicons';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { resolveLocale, systemLocale, translate, useTr, type TranslationKey } from '@/i18n';
import { ENABLED_LOCALES, LOCALE_META, type LanguagePreference } from '@/i18n/locales';
import { applyRtlAndReload, needsRtlRestart } from '@/i18n/rtl';
import { colorThemeLabel } from '@/i18n/labels';
import { CEFR_LEVELS } from '@/logic/levels';
import { backupAvailable, exportBackupFile, importBackupFile } from '@/services/backup';
import { useSettings, type ThemePreference } from '@/store/settings';
import { useTourStore } from '@/tour/tourStore';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { colorThemeNames, colorThemes, fonts, spacing } from '@/ui/theme';
import { useTheme, useThemeName } from '@/ui/useTheme';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

const DONATE_URL = 'https://ko-fi.com/bbolek';

const NEW_LIMITS = [5, 10, 20];
const SESSION_CAPS = [20, 30, 50];

/** Monday-first, matching how German (and most European) calendars read. */
const DAY_OPTIONS = [
  { value: 1, labelKey: 'settings.day.mon' },
  { value: 2, labelKey: 'settings.day.tue' },
  { value: 3, labelKey: 'settings.day.wed' },
  { value: 4, labelKey: 'settings.day.thu' },
  { value: 5, labelKey: 'settings.day.fri' },
  { value: 6, labelKey: 'settings.day.sat' },
  { value: 0, labelKey: 'settings.day.sun' },
] as const satisfies { value: number; labelKey: TranslationKey }[];

const INTERVAL_OPTIONS = [
  { value: 30, labelKey: 'settings.interval.30' },
  { value: 60, labelKey: 'settings.interval.60' },
  { value: 180, labelKey: 'settings.interval.180' },
  { value: 360, labelKey: 'settings.interval.360' },
] as const satisfies { value: number; labelKey: TranslationKey }[];

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

const THEME_LABEL_KEYS = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
} as const satisfies Record<ThemePreference, TranslationKey>;

export default function SettingsScreen() {
  const t = useTheme();
  const tr = useTr();
  const settings = useSettings();

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          {tr('common.back')}
        </AppText>
      </Pressable>
      <AppText variant="title">{tr('settings.title')}</AppText>

      <LanguageCard />

      <SectionLabel>{tr('settings.section.appearance')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="caption" muted>
          {tr('settings.theme')}
        </AppText>
        <View style={styles.segmentRow}>
          {THEME_OPTIONS.map((option) => {
            const selected = settings.themePreference === option;
            return (
              <Pressable
                key={option}
                onPress={() => settings.setThemePreference(option)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <AppText variant="secondary" color={selected ? t.onPrimaryDim : t.inkMuted}>
                  {tr(THEME_LABEL_KEYS[option])}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
          {tr('settings.color', {
            name: colorThemeLabel(tr, settings.colorTheme),
          })}
        </AppText>
        <ColorPicker />
      </Card>

      <SectionLabel>{tr('settings.section.profile')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.playerName')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('settings.playerName.caption')}
        </AppText>
        <TextInput
          value={settings.userName}
          onChangeText={settings.setUserName}
          maxLength={24}
          autoCorrect={false}
          placeholder={Device.deviceName?.trim() || tr('settings.playerName.placeholder')}
          placeholderTextColor={t.inkFaint}
          style={[styles.nameInput, { backgroundColor: t.surface, borderColor: t.line, color: t.ink }]}
        />
      </Card>

      <SectionLabel>{tr('settings.section.learning')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.userLevel')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('settings.userLevel.caption')}
        </AppText>
        <View style={styles.segmentRow}>
          {CEFR_LEVELS.map((level) => {
            const selected = settings.userLevel === level;
            return (
              <Pressable
                key={level}
                onPress={() => settings.setUserLevel(level)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <AppText variant="caption" color={selected ? t.onPrimaryDim : t.inkMuted}>
                  {level}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Divider />

        <AppText variant="caption" muted>
          {tr('settings.newPerDay')}
        </AppText>
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

        <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
          {tr('settings.sessionCap')}
        </AppText>
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

        <Divider />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{tr('settings.typedRecall')}</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {tr('settings.typedRecall.caption')}
            </AppText>
          </View>
          <Switch
            value={settings.typedRecall}
            onValueChange={settings.setTypedRecall}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <SectionLabel>{tr('settings.section.reminders')}</SectionLabel>
      <Card style={styles.section}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{tr('settings.notifications')}</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {tr('settings.notifications.caption')}
            </AppText>
          </View>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={settings.setNotificationsEnabled}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>

        {settings.notificationsEnabled && settings.notificationStatus === 'permission-denied' && (
          <View style={[styles.permissionWarning, { backgroundColor: t.dangerDim }]}>
            <AppText variant="caption" color={t.onDangerDim}>
              {tr('settings.notifications.denied')}
            </AppText>
          </View>
        )}

        {settings.notificationsEnabled && (
          <>
            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              {tr('settings.notifications.days')}
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
                      {tr(d.labelKey)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              {tr('settings.notifications.window')}
            </AppText>
            <View style={styles.hourRow}>
              <HourStepper
                value={settings.notificationStartHour}
                onChange={settings.setNotificationStartHour}
                max={settings.notificationEndHour - 1}
              />
              <AppText variant="secondary" muted>
                {tr('settings.notifications.until')}
              </AppText>
              <HourStepper
                value={settings.notificationEndHour}
                onChange={settings.setNotificationEndHour}
                min={settings.notificationStartHour + 1}
              />
            </View>

            <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
              {tr('settings.notifications.interval')}
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
                      {tr(opt.labelKey)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      <SectionLabel>{tr('settings.section.sound')}</SectionLabel>
      <Card style={styles.section}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{tr('settings.sound')}</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {tr('settings.sound.caption')}
            </AppText>
          </View>
          <Switch
            value={settings.soundEnabled}
            onValueChange={settings.setSoundEnabled}
            trackColor={{ true: t.primary, false: t.line }}
            thumbColor="#fff"
          />
        </View>

        <Divider />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{tr('settings.haptics')}</AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              {tr('settings.haptics.caption')}
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

      <BackupCard />

      <SectionLabel>{tr('settings.section.help')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.guide')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('settings.guide.caption')}
        </AppText>
        <Pressable
          onPress={() => {
            router.back();
            useTourStore.getState().showWelcome();
          }}
          style={({ pressed }) => [
            styles.guideBtn,
            { backgroundColor: pressed ? t.primaryDim : t.surface, borderColor: t.primary },
          ]}>
          <Ionicons name="compass-outline" size={18} color={t.primary} />
          <AppText variant="secondary" color={t.primary}>
            {tr('settings.guide.cta')}
          </AppText>
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.about')}</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 6, lineHeight: 21 }}>
          {tr('settings.about.body')}
        </AppText>
        <AppText variant="caption" muted style={{ marginTop: spacing.md, lineHeight: 17 }}>
          {tr('settings.about.credits')}
        </AppText>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.donate')}</AppText>
        <AppText variant="secondary" muted style={{ marginTop: 6, lineHeight: 21 }}>
          {tr('settings.donate.body')}
        </AppText>
        <Pressable
          onPress={() => Linking.openURL(DONATE_URL)}
          style={({ pressed }) => [
            styles.guideBtn,
            { backgroundColor: pressed ? t.primaryDim : t.surface, borderColor: t.primary },
          ]}>
          <Ionicons name="heart" size={18} color={t.primary} />
          <AppText variant="secondary" color={t.primary}>
            {tr('settings.donate.cta')}
          </AppText>
        </Pressable>
      </Card>
    </Screen>
  );
}

/**
 * App language. Switching to or from Arabic flips the layout direction,
 * which React Native only applies on a fresh start — so that one case asks
 * first and then restarts the app.
 */
function LanguageCard() {
  const t = useTheme();
  const tr = useTr();
  const uiLanguage = useSettings((s) => s.uiLanguage);
  const setUiLanguage = useSettings((s) => s.setUiLanguage);

  const choose = (preference: LanguagePreference) => {
    if (preference === uiLanguage) return;
    const next = resolveLocale(preference);
    if (!needsRtlRestart(next)) {
      setUiLanguage(preference);
      return;
    }
    // Ask in the language being switched to — that is what the user just
    // picked, and it is the one they can read after the restart.
    Alert.alert(
      translate(next, 'settings.language.restartTitle'),
      translate(next, 'settings.language.restartBody'),
      [
        { text: translate(next, 'common.cancel'), style: 'cancel' },
        {
          text: translate(next, 'common.continue'),
          onPress: () => {
            setUiLanguage(preference);
            applyRtlAndReload(next).catch(() => {});
          },
        },
      ]
    );
  };

  const options: LanguagePreference[] = ['system', ...ENABLED_LOCALES];

  return (
    <>
      <SectionLabel>{tr('settings.section.language')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.language.label')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('settings.language.caption')}
        </AppText>
        <View style={styles.languageList}>
          {options.map((option) => {
            const selected = uiLanguage === option;
            const isSystem = option === 'system';
            return (
              <Pressable
                key={option}
                onPress={() => choose(option)}
                style={[
                  styles.languageRow,
                  {
                    backgroundColor: selected ? t.primaryDim : t.surface,
                    borderColor: selected ? t.primary : t.line,
                  },
                ]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="secondary" color={selected ? t.onPrimaryDim : t.ink}>
                    {isSystem
                      ? tr('settings.language.system')
                      : LOCALE_META[option].nativeName}
                  </AppText>
                  {isSystem && (
                    <AppText variant="caption" muted style={{ marginTop: 1 }}>
                      {tr('settings.language.systemCaption', {
                        name: LOCALE_META[systemLocale()].nativeName,
                      })}
                    </AppText>
                  )}
                </View>
                {selected && <Ionicons name="checkmark" size={18} color={t.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Card>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <AppText variant="caption" muted style={styles.sectionLabel}>
      {children}
    </AppText>
  );
}

function Divider() {
  const t = useTheme();
  return <View style={[styles.divider, { backgroundColor: t.line }]} />;
}

/** Swatch grid for the primary/accent color pair. */
function ColorPicker() {
  const t = useTheme();
  const tr = useTr();
  const themeName = useThemeName();
  const colorTheme = useSettings((s) => s.colorTheme);
  const setColorTheme = useSettings((s) => s.setColorTheme);

  return (
    <View style={styles.swatchRow}>
      {colorThemeNames.map((name) => {
        const selected = colorTheme === name;
        const tokens = colorThemes[name][themeName];
        return (
          <Pressable
            key={name}
            onPress={() => setColorTheme(name)}
            accessibilityLabel={colorThemeLabel(tr, name)}
            hitSlop={4}
            style={[
              styles.swatch,
              { backgroundColor: tokens.primary, borderColor: selected ? t.ink : 'transparent' },
            ]}>
            <View style={[styles.swatchAccent, { backgroundColor: tokens.accent }]} />
            {selected && (
              <Ionicons name="checkmark" size={16} color="#fff" style={styles.swatchCheck} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function BackupCard() {
  const t = useTheme();
  const tr = useTr();
  const [busy, setBusy] = useState(false);
  // Stable per mount: whether the installed binary has the backup native modules.
  const [available] = useState(backupAvailable);
  if (!available) return null;

  const onExport = async () => {
    setBusy(true);
    try {
      await exportBackupFile();
    } catch (err) {
      Alert.alert(tr('settings.backup.failed'), err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onImport = () => {
    Alert.alert(
      tr('settings.backup.confirmTitle'),
      tr('settings.backup.confirmBody'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('settings.backup.confirmCta'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const summary = await importBackupFile();
              if (summary) {
                await useSettings.getState().hydrate();
                Alert.alert(
                  tr('settings.backup.restoredTitle'),
                  tr('settings.backup.restoredBody', { count: summary.restored }) +
                    (summary.dropped > 0
                      ? ` ${tr('settings.backup.restoredDropped', { count: summary.dropped })}`
                      : '')
                );
              }
            } catch (err) {
              Alert.alert(
                tr('settings.backup.restoreFailed'),
                err instanceof Error ? err.message : String(err)
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <SectionLabel>{tr('settings.section.data')}</SectionLabel>
      <Card style={styles.section}>
        <AppText variant="subtitle">{tr('settings.backup')}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {tr('settings.backup.caption')}
        </AppText>
        <Pressable
          disabled={busy}
          onPress={onExport}
          style={({ pressed }) => [
            styles.guideBtn,
            {
              backgroundColor: pressed ? t.primaryDim : t.surface,
              borderColor: t.primary,
              opacity: busy ? 0.5 : 1,
            },
          ]}>
          <Ionicons name="share-outline" size={18} color={t.primary} />
          <AppText variant="secondary" color={t.primary}>
            {tr('settings.backup.export')}
          </AppText>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={onImport}
          style={({ pressed }) => [
            styles.guideBtn,
            {
              backgroundColor: pressed ? t.primaryDim : t.surface,
              borderColor: t.line,
              opacity: busy ? 0.5 : 1,
            },
          ]}>
          <Ionicons name="download-outline" size={18} color={t.inkMuted} />
          <AppText variant="secondary" muted>
            {tr('settings.backup.restore')}
          </AppText>
        </Pressable>
      </Card>
    </>
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
  sectionLabel: {
    marginTop: spacing.lg,
    marginLeft: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: fonts.bold,
  },
  divider: { height: 1, marginVertical: spacing.lg },
  permissionWarning: {
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginTop: spacing.md,
  },
  nameInput: {
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: spacing.md,
  },
  languageList: { gap: spacing.sm, marginTop: spacing.md },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  segment: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
    marginTop: spacing.md,
  },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchAccent: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  swatchCheck: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 3,
  },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: 11,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
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
