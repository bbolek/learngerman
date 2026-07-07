import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useTourStore } from '@/tour/tourStore';

export interface TourTargetProps {
  ref: React.RefObject<View | null>;
  onLayout: () => void;
}

/**
 * Marks a View as a spotlight target for the first-run tour. Spread the
 * returned `ref`/`onLayout` onto the element:
 *
 *   const target = useTourTarget('home-streak');
 *   <Pressable ref={target.ref} onLayout={target.onLayout} … />
 *
 * The rect is measured in window coordinates on layout, and again whenever
 * the tour step pointing at this target activates (the store calls the
 * registered measurer), which covers tab switches and scrolled content.
 */
export function useTourTarget(id: string): TourTargetProps {
  const ref = useRef<View | null>(null);

  const measure = useCallback(() => {
    // rAF lets the layout settle (navigation transitions, keyboard).
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          useTourStore.getState().setRect(id, { x, y, width, height });
        }
      });
    });
  }, [id]);

  useEffect(() => {
    useTourStore.getState().registerTarget(id, measure);
    return () => useTourStore.getState().unregisterTarget(id);
  }, [id, measure]);

  return { ref, onLayout: measure };
}
