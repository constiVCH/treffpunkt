import { Saira_400Regular, Saira_500Medium, Saira_600SemiBold } from '@expo-google-fonts/saira';
import {
  SairaExtraCondensed_600SemiBold,
  SairaExtraCondensed_700Bold,
} from '@expo-google-fonts/saira-extra-condensed';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors, Fonts } from '@/constants/theme';
import { DatabaseName, migrateDb } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

const hall = Colors.dark;
const NavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: hall.primary,
    background: hall.background,
    card: hall.background,
    text: hall.text,
    border: hall.line,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Saira_400Regular,
    Saira_500Medium,
    Saira_600SemiBold,
    SairaExtraCondensed_600SemiBold,
    SairaExtraCondensed_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SQLiteProvider databaseName={DatabaseName} onInit={migrateDb}>
      <ThemeProvider value={NavigationTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerTitleStyle: { fontFamily: Fonts.displayMedium, fontSize: 21 },
            headerBackTitleStyle: { fontFamily: Fonts.body },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: hall.background },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          {/* Full-screen analysis: own controls, and no edge swipe that could steal drawing or scrubbing. */}
          <Stack.Screen name="video/[id]" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="compare" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="gopro" options={{ headerShown: false }} />
          <Stack.Screen name="gopro-media" options={{ title: 'Videos auf der Kamera', headerBackTitle: 'Live' }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
