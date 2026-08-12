import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CameraView as CameraViewT } from 'expo-camera';

import { getDb } from '@/db/client';
import {
  collectScanWords,
  dedupeScanWords,
  mapFrameToView,
  resolveScanWords,
  uprightScanFrame,
  type ScanHit,
  type ScanWord,
} from '@/logic/scan';
import { loadScanner } from '@/services/scanner';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { WordPopup } from '@/ui/components/WordPopup';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

interface ScanResult {
  photo: { uri: string; width: number; height: number };
  /** Every recognized word with its photo-pixel frame (overlay). */
  words: ScanWord[];
  /** Unique words in reading order (list below the photo). */
  unique: ScanWord[];
  hits: Map<string, ScanHit>;
}

/** Collapsed photo viewport height while the word list is scrolled. */
const COLLAPSED_HEIGHT = 140;
const MAX_ZOOM = 5;

export default function ScanScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  // Stable per mount: whether the installed binary has the scanner modules.
  const [mods] = useState(loadScanner);
  const [perm, setPerm] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const camRef = useRef<CameraViewT>(null);

  useEffect(() => {
    if (!mods) return;
    let cancelled = false;
    mods.requestCameraPermission().then((granted) => {
      if (!cancelled) setPerm(granted ? 'granted' : 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, [mods]);

  const capture = async () => {
    if (!mods || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const photo = await camRef.current?.takePictureAsync({
        quality: 0.7,
        shutterSound: false,
        exif: true,
      });
      if (!photo) return;
      const ocr = await mods.recognize(photo.uri);
      const elements = ocr.blocks.flatMap((b) => b.lines.flatMap((li) => li.elements));
      // iOS keeps the sensor's landscape pixels and marks the rotation in
      // EXIF; ML Kit frames come back in that buffer space. Android already
      // returns upright frames (its ML Kit input applies the EXIF rotation).
      const orientation =
        Platform.OS === 'ios' ? Number((photo.exif as { Orientation?: unknown })?.Orientation) || 1 : 1;
      const words = collectScanWords(elements).map((w) =>
        w.frame ? { ...w, frame: uprightScanFrame(w.frame, orientation, photo) } : w
      );
      const unique = dedupeScanWords(words);
      const hits = await resolveScanWords(getDb(), unique.map((w) => w.norm));
      setResult({ photo, words, unique, hits });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>
      <AppText variant="section">Text scannen</AppText>
    </View>
  );

  // Old binary without the native modules — OTA delivered this screen early.
  if (!mods) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        {header}
        <View style={styles.center}>
          <AppText style={{ fontSize: 44 }}>📷</AppText>
          <AppText variant="subtitle" muted style={{ marginTop: spacing.md, textAlign: 'center' }}>
            Der Scanner ist in dieser App-Version noch nicht verfügbar.
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
            Installiere das nächste Update aus dem Store, um Text mit der Kamera zu scannen.
          </AppText>
        </View>
      </View>
    );
  }

  if (perm === 'denied') {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg }]}>
        {header}
        <View style={styles.center}>
          <AppText style={{ fontSize: 44 }}>🔒</AppText>
          <AppText variant="subtitle" muted style={{ marginTop: spacing.md, textAlign: 'center' }}>
            Ohne Kamerazugriff kann Deutschly keinen Text scannen.
          </AppText>
          <Pressable
            onPress={() => Linking.openSettings()}
            style={[styles.settingsBtn, { backgroundColor: t.primaryDim }]}>
            <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.bold }}>
              Einstellungen öffnen
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (result) {
    return (
      <ResultView
        result={result}
        onRescan={() => setResult(null)}
        onSelect={setSelected}
        header={header}
        selected={selected}
        onClosePopup={() => setSelected(null)}
      />
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      {header}
      <View style={[styles.cameraBox, { backgroundColor: t.surface }]}>
        {perm === 'granted' && <mods.CameraView ref={camRef} style={styles.fill} facing="back" />}
        {busy && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator size="large" color={t.primary} />
            <AppText variant="secondary" muted style={{ marginTop: spacing.sm }}>
              Erkenne Text…
            </AppText>
          </View>
        )}
      </View>
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
        {failed ? (
          <AppText variant="secondary" color={t.danger} style={{ textAlign: 'center' }}>
            Das hat nicht geklappt — versuch es noch einmal.
          </AppText>
        ) : (
          <AppText variant="secondary" muted style={{ textAlign: 'center' }}>
            Richte die Kamera auf deutschen Text — Schilder, Speisekarten, Bücher.
          </AppText>
        )}
        <Pressable
          onPress={capture}
          disabled={busy || perm !== 'granted'}
          style={[
            styles.shutter,
            { borderColor: t.primary, opacity: busy || perm !== 'granted' ? 0.4 : 1 },
          ]}>
          <View style={[styles.shutterInner, { backgroundColor: t.primary }]} />
        </Pressable>
      </View>
    </View>
  );
}

