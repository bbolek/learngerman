import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useTheme } from '@/ui/useTheme';

interface VocabImageProps {
  /** SVG document text from lemma_images (bundled Noto emoji). */
  svg: string;
  /** Noun gender tints the tile (der/die/das chip colors); others get primary. */
  gender: string | null;
  /** Tile edge length; the artwork fills ~70% of it. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function VocabImage({ svg, gender, size = 76, style }: VocabImageProps) {
  const t = useTheme();
  const bg =
    gender === 'm' ? t.derChip : gender === 'f' ? t.dieChip : gender === 'n' ? t.dasChip : t.primaryDim;
  // Monochrome icon sets (e.g. Health Icons) draw with currentColor; tint them
  // with the tile's foreground so they stay visible in dark mode. Full-color
  // emoji SVGs have explicit fills and ignore this.
  const fg =
    gender === 'm'
      ? t.onDerChip
      : gender === 'f'
        ? t.onDieChip
        : gender === 'n'
          ? t.onDasChip
          : t.onPrimaryDim;
  const inner = Math.round(size * 0.7);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.round(size * 0.29), backgroundColor: bg },
        style,
      ]}>
      <SvgXml xml={svg} width={inner} height={inner} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
