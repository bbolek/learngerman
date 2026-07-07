import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTourTarget } from '@/tour/useTourTarget';

interface TourTargetProps {
  id: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Convenience wrapper for spotlighting components that don't forward
 * refs (Card etc.). `collapsable={false}` keeps the View measurable on
 * Android, where layout-only views are otherwise optimized away.
 */
export function TourTarget({ id, style, children }: TourTargetProps) {
  const target = useTourTarget(id);
  return (
    <View ref={target.ref} onLayout={target.onLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}
