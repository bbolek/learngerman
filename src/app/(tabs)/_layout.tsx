import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { useTr } from '@/i18n';
import { tourTabButton } from '@/tour/TourTabButton';
import { fonts } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function TabsLayout() {
  const t = useTheme();
  const tr = useTr();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.inkMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
        tabBarLabelStyle: { fontFamily: fonts.extrabold, fontSize: 11 },
        sceneStyle: { backgroundColor: t.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-home'),
        }}
      />
      <Tabs.Screen
        name="path"
        options={{
          title: tr('tabs.path'),
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-path'),
        }}
      />
      <Tabs.Screen
        name="dictionary"
        options={{
          title: tr('tabs.dictionary'),
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-dictionary'),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: tr('tabs.practice'),
          tabBarIcon: ({ color, size }) => <Ionicons name="school" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-practice'),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: tr('tabs.games'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller" size={size} color={color} />
          ),
          tabBarButton: tourTabButton('tab-games'),
        }}
      />
    </Tabs>
  );
}
