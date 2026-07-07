// expo-router vendors react-navigation; the bottom-tabs types are only
// reachable via the build path (type-only import, no runtime cost).
import { type BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable } from 'react-native';

import { useTourTarget } from '@/tour/useTourTarget';

function TourTabButton({ targetId, ...props }: BottomTabBarButtonProps & { targetId: string }) {
  const target = useTourTarget(targetId);
  const { style, onPress, onLongPress, children, accessibilityState, testID } = props;
  return (
    <Pressable
      ref={target.ref}
      onLayout={target.onLayout}
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      testID={testID}>
      {children}
    </Pressable>
  );
}

/**
 * `tabBarButton` factory so the first-run tour can spotlight real tab
 * buttons (measured rects survive Android nav bars and font scaling,
 * unlike estimated positions).
 */
export function tourTabButton(targetId: string) {
  return function TabButton(props: BottomTabBarButtonProps) {
    return <TourTabButton targetId={targetId} {...props} />;
  };
}
