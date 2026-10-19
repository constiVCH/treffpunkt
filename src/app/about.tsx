import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LogoMark } from '@/components/logo-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Provider } from '@/constants/legal';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AppVersion = Constants.expoConfig?.version ?? '?';

/** App, version and device, so feedback about a bug can be reproduced. */
function describeSystem() {
  const device = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ');
  const system = [Device.osName ?? Platform.OS, Device.osVersion].filter(Boolean).join(' ');
  return `Treffpunkt ${AppVersion}, ${device || 'unbekanntes Gerät'}, ${system}`;
}

export default function AboutScreen() {
  const theme = useTheme();
  const [feedback, setFeedback] = useState('');

  async function sendFeedback() {
    const subject = `Feedback zu Treffpunkt ${AppVersion}`;
    const body = `${feedback.trim()}\n\n--\n${describeSystem()}`;
    const url = `mailto:${Provider.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setFeedback('');
    } catch {
      Alert.alert(
        'Keine Mail-App gefunden',
        `Schreib dein Feedback gern direkt an ${Provider.email}.`
      );
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <LogoMark size={48} />
              <View>
                <ThemedText type="subtitle">Treffpunkt</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Version <ThemedText type="small" style={styles.version}>{AppVersion}</ThemedText>
                </ThemedText>
              </View>
            </View>

            <View style={[styles.section, { borderTopColor: theme.line }]}>
              <ThemedText type="subtitle">Feedback</ThemedText>
              <ThemedText themeColor="textSecondary">
                Was klappt gut, was fehlt, was nervt? Deine Nachricht öffnet sich in deiner
                Mail-App, App-Version und Gerät hängen wir automatisch an.
              </ThemedText>
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Deine Nachricht"
                placeholderTextColor={theme.textSecondary}
                multiline
                textAlignVertical="top"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <Button
                label="Feedback senden"
                variant="primary"
                disabled={!feedback.trim()}
                onPress={sendFeedback}
              />
            </View>

            <View style={[styles.section, { borderTopColor: theme.line }]}>
              <ThemedText type="subtitle">Impressum</ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Angaben gemäß § 5 DDG
              </ThemedText>
              <ThemedText>
                {Provider.name}
                {'\n'}
                {Provider.street}
                {'\n'}
                {Provider.city}
                {'\n'}
                {Provider.country}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Kontakt
              </ThemedText>
              <ThemedText
                accessibilityRole="link"
                style={{ color: theme.primary }}
                onPress={() => Linking.openURL(`mailto:${Provider.email}`)}>
                {Provider.email}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Verantwortlich für den Inhalt
              </ThemedText>
              <ThemedText>{Provider.name}, Anschrift wie oben</ThemedText>
            </View>

            <View style={[styles.section, { borderTopColor: theme.line }]}>
              <ThemedText type="subtitle">Datenschutz</ThemedText>
              <ThemedText themeColor="textSecondary">
                Deine Videos, Zeichnungen und Notizen bleiben auf diesem Gerät. Treffpunkt hat kein
                Konto und keinen Server und überträgt nichts ins Internet. Die GoPro-Verbindung läuft
                nur im WLAN der Kamera. Feedback schickst du selbst über deine Mail-App.
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  version: {
    fontFamily: Fonts.displayMedium,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    borderTopWidth: 2,
  },
  input: {
    fontFamily: Fonts.body,
    fontSize: 16,
    minHeight: 120,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderRadius: Radius.control,
  },
});
