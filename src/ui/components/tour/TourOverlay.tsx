import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { isActionStep, type TourStepDef } from '@/logic/tour';
import { type TargetRect } from '@/tour/tourStore';
import { TourTooltip } from '@/ui/components/tour/TourTooltip';
import { radius, spacing } from '@/ui/theme';
import { useTheme, useThemeName } from '@/ui/useTheme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Breathing room between the target and the spotlight edge. */
const HOLE_PAD = spacing.sm;
/** Gap between the spotlight and the tooltip card. */
const TOOLTIP_GAP = 18;
const SPRING = { damping: 19, stiffness: 220 };

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  'worklet';
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + rr},${y}` +
    ` h${w - 2 * rr}` +
    ` a${rr},${rr} 0 0 1 ${rr},${rr}` +
    ` v${h - 2 * rr}` +
    ` a${rr},${rr} 0 0 1 ${-rr},${rr}` +
    ` h${-(w - 2 * rr)}` +
    ` a${rr},${rr} 0 0 1 ${-rr},${-rr}` +
    ` v${-(h - 2 * rr)}` +
    ` a${rr},${rr} 0 0 1 ${rr},${-rr}` +
    ` Z`
  );
}

interface TourOverlayProps {
  step: TourStepDef;
  /** Measured target rect; null renders a centered card with no cutout. */
  rect: TargetRect | null;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  /** Unmeasured-target fallback: show Next even on an action step. */
  forceNext?: boolean;
}

/**
 * The first-run tour spotlight: a dimmed scrim with an animated rounded
 * cutout over the current target. Action steps leave the hole touchable so
 * the user performs the real interaction; info steps block everything but
 * the tooltip.
 */
export function TourOverlay({ step, rect, index, total, onNext, onSkip, forceNext }: TourOverlayProps) {
  const t = useTheme();
  const dark = useThemeName() === 'dark';
  const { width: sw, height: sh } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const hole = rect
    ? {
        x: rect.x - HOLE_PAD,
        y: rect.y - HOLE_PAD,
        w: rect.width + HOLE_PAD * 2,
        h: rect.height + HOLE_PAD * 2,
      }
    : null;

  const hx = useSharedValue(hole?.x ?? sw / 2);
  const hy = useSharedValue(hole?.y ?? sh / 2);
  const hw = useSharedValue(hole?.w ?? 0);
  const hh = useSharedValue(hole?.h ?? 0);
  const hadHole = useRef(hole != null);

  useEffect(() => {
    if (!hole) {
      hw.value = withTiming(0, { duration: 160 });
      hh.value = withTiming(0, { duration: 160 });
      hadHole.current = false;
      return;
    }
    if (hadHole.current) {
      hx.value = withSpring(hole.x, SPRING);
      hy.value = withSpring(hole.y, SPRING);
      hw.value = withSpring(hole.w, SPRING);
      hh.value = withSpring(hole.h, SPRING);
    } else {
      // First spotlight: grow out of the target's center instead of
      // springing across the screen from nowhere.
      hx.value = hole.x + hole.w / 2;
      hy.value = hole.y + hole.h / 2;
      hw.value = 0;
      hh.value = 0;
      hx.value = withSpring(hole.x, SPRING);
      hy.value = withSpring(hole.y, SPRING);
      hw.value = withSpring(hole.w, SPRING);
      hh.value = withSpring(hole.h, SPRING);
      hadHole.current = true;
    }
  }, [hole?.x, hole?.y, hole?.w, hole?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrimProps = useAnimatedProps(() => ({
    d:
      `M0,0 H${sw} V${sh} H0 Z ` +
      (hw.value > 1 && hh.value > 1
        ? roundedRectPath(hx.value, hy.value, hw.value, hh.value, radius.card)
        : ''),
  }));

  // Pulsing ring drawing the eye to the spotlight on action steps.
  const interactive = isActionStep(step) && !forceNext && hole != null;
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [pulse, step.id]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.85 - pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.035 }],
  }));

  // Tooltip above or below the spotlight, whichever half has more room.
  const below = hole ? hole.y + hole.h / 2 < sh * 0.55 : false;
  const tooltipStyle = hole
    ? below
      ? {
          top: Math.max(hole.y + hole.h + TOOLTIP_GAP, insets.top + spacing.md),
          left: spacing.lg,
          right: spacing.lg,
        }
      : {
          bottom: Math.max(sh - hole.y + TOOLTIP_GAP, insets.bottom + spacing.md),
          left: spacing.lg,
          right: spacing.lg,
        }
    : { top: sh * 0.32, left: spacing.lg, right: spacing.lg };
  const caretX = hole
    ? Math.min(Math.max(hole.x + hole.w / 2 - spacing.lg, 28), sw - spacing.lg * 2 - 28)
    : undefined;

  const blockers = hole
    ? [
        { key: 'top', style: { left: 0, top: 0, width: sw, height: Math.max(hole.y, 0) } },
        {
          key: 'left',
          style: { left: 0, top: hole.y, width: Math.max(hole.x, 0), height: hole.h },
        },
        {
          key: 'right',
          style: {
            left: hole.x + hole.w,
            top: hole.y,
            width: Math.max(sw - hole.x - hole.w, 0),
            height: hole.h,
          },
        },
        {
          key: 'bottom',
          style: { left: 0, top: hole.y + hole.h, width: sw, height: Math.max(sh - hole.y - hole.h, 0) },
        },
        // Info steps: the spotlighted element is show-and-tell, not tappable.
        ...(!interactive
          ? [{ key: 'cover', style: { left: hole.x, top: hole.y, width: hole.w, height: hole.h } }]
          : []),
      ]
    : [{ key: 'all', style: { left: 0, top: 0, width: sw, height: sh } }];

  return (
    <Animated.View entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Svg width={sw} height={sh} style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedPath
          animatedProps={scrimProps}
          fill={dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)'}
          fillRule="evenodd"
        />
      </Svg>

      {blockers.map((b) => (
        <Pressable key={b.key} style={[styles.blocker, b.style]} onPress={() => {}} />
      ))}

      {interactive && hole && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulse,
            {
              left: hole.x - 4,
              top: hole.y - 4,
              width: hole.w + 8,
              height: hole.h + 8,
              borderColor: t.primary,
            },
            pulseStyle,
          ]}
        />
      )}

      <TourTooltip
        title={step.title}
        body={step.body}
        index={index}
        total={total}
        showNext={!isActionStep(step) || !!forceNext}
        onNext={onNext}
        onSkip={onSkip}
        caret={hole ? (below ? 'below' : 'above') : undefined}
        caretX={caretX}
        style={tooltipStyle}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute' },
  pulse: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: radius.card + 4,
  },
});
