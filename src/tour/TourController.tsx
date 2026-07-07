import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { resumeIndexFor, TOUR_STEPS } from '@/logic/tour';
import { useSettings } from '@/store/settings';
import { useTourStore } from '@/tour/tourStore';
import { AppText } from '@/ui/components/AppText';
import { TourFinish } from '@/ui/components/tour/TourFinish';
import { TourOverlay } from '@/ui/components/tour/TourOverlay';
import { TourWelcome } from '@/ui/components/tour/TourWelcome';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme, useThemeName } from '@/ui/useTheme';

/** How long a step waits for its target to report a rect before falling
 * back to a centered card (navigation transitions, missing elements). */
const RECT_TIMEOUT_MS = 700;

/**
 * Root-mounted driver of the first-run tour: auto-start, route tracking,
 * and rendering of the welcome/spotlight/finish layers. Lives as a sibling
 * of the navigator so the overlay covers tabs and pushed screens alike.
 */
export function TourController() {
  const status = useTourStore((s) => s.status);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const offRoute = useTourStore((s) => s.offRoute);
  const rects = useTourStore((s) => s.rects);
  const pathname = usePathname();
  const { height: sh } = useWindowDimensions();
  const haptics = useSettings((s) => s.hapticsEnabled);

  // First launch: offer the tour once the home screen has settled.
  useEffect(() => {
    if (useSettings.getState().hasSeenTour) return;
    const id = setTimeout(() => useTourStore.getState().showWelcome(), 600);
    return () => clearTimeout(id);
  }, []);

  // Route changes advance navigation steps and detect wandering off.
  useEffect(() => {
    useTourStore.getState().onRouteChange(pathname);
  }, [pathname]);

  // Per-step housekeeping: haptic tick, drop the keyboard (it covers the
  // results list right after the search step), re-check the route.
  const prevStep = useRef(stepIndex);
  useEffect(() => {
    if (status === 'running' && prevStep.current !== stepIndex) {
      Keyboard.dismiss();
      if (haptics) Haptics.selectionAsync().catch(() => {});
      useTourStore.getState().onRouteChange(pathname);
    }
    prevStep.current = stepIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, status]);

  // Celebrate the finish; drop the keyboard when the tour ends mid-typing.
  useEffect(() => {
    if (status === 'finish' || status === 'idle') Keyboard.dismiss();
    if (status === 'finish' && haptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Give each step's target a beat to report its rect before falling back.
  const [waitedStep, setWaitedStep] = useState(-1);
  useEffect(() => {
    if (status !== 'running') return;
    const id = setTimeout(() => setWaitedStep(stepIndex), RECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [stepIndex, status]);
  const waited = waitedStep === stepIndex;

  const step = status === 'running' ? TOUR_STEPS[stepIndex] : undefined;
  const raw = step ? rects[step.targetId] : undefined;
  // A stale rect from another tab or a scrolled-away card is worse than
  // none — only spotlight targets actually inside the viewport.
  const rect =
    raw && raw.y > -8 && raw.y + raw.height < sh + 8 && raw.width > 0 ? raw : null;

  const store = useTourStore.getState();

  return (
    <>
      <TourWelcome
        visible={status === 'welcome'}
        onStart={() => {
          router.navigate('/');
          store.begin();
        }}
        onSkip={store.skip}
      />

      {step && !offRoute && (rect || waited) && (
        <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
          <TourOverlay
            step={step}
            rect={rect}
            index={stepIndex}
            total={TOUR_STEPS.length}
            onNext={rect ? store.next : store.forceNext}
            onSkip={store.skip}
            forceNext={!rect}
          />
        </View>
      )}

      {status === 'running' && offRoute && <OffRouteCard stepIndex={stepIndex} />}

      <TourFinish
        visible={status === 'finish'}
        onClose={() => {
          store.closeFinish();
          router.navigate('/');
        }}
      />
    </>
  );
}

/** Shown when the user navigates away mid-tour: resume or bow out. */
function OffRouteCard({ stepIndex }: { stepIndex: number }) {
  const t = useTheme();
  const dark = useThemeName() === 'dark';

  const resume = () => {
    const target = TOUR_STEPS[resumeIndexFor(TOUR_STEPS, stepIndex)];
    // Resume routes are always tab roots ('/', '/dictionary', …) — the
    // word-detail steps resolve back to the dictionary search.
    router.navigate((target?.route ?? '/') as never);
    useTourStore.getState().resume();
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        { backgroundColor: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)' },
      ]}>
      <View style={styles.offRouteCenter}>
        <View style={[styles.offRouteCard, { backgroundColor: t.surface, borderColor: t.line, shadowColor: t.shadow }]}>
          <AppText variant="section" style={{ fontSize: 21 }}>
            Lost the path? 🧭
          </AppText>
          <AppText variant="body" style={{ marginTop: spacing.sm, fontSize: 15, lineHeight: 22 }}>
            No problem — we can pick the tour back up where it makes sense.
          </AppText>
          <View style={styles.offRouteActions}>
            <Pressable onPress={() => useTourStore.getState().skip()} hitSlop={10}>
              <AppText variant="secondary" muted>
                End tour
              </AppText>
            </Pressable>
            <Pressable
              onPress={resume}
              style={({ pressed }) => [
                styles.resumeBtn,
                { backgroundColor: t.primary },
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}>
              <AppText variant="secondary" color="#FFFFFF" style={{ fontFamily: fonts.extrabold }}>
                Resume tour
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000 },
  offRouteCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  offRouteCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  offRouteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  resumeBtn: {
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
});
