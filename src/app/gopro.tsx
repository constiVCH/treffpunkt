import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DownloadOverlay } from '@/components/download-overlay';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useGoProImport } from '@/hooks/use-gopro-import';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/export';
import { formatTime } from '@/lib/format';
import {
  getRecordingState,
  keepAlive,
  listVideos,
  setShutter,
  startPreview,
  stopPreview,
  type GoProVideo,
} from '@/lib/gopro';

// Expo Go and web have no libVLC, and importing the player there would crash, so it is
// loaded only in native development and release builds.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const GoProLiveView: typeof import('@/components/gopro-live-view').GoProLiveView | null =
  isExpoGo || process.env.EXPO_OS === 'web'
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not load in Expo Go
    require('@/components/gopro-live-view').GoProLiveView;

type Connection = 'idle' | 'connecting' | 'connected' | 'failed';
type Live = 'starting' | 'playing' | 'failed';
/** What happened to the last recording: waiting for the file, found, or not found. */
type LastRecording = { state: 'saving' } | { state: 'ready'; video: GoProVideo } | { state: 'missing' };

const KeepAliveInterval = 3000;

export default function GoProScreen() {
  const theme = useTheme();
  const [connection, setConnection] = useState<Connection>('idle');
  const [recording, setRecording] = useState(false);

  async function connect() {
    setConnection('connecting');
    try {
      const state = await getRecordingState();
      setRecording(state.recording);
      setConnection('connected');
    } catch {
      setConnection('failed');
    }
  }

  if (connection === 'connected') {
    return (
      <LiveCamera
        initiallyRecording={recording}
        onConnectionLost={() => setConnection('failed')}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.setupHeader}>
          <Button label="‹" compact accessibilityLabel="Zurück" style={styles.icon} onPress={() => router.back()} />
          <ThemedText type="subtitle">GoPro verbinden</ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.setup}>
          <Step n={1} text="GoPro einschalten (HERO9 oder neuer) und die Bildrate einstellen, z. B. 120 oder 240 fps." />
          <Step
            n={2}
            text="WLAN der GoPro aktivieren. Dafür muss die Kamera einmal mit der GoPro Quik App gekoppelt sein. Name und Passwort des Kamera-WLANs findest du je nach Modell im Kameramenü unter Verbindungen › Kamerainfo."
          />
          <Step
            n={3}
            text="Dein Handy in den WLAN-Einstellungen mit dem GoPro-WLAN verbinden. Schalte mobile Daten aus, sonst versucht Android, die Kamera über das Mobilnetz zu erreichen."
          />
          <Step n={4} text="Zurück in die App und „Verbinden“ tippen. Das Livebild startet automatisch." />
          {connection === 'failed' && (
            <ThemedText style={{ color: theme.danger }}>
              Keine GoPro erreichbar. Prüfe, ob dein Handy im WLAN der Kamera ist, und tippe erneut auf
              „Verbinden“.
            </ThemedText>
          )}
          <Button
            label={connection === 'connecting' ? 'Verbinde …' : 'Verbinden'}
            variant="primary"
            disabled={connection === 'connecting'}
            onPress={connect}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function LiveCamera({
  initiallyRecording,
  onConnectionLost,
}: {
  initiallyRecording: boolean;
  onConnectionLost: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [live, setLive] = useState<Live>('starting');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const [recording, setRecording] = useState(initiallyRecording);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [shutterBusy, setShutterBusy] = useState(false);
  const [knownPaths, setKnownPaths] = useState<Set<string>>(new Set());
  const [lastRecording, setLastRecording] = useState<LastRecording | null>(null);
  const { download, importVideo, cancel } = useGoProImport();

  // Ask the camera to stream to us while this screen is open.
  useEffect(() => {
    let active = true;
    startPreview().catch((error) => {
      if (!active) return;
      setLive('failed');
      setLiveError(describeError(error));
    });
    return () => {
      active = false;
      stopPreview().catch(() => {});
    };
  }, [streamKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      keepAlive().catch(onConnectionLost);
    }, KeepAliveInterval);
    return () => clearInterval(timer);
  }, [onConnectionLost]);

  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recordingSince]);

  function restartStream() {
    setLive('starting');
    setLiveError(null);
    setStreamKey((key) => key + 1);
  }

  async function startRecording() {
    setLastRecording(null);
    // Remember what is on the card so the new file can be told apart afterwards.
    const before = await listVideos().catch(() => []);
    setKnownPaths(new Set(before.map((video) => video.path)));
    await setShutter(true);
    setRecording(true);
    setRecordingSince(Date.now());
    setNow(Date.now());
  }

  async function stopRecording() {
    await setShutter(false);
    setRecording(false);
    setRecordingSince(null);
    setLastRecording({ state: 'saving' });
    // The camera needs a moment to finish writing the file before it shows up in the list.
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const videos = await listVideos().catch(() => []);
      const created = videos.find((video) => !knownPaths.has(video.path));
      if (created) {
        setLastRecording({ state: 'ready', video: created });
        return;
      }
    }
    setLastRecording({ state: 'missing' });
  }

  async function toggleRecording() {
    setShutterBusy(true);
    try {
      if (recording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (error) {
      Alert.alert('GoPro reagiert nicht', describeError(error));
    } finally {
      setShutterBusy(false);
    }
  }

  async function analyze(video: GoProVideo) {
    // Free the WiFi bandwidth for the transfer.
    await stopPreview().catch(() => {});
    await importVideo(video);
  }

  const elapsed = recordingSince === null ? 0 : (now - recordingSince) / 1000;
  const sideInsets = { paddingLeft: insets.left + Spacing.three, paddingRight: insets.right + Spacing.three };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar hidden />
      <View style={styles.stage}>
        {GoProLiveView ? (
          <GoProLiveView
            key={streamKey}
            style={StyleSheet.absoluteFill}
            onPlaying={() => setLive('playing')}
            onError={(message) => {
              setLive('failed');
              setLiveError(message);
            }}
          />
        ) : null}

        {!GoProLiveView ? (
          <View style={styles.stageMessage}>
            <ThemedText type="subtitle">Livebild nur in der installierten App</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              Expo Go kann den Stream der GoPro nicht anzeigen. Aufnehmen und Übertragen
              funktionieren trotzdem.
            </ThemedText>
          </View>
        ) : live === 'starting' ? (
          <View style={styles.stageMessage}>
            <ActivityIndicator color={theme.primary} size="large" />
            <ThemedText themeColor="textSecondary">Livebild startet …</ThemedText>
          </View>
        ) : live === 'failed' ? (
          <View style={styles.stageMessage}>
            <ThemedText type="subtitle">Kein Livebild</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              {liveError ?? 'Die GoPro sendet kein Bild.'} Manche Bildraten erlauben keine
              Vorschau. Aufnehmen funktioniert trotzdem.
            </ThemedText>
            <Button label="Erneut versuchen" compact onPress={restartStream} />
          </View>
        ) : null}

        <View style={[styles.topBar, sideInsets, { paddingTop: insets.top + Spacing.two }]}>
          <Button label="‹" compact accessibilityLabel="Zurück" style={styles.icon} onPress={() => router.back()} />
          <ThemedText type="subtitle" style={styles.flex}>
            GoPro
          </ThemedText>
          {recording && (
            <View style={[styles.timer, { backgroundColor: theme.danger }]}>
              <View style={styles.timerDot} />
              <ThemedText type="number" style={styles.timerText}>
                {formatTime(elapsed).split('.')[0]}
              </ThemedText>
            </View>
          )}
          <Button label="Videos auf der Kamera" compact onPress={() => router.push('/gopro-media')} />
        </View>
      </View>

      <View style={[styles.controls, sideInsets, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.controlSide}>
          {lastRecording?.state === 'saving' && (
            <View style={styles.inline}>
              <ActivityIndicator color={theme.primary} />
              <ThemedText type="small" themeColor="textSecondary">
                GoPro speichert die Aufnahme …
              </ThemedText>
            </View>
          )}
          {lastRecording?.state === 'ready' && (
            <Button
              label="Übertragen und analysieren"
              variant="primary"
              compact
              disabled={download !== null}
              onPress={() => analyze(lastRecording.video)}
            />
          )}
          {lastRecording?.state === 'missing' && (
            <ThemedText type="small" themeColor="textSecondary">
              Aufnahme gespeichert. Du findest sie unter „Videos auf der Kamera“.
            </ThemedText>
          )}
          {lastRecording === null && !recording && (
            <ThemedText type="small" themeColor="textSecondary">
              Tippe auf den Auslöser, wenn die Aktion beginnt.
            </ThemedText>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Aufnahme stoppen' : 'Aufnahme starten'}
          disabled={shutterBusy}
          onPress={toggleRecording}
          style={({ pressed }) => [
            styles.shutter,
            { borderColor: theme.text, opacity: shutterBusy ? 0.5 : pressed ? 0.8 : 1 },
          ]}>
          <View
            style={
              recording
                ? [styles.shutterStop, { backgroundColor: theme.danger }]
                : [styles.shutterRecord, { backgroundColor: theme.primary }]
            }
          />
        </Pressable>

        <View style={styles.controlSide} />
      </View>

      {download && <DownloadOverlay download={download} onCancel={cancel} />}
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
          {n}
        </ThemedText>
      </View>
      <ThemedText style={styles.flex}>{text}</ThemedText>
    </View>
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
  icon: {
    minWidth: 44,
    paddingHorizontal: Spacing.two,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  setup: {
    gap: Spacing.four,
    padding: Spacing.three,
    paddingTop: Spacing.four,
    maxWidth: 620,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
  },
  stage: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageMessage: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    maxWidth: 480,
  },
  centerText: {
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    backgroundColor: 'rgba(15, 35, 80, 0.86)',
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.tag,
  },
  timerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  timerText: {
    color: '#FFFFFF',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  controlSide: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRecord: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  shutterStop: {
    width: 30,
    height: 30,
    borderRadius: Radius.control,
  },
});
