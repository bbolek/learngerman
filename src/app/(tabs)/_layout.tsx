import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { tourTabButton } from '@/tour/TourTabButton';
import { fonts } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function TabsLayout() {
  const t = useTheme();
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
          title: 'Start',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-home'),
        }}
      />
      <Tabs.Screen
        name="dictionary"
        options={{
          title: 'Wörterbuch',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-dictionary'),
        }}
      />
      <Tabs.Screen
        name="words"
        options={{
          title: 'Wörter',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-words'),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Üben',
          tabBarIcon: ({ color, size }) => <Ionicons name="school" size={size} color={color} />,
          tabBarButton: tourTabButton('tab-practice'),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Spiele',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="game-controller" size={size} color={color} />
          ),
          tabBarButton: tourTabButton('tab-games'),
        }}
      />
    </Tabs>
  );
}
