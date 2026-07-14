import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { initDatabase } from '@/db/client';
import { useSettings } from '@/store/settings';
import { TourController } from '@/tour/TourController';
import { CelebrationOverlay } from '@/ui/components/CelebrationOverlay';
import { palettes } from '@/ui/theme';
import { useThemeName } from '@/ui/useTheme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const themeName = useThemeName();
  const palette = palettes[themeName];
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    // Native config allows all orientations (needed so fullscreen tables can
    // rotate); the app itself stays portrait via this runtime lock.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    initDatabase()
      .then(() => useSettings.getState().hydrate())
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('Database init failed', err);
      });
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady]);

  // Top up the pending-notification buffer whenever the app returns to the
  // foreground — only ~60 local notifications can be scheduled ahead, so at
  // short intervals the supply runs dry if it's refilled only at cold start.
  useEffect(() => {
    if (!dbReady) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useSettings.getState().refreshNotifications();
    });
    return () => sub.remove();
  }, [dbReady]);

  // Tapping a vocab-reminder notification opens that word's dictionary entry
  // directly instead of just foregrounding the app.
  useEffect(() => {
    if (!dbReady) return;
    const openFromResponse = (response: Notifications.NotificationResponse) => {
      const lemmaId = response.notification.request.content.data?.lemmaId;
      if (lemmaId != null) router.push({ pathname: '/word/[id]', params: { id: String(lemmaId) } });
    };
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromResponse(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => sub.remove();
  }, [dbReady]);

  if (!fontsLoaded || !dbReady) return null;

  const navTheme = {
    ...(themeName === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(themeName === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: palette.bg,
      card: palette.surface,
      text: palette.ink,
      border: palette.line,
      primary: palette.primary,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="review" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/wortblitz" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/bilderraetsel" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/derdiedas" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game/wortpaare" options={{ gestureEnabled: false }} />
        <Stack.Screen name="duel/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="duel/play" options={{ gestureEnabled: false }} />
      </Stack>
      <CelebrationOverlay />
      <TourController />
    </ThemeProvider>
  );
}
