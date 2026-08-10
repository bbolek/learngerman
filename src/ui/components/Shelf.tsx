import { type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '@/ui/theme';

interface ShelfProps {
  children: ReactNode;
  /** Card width the shelf snaps to (plus the gap). */
  cardWidth: number;
}

/**
 * Horizontal card shelf. Bleeds out of Screen's horizontal padding so cards
 * scroll to the physical screen edge, while the first card still lines up
 * with the page margin.
 */
export function Shelf({ children, cardWidth }: ShelfProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + spacing.md}
      snapToAlignment="start"
      decelerationRate="fast"
      style={styles.bleed}
      contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -spacing.lg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
