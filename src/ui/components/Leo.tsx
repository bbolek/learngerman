import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { AppText } from '@/ui/components/AppText';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/**
 * Leo — the app mascot, a silver-cream tabby Scottish Fold with a bow tie in
 * the theme's primary color. Drawn as stacked SVG layers so each part (tail,
 * feet, arms, head, eyes) can be animated independently on the UI thread.
 *
 * Choreography, driven by `progress` 0→1 over `durationMs`:
 *   walk in from the left → hop & cheer → wave "Tschüss!" → walk off right.
 */

/** Phase boundaries as fractions of the whole run. */
const IN_END = 0.2;
const PARTY_END = 0.64;
const WAVE_END = 0.78;
const HOPS = 3;

const VB_W = 120;
const VB_H = 130;

const CHEERS = ['Super!', 'Toll!', 'Klasse!', 'Wunderbar!', 'Miau!', 'Spitze!'];

export function leoCheer(seed: number) {
  return CHEERS[Math.abs(seed) % CHEERS.length];
}

interface LeoProps {
  progress: SharedValue<number>;
  durationMs: number;
  /** Screen width — Leo walks from off-screen left to off-screen right. */
  width: number;
  size?: number;
  cheer: string;
}

export function Leo({ progress, durationMs, width, size = 110, cheer }: LeoProps) {
  const t = useTheme();
  const k = size / VB_W;
  const h = VB_H * k;
  const center = (width - size) / 2;
  const origin = (x: number, y: number) => [x * k, y * k, 0];

  const root = useAnimatedStyle(() => {
    const p = progress.value;
    const sec = (p * durationMs) / 1000;
    const step = Math.sin(sec * Math.PI * 5);
    let x = center;
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (p < IN_END) {
      x = interpolate(p, [0, IN_END], [-size - 30, center]);
      y = -Math.abs(step) * 4;
      rot = step * 4;
    } else if (p < PARTY_END) {
      const local = (p - IN_END) / (PARTY_END - IN_END);
      const arc = Math.abs(Math.sin(local * HOPS * Math.PI));
      y = -arc * 34 * k;
      // Squash on landing, stretch in the air.
      const ground = Math.max(0, 1 - arc * 4);
      sy = 1 - ground * 0.1 + arc * 0.04;
      sx = 1 + ground * 0.08;
    } else if (p > WAVE_END) {
      const local = (p - WAVE_END) / (1 - WAVE_END);
      x = center + local * local * 0.4 * (width + 40) + local * 0.6 * (width + 40);
      y = -Math.abs(step) * 4;
      rot = step * 4;
    }
    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rot}deg` },
        { scaleX: sx },
        { scaleY: sy },
      ],
    };
  });

  const walkAmount = (p: number) => {
    'worklet';
    return p < IN_END || p > WAVE_END ? 1 : 0;
  };

  const leftFoot = useAnimatedStyle(() => {
    const p = progress.value;
    const step = Math.sin(((p * durationMs) / 1000) * Math.PI * 5);
    return { transform: [{ translateY: -Math.max(0, step) * 5 * k * walkAmount(p) }] };
  });
  const rightFoot = useAnimatedStyle(() => {
    const p = progress.value;
    const step = Math.sin(((p * durationMs) / 1000) * Math.PI * 5);
    return { transform: [{ translateY: -Math.max(0, -step) * 5 * k * walkAmount(p) }] };
  });

  const tail = useAnimatedStyle(() => {
    const p = progress.value;
    const sec = (p * durationMs) / 1000;
    const party = p >= IN_END && p <= WAVE_END;
    const wag = Math.sin(sec * Math.PI * (party ? 6 : 3)) * (party ? 22 : 12);
    return { transform: [{ rotate: `${wag}deg` }] };
  });

  const leftArm = useAnimatedStyle(() => {
    const p = progress.value;
    const sec = (p * durationMs) / 1000;
    const raise = interpolate(p, [IN_END, IN_END + 0.04, PARTY_END - 0.03, PARTY_END], [0, 1, 1, 0], 'clamp');
    const swing = Math.sin(sec * Math.PI * 5) * 18 * walkAmount(p);
    const angle = raise * (150 + Math.sin(sec * Math.PI * 8) * 15) + swing;
    return { transform: [{ rotate: `${angle}deg` }] };
  });
  const rightArm = useAnimatedStyle(() => {
    const p = progress.value;
    const sec = (p * durationMs) / 1000;
    const raise = interpolate(p, [IN_END, IN_END + 0.04, WAVE_END - 0.02, WAVE_END], [0, 1, 1, 0], 'clamp');
    const waving = p > PARTY_END ? 28 : 15;
    const swing = -Math.sin(sec * Math.PI * 5) * 18 * walkAmount(p);
    const angle = -raise * (150 + Math.sin(sec * Math.PI * 8) * waving) + swing;
    return { transform: [{ rotate: `${angle}deg` }] };
  });

  const head = useAnimatedStyle(() => {
    const p = progress.value;
    const sec = (p * durationMs) / 1000;
    const party = interpolate(p, [IN_END, IN_END + 0.03, WAVE_END - 0.03, WAVE_END], [0, 1, 1, 0], 'clamp');
    return { transform: [{ rotate: `${Math.sin(sec * Math.PI * 3) * 9 * party}deg` }] };
  });

  const happy = (p: number) => {
    'worklet';
    return interpolate(p, [IN_END - 0.02, IN_END + 0.02, WAVE_END, WAVE_END + 0.03], [0, 1, 1, 0], 'clamp');
  };
  const openEyes = useAnimatedStyle(() => {
    const p = progress.value;
    // Two quick blinks while walking.
    const blink = Math.min(
      Math.abs(p - 0.1) / 0.012,
      Math.abs(p - 0.9) / 0.012,
      1,
    );
    return { opacity: 1 - happy(p), transform: [{ scaleY: Math.max(0.1, blink) }] };
  });
  const happyEyes = useAnimatedStyle(() => ({ opacity: happy(progress.value) }));

  const bubble = (from: number, to: number) => {
    'worklet';
    const o = interpolate(progress.value, [from, from + 0.03, to - 0.03, to], [0, 1, 1, 0], 'clamp');
    return { opacity: o, transform: [{ scale: 0.6 + o * 0.4 }] };
  };
  const cheerBubble = useAnimatedStyle(() => bubble(IN_END + 0.02, PARTY_END));
  const byeBubble = useAnimatedStyle(() => bubble(PARTY_END, WAVE_END + 0.02));

  const layer = (children: ReactNode) => (
    <Svg width={size} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {children}
    </Svg>
  );
  const line = { stroke: t.mascotLine, strokeWidth: 3.5, strokeLinejoin: 'round' as const };
  const stripe = {
    stroke: t.mascotStripe,
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };
  const abs = [StyleSheet.absoluteFill, { width: size, height: h }];

  const bubbleStyle = [
    styles.bubble,
    { backgroundColor: t.surface, borderColor: t.mascotLine, top: -spacing.lg, left: size * 0.72 },
  ];

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, width: size, height: h }, root]}>
      {/* Tail — on the left, trailing behind as he walks right. */}
      <Animated.View style={[abs, { transformOrigin: origin(38, 108) }, tail]}>
        {layer(
          <G>
            <Path d="M40 110 C16 112 6 94 14 72" stroke={t.mascotLine} strokeWidth={12} strokeLinecap="round" fill="none" />
            <Path d="M40 110 C16 112 6 94 14 72" stroke={t.mascotFur} strokeWidth={6} strokeLinecap="round" fill="none" />
            <Path d="M20 100 L26 96 M13 86 L20 85" {...stripe} />
          </G>,
        )}
      </Animated.View>

      <Animated.View style={[abs, leftFoot]}>
        {layer(<Ellipse cx={47} cy={121} rx={10} ry={6} fill={t.mascotBelly} {...line} />)}
      </Animated.View>
      <Animated.View style={[abs, rightFoot]}>
        {layer(<Ellipse cx={73} cy={121} rx={10} ry={6} fill={t.mascotBelly} {...line} />)}
      </Animated.View>

      {/* Body */}
      <View style={abs}>
        {layer(
          <G>
            <Ellipse cx={60} cy={96} rx={28} ry={24} fill={t.mascotFur} {...line} />
            <Ellipse cx={60} cy={102} rx={15} ry={13} fill={t.mascotBelly} />
            <Path d="M36 96 Q40 94 42 98 M78 98 Q80 94 84 96" {...stripe} />
          </G>,
        )}
      </View>

      <Animated.View style={[abs, { transformOrigin: origin(35, 89) }, leftArm]}>
        {layer(
          <G>
            <Ellipse cx={35} cy={99} rx={7} ry={11} fill={t.mascotFur} {...line} />
            <Path d="M30 99 L40 99 M31 104 L39 104" {...stripe} strokeWidth={2} />
          </G>,
        )}
      </Animated.View>
      <Animated.View style={[abs, { transformOrigin: origin(85, 89) }, rightArm]}>
        {layer(
          <G>
            <Ellipse cx={85} cy={99} rx={7} ry={11} fill={t.mascotFur} {...line} />
            <Path d="M80 99 L90 99 M81 104 L89 104" {...stripe} strokeWidth={2} />
          </G>,
        )}
      </Animated.View>

      {/* Head (round Scottish Fold face, folded ears, bow tie) */}
      <Animated.View style={[abs, { transformOrigin: origin(60, 80) }, head]}>
        {layer(
          <G>
            <Ellipse cx={60} cy={48} rx={37} ry={32} fill={t.mascotFur} {...line} />
            {/* Folded ears lie flat on top of the head. */}
            <Path d="M27 33 C27 22 36 15 46 17 C50 18 51 22 48 25 C42 25 34 28 27 33 Z" fill={t.mascotFur} {...line} />
            <Path d="M33 27 C35 22 40 20 44 21 C44 23 42 24 40 24 C37 25 35 26 33 27 Z" fill={t.mascotBlush} />
            <Path d="M93 33 C93 22 84 15 74 17 C70 18 69 22 72 25 C78 25 86 28 93 33 Z" fill={t.mascotFur} {...line} />
            <Path d="M87 27 C85 22 80 20 76 21 C76 23 78 24 80 24 C83 25 85 26 87 27 Z" fill={t.mascotBlush} />
            {/* Tabby "M" on the forehead */}
            <Path d="M52 22 Q54 28 53 33 M60 20 L60 31 M68 22 Q66 28 67 33" {...stripe} />
            <Path d="M24 46 L31 47 M23 53 L30 53 M96 46 L89 47 M97 53 L90 53" {...stripe} />
            <Ellipse cx={60} cy={63} rx={13} ry={9} fill={t.mascotBelly} />
            <Ellipse cx={39} cy={62} rx={6} ry={3.5} fill={t.mascotBlush} />
            <Ellipse cx={81} cy={62} rx={6} ry={3.5} fill={t.mascotBlush} />
            <Path d="M56 57 Q60 55 64 57 Q61 62 60 62 Q59 62 56 57 Z" fill={t.mascotNose} {...line} strokeWidth={2} />
            <Path d="M54 65 Q57 69 60 65 Q63 69 66 65" stroke={t.mascotLine} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <Path d="M28 60 L12 57 M28 65 L13 67 M92 60 L108 57 M92 65 L107 67" stroke={t.mascotLine} strokeWidth={1.5} strokeLinecap="round" />
            {/* Bow tie in the app's primary color */}
            <Path d="M60 80 L47 72 L47 88 Z M60 80 L73 72 L73 88 Z" fill={t.primary} {...line} strokeWidth={2.5} />
            <Circle cx={60} cy={80} r={4} fill={t.primary} {...line} strokeWidth={2.5} />
          </G>,
        )}
        <Animated.View style={[abs, { transformOrigin: origin(60, 49) }, openEyes]}>
          {layer(
            <G>
              <Circle cx={46} cy={49} r={6.5} fill={t.mascotEye} {...line} strokeWidth={2.5} />
              <Circle cx={74} cy={49} r={6.5} fill={t.mascotEye} {...line} strokeWidth={2.5} />
              <Circle cx={46} cy={50} r={3} fill={t.mascotLine} />
              <Circle cx={74} cy={50} r={3} fill={t.mascotLine} />
              <Circle cx={44} cy={47} r={1.6} fill={t.mascotBelly} />
              <Circle cx={72} cy={47} r={1.6} fill={t.mascotBelly} />
            </G>,
          )}
        </Animated.View>
        <Animated.View style={[abs, happyEyes]}>
          {layer(
            <Path
              d="M40 51 Q46 43 52 51 M68 51 Q74 43 80 51"
              stroke={t.mascotLine}
              strokeWidth={3.5}
              strokeLinecap="round"
              fill="none"
            />,
          )}
        </Animated.View>
      </Animated.View>

      <Animated.View style={[bubbleStyle, cheerBubble]}>
        <AppText variant="secondary" style={styles.bubbleText}>
          {cheer}
        </AppText>
      </Animated.View>
      <Animated.View style={[bubbleStyle, byeBubble]}>
        <AppText variant="secondary" style={styles.bubbleText}>
          Tschüss!
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bubbleText: { fontWeight: '800' },
});