function ResultView({
  result,
  onRescan,
  onSelect,
  header,
  selected,
  onClosePopup,
}: {
  result: ScanResult;
  onRescan: () => void;
  onSelect: (word: string) => void;
  header: React.ReactNode;
  selected: string | null;
  onClosePopup: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  // The photo dominates at first (~half the screen); scrolling the word list
  // collapses the viewport down to COLLAPSED_HEIGHT to make room for words.
  const viewportW = win.width - spacing.lg * 2;
  const expandedH = Math.max(COLLAPSED_HEIGHT, Math.round(win.height * 0.52));
  const collapseRange = expandedH - COLLAPSED_HEIGHT;

  // Fixed-size inner canvas, aspect-fit to the expanded viewport. Overlay
  // boxes are positioned once in canvas coordinates; zoom and collapse are
  // pure transforms, so the boxes always track the image.
  const photoOk = result.photo.width > 0 && result.photo.height > 0;
  const fit = photoOk
    ? Math.min(viewportW / result.photo.width, expandedH / result.photo.height)
    : 1;
  const canvasW = photoOk ? result.photo.width * fit : viewportW;
  const canvasH = photoOk ? result.photo.height * fit : expandedH;

  const scrollY = useSharedValue(0);
  const zoom = useSharedValue(1);
  const savedZoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const clampPan = (zoomNow: number, txNow: number, tyNow: number) => {
    'worklet';
    // Keep the zoomed canvas from being dragged fully out of the viewport.
    const maxX = (canvasW * (zoomNow - 1)) / 2;
    const maxY = (canvasH * (zoomNow - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, txNow)),
      y: Math.min(maxY, Math.max(-maxY, tyNow)),
    };
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      zoom.value = Math.min(MAX_ZOOM, Math.max(1, savedZoom.value * e.scale));
    })
    .onEnd(() => {
      savedZoom.value = zoom.value;
      if (zoom.value <= 1.02) {
        zoom.value = withTiming(1);
        savedZoom.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        const p = clampPan(zoom.value, tx.value, ty.value);
        tx.value = withTiming(p.x);
        ty.value = withTiming(p.y);
        savedTx.value = p.x;
        savedTy.value = p.y;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedZoom.value <= 1) return;
      const p = clampPan(savedZoom.value, savedTx.value + e.translationX, savedTy.value + e.translationY);
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      zoom.value = withTiming(1);
      savedZoom.value = 1;
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedTx.value = 0;
      savedTy.value = 0;
    });

  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap);

  const viewportStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, collapseRange], [expandedH, COLLAPSED_HEIGHT], Extrapolation.CLAMP),
  }));

  const canvasStyle = useAnimatedStyle(() => {
    const h = interpolate(scrollY.value, [0, collapseRange], [expandedH, COLLAPSED_HEIGHT], Extrapolation.CLAMP);
    // Shrink the whole canvas (image + boxes) along with the viewport, then
    // apply the user's pinch zoom on top.
    const collapseScale = Math.min(1, h / canvasH, viewportW / canvasW);
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: collapseScale * zoom.value },
      ],
    };
  });

  const matched = result.unique.filter((w) => result.hits.has(w.norm));
  const unmatched = result.unique.filter((w) => !result.hits.has(w.norm));

  return (
    <GestureHandlerRootView style={[styles.fill, { backgroundColor: t.bg }]}>
      {header}
      <Animated.View
        style={[styles.photoViewport, { backgroundColor: t.surface }, viewportStyle]}>
        <GestureDetector gesture={gestures}>
          <Animated.View style={[{ width: canvasW, height: canvasH }, canvasStyle]}>
            <Image
              source={{ uri: result.photo.uri }}
              style={styles.fill}
              contentFit="contain"
              transition={150}
            />
            {result.words.map((w, i) => {
              if (!w.frame) return null;
              const box = mapFrameToView(w.frame, result.photo, { width: canvasW, height: canvasH });
              if (!box) return null;
              const known = result.hits.has(w.norm);
              return (
                <Pressable
                  key={`${w.norm}-${i}`}
                  onPress={() => onSelect(w.word)}
                  style={[
                    styles.wordBox,
                    {
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                      borderColor: known ? t.primary : t.inkFaint,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>
        </GestureDetector>
      </Animated.View>
      <Animated.FlatList
        data={matched}
        keyExtractor={(w: ScanWord) => w.norm}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + spacing.xxl }]}
        style={styles.fill}
        ListHeaderComponent={
          <>
            <View style={styles.resultHead}>
              <View style={{ flex: 1 }}>
                <AppText variant="subtitle">Erkannte Wörter</AppText>
                <AppText variant="caption" muted>
                  Tippe ein Wort — zoome das Foto mit zwei Fingern.
                </AppText>
              </View>
              <Pressable
                onPress={onRescan}
                hitSlop={8}
                style={[styles.rescan, { backgroundColor: t.primaryDim }]}>
                <Ionicons name="camera" size={15} color={t.onPrimaryDim} />
                <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                  Neu scannen
                </AppText>
              </Pressable>
            </View>
            <View style={[styles.disclaimer, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Ionicons name="information-circle-outline" size={16} color={t.inkMuted} />
              <AppText variant="caption" muted style={{ flex: 1 }}>
                Deutschly übersetzt keine ganzen Texte: Die App arbeitet komplett offline und
                bleibt kostenlos. Dafür kannst du jedes Wort einzeln nachschlagen und speichern.
              </AppText>
            </View>
            {result.unique.length === 0 && (
              <View style={styles.empty}>
                <AppText variant="subtitle" muted>
                  Kein Text erkannt 🧐
                </AppText>
                <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: 4 }}>
                  Geh näher ran und achte auf gutes Licht.
                </AppText>
              </View>
            )}
          </>
        }
        renderItem={({ item }: { item: ScanWord }) => {
          const hit = result.hits.get(item.norm)!;
          return (
            <Card onPress={() => onSelect(item.word)} style={styles.row}>
              <View style={styles.rowInner}>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle" style={{ fontFamily: fonts.serif, fontSize: 19 }}>
                    {hit.lemma}
                  </AppText>
                  <AppText variant="secondary" muted numberOfLines={1}>
                    {hit.gloss}
                  </AppText>
                </View>
                <GenderChip gender={hit.gender} small />
                <Chip label={hit.level} kind="level" small />
              </View>
            </Card>
          );
        }}
        ListFooterComponent={
          unmatched.length > 0 ? (
            <>
              <AppText variant="label" muted style={styles.unknownHead}>
                Nicht im Wörterbuch
              </AppText>
              <View style={styles.unknownWrap}>
                {unmatched.map((w) => (
                  <Pressable
                    key={w.norm}
                    onPress={() => onSelect(w.word)}
                    style={[styles.unknownChip, { borderColor: t.line, backgroundColor: t.surface }]}>
                    <AppText variant="secondary" muted>
                      {w.word}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null
        }
      />
      <WordPopup word={selected} onClose={onClosePopup} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  cameraBox: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.screen,
    overflow: 'hidden',
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg, paddingHorizontal: spacing.xl },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 999 },
  settingsBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 999,
  },
  photoViewport: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 4,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  rescan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  row: { marginBottom: spacing.sm, paddingVertical: 13 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  unknownHead: { marginTop: spacing.lg, marginBottom: spacing.sm },
  unknownWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  unknownChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
