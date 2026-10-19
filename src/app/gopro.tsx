import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addVideo } from '@/lib/db';
import { describeError } from '@/lib/export';
import { formatDateTime, formatFps, formatTime } from '@/lib/format';
import {
  downloadVideo,
  getRecordingState,
  getVideoInfo,
  keepAlive,
  listVideos,
  setShutter,
  thumbnailUrl,
  type GoProVideo,
  type GoProVideoInfo,
} from '@/lib/gopro';

type Connection = 'idle' | 'connecting' | 'connected' | 'failed';
type Download = { video: GoProVideo; progress: number };

const KeepAliveInterval = 3000;

export default function GoProScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [connection, setConnection] = useState<Connection>('idle');
  const [recording, setRecording] = useState(false);
  const [shutterBusy, setShutterBusy] = useState(false);
  const [videos, setVideos] = useState<GoProVideo[]>([]);
  const [download, setDownload] = useState<Download | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (connection !== 'connected') return;
    const timer = setInterval(() => {
      keepAlive().catch(() => setConnection('failed'));
    }, KeepAliveInterval);
    return () => clearInterval(timer);
  }, [connection]);

  // Cancel a running download when leaving the screen.
  useEffect(() => () => abort.current?.abort(), []);

  async function connect() {
    setConnection('connecting');
    try {
      const state = await getRecordingState();
      setRecording(state.recording);
      setVideos(await listVideos());
      setConnection('connected');
    } catch {
      setConnection('failed');
    }
  }

  async function refreshVideos() {
    try {
      setVideos(await listVideos());
    } catch {
      setConnection('failed');
    }
  }

  async function toggleRecording() {
    setShutterBusy(true);
    try {
      await setShutter(!recording);
      setRecording(!recording);
      if (recording) {
        // The new file shows up in the media list once the camera has finished writing it.
        setTimeout(refreshVideos, 2000);
      }
    } catch (error) {
      Alert.alert('GoPro reagiert nicht', describeError(error));
    } finally {
      setShutterBusy(false);
    }
  }

  async function importVideo(video: GoProVideo, info: GoProVideoInfo | null) {
    const controller = new AbortController();
    abort.current = controller;
    setDownload({ video, progress: 0 });
    try {
      const uri = await downloadVideo(
        video,
        (progress) => setDownload({ video, progress }),
        controller.signal
      );
      const id = await addVideo(db, {
        title: `GoPro ${video.file.replace(/\.mp4$/i, '')} vom ${formatDateTime(video.createdAt)}`,
        uri,
        duration: info?.duration ?? 0,
        frameRate: info?.frameRate,
      });
      router.replace({ pathname: '/video/[id]', params: { id } });
    } catch (error) {
      if (!controller.signal.aborted) {
        Alert.alert('Video nicht übertragen', describeError(error));
      }
    } finally {
      abort.current = null;
      setDownload(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <FlatList
          data={connection === 'connected' ? videos : []}
          keyExtractor={(video) => video.path}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.header}>
              {connection === 'connected' ? (
                <>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText type="subtitle" style={{ color: theme.highlight }}>
                      GoPro verbunden
                    </ThemedText>
                    <Button
                      label={recording ? '■ Aufnahme stoppen' : '● Aufnahme starten'}
                      variant={recording ? 'danger' : 'primary'}
                      disabled={shutterBusy}
                      onPress={toggleRecording}
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      Bildrate und Auflösung stellst du an der GoPro ein. Für Zeitlupe eignen sich
                      120 oder 240 fps. In 1080p ist ein Video deutlich schneller übertragen als in
                      4K.
                    </ThemedText>
                  </ThemedView>
                  <View style={styles.listHeader}>
                    <ThemedText type="subtitle">Videos auf der Kamera</ThemedText>
                    <Button label="Aktualisieren" compact onPress={refreshVideos} />
                  </View>
                  {videos.length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Keine Videos auf der Speicherkarte.
                    </ThemedText>
                  )}
                </>
              ) : (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="subtitle">So verbindest du die GoPro</ThemedText>
                  <Step n={1} text="GoPro einschalten (HERO9 oder neuer) und die gewünschte Bildrate einstellen, z. B. 240 fps." />
                  <Step
                    n={2}
                    text="WLAN der GoPro aktivieren. Dafür muss die Kamera einmal mit der GoPro Quik App gekoppelt sein. Name und Passwort des Kamera-WLANs findest du je nach Modell im Kameramenü unter Verbindungen › Kamerainfo."
                  />
                  <Step
                    n={3}
                    text="Dein Handy in den WLAN-Einstellungen mit dem GoPro-WLAN verbinden. Android: Falls die Verbindung scheitert, mobile Daten kurz ausschalten."
                  />
                  <Step n={4} text="Zurück in die App und „Verbinden“ tippen." />
                  {connection === 'failed' && (
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      Keine GoPro erreichbar. Prüfe, ob dein Handy im WLAN der Kamera ist, und tippe
                      erneut auf „Verbinden“.
                    </ThemedText>
                  )}
                  <Button
                    label={connection === 'connecting' ? 'Verbinde …' : 'Verbinden'}
                    variant="primary"
                    disabled={connection === 'connecting'}
                    onPress={connect}
                  />
                </ThemedView>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <GoProVideoRow video={item} disabled={download !== null} onImport={importVideo} />
          )}
        />

        {download && (
          <View style={[StyleSheet.absoluteFill, styles.overlay]}>
            <ThemedView type="backgroundElement" style={styles.downloadCard}>
              <ThemedText type="subtitle">{download.video.file} wird übertragen</ThemedText>
              <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(download.progress * 100)}%`, backgroundColor: theme.primary },
                  ]}
                />
              </View>
              <ThemedText type="numberLarge">{Math.round(download.progress * 100)} %</ThemedText>
              <Button label="Abbrechen" compact onPress={() => abort.current?.abort()} />
            </ThemedView>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
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
      <ThemedText type="small" style={styles.flex}>
        {text}
      </ThemedText>
    </View>
  );
}

function GoProVideoRow({
  video,
  disabled,
  onImport,
}: {
  video: GoProVideo;
  disabled: boolean;
  onImport: (video: GoProVideo, info: GoProVideoInfo | null) => void;
}) {
  const theme = useTheme();
  const [info, setInfo] = useState<GoProVideoInfo | null>(null);

  useEffect(() => {
    getVideoInfo(video).then(setInfo, () => {});
  }, [video]);

  const sizeMb = info?.size ? `${Math.round(info.size / 1_000_000)} MB` : '';

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onImport(video, info)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Image source={thumbnailUrl(video)} style={styles.thumbnail} contentFit="cover" />
      <View style={styles.flex}>
        <ThemedText type="default" numberOfLines={1}>
          {video.file}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDateTime(video.createdAt)}
        </ThemedText>
        {info ? (
          <View style={styles.facts}>
            {info.frameRate ? (
              <View style={[styles.fpsTag, { backgroundColor: theme.highlight }]}>
                <ThemedText style={[styles.fpsText, { color: theme.onHighlight }]}>
                  {formatFps(info.frameRate)}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="number" themeColor="textSecondary">
              {formatTime(info.duration).split('.')[0]}
            </ThemedText>
            {info.height ? (
              <ThemedText type="number" themeColor="textSecondary">
                {info.height}p
              </ThemedText>
            ) : null}
            {sizeMb ? (
              <ThemedText type="number" themeColor="textSecondary">
                {sizeMb}
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <ActivityIndicator size="small" style={styles.infoSpinner} />
        )}
      </View>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>
        Übertragen
      </ThemedText>
    </Pressable>
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
    gap: Spacing.two,
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.control,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.control,
  },
  facts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fpsTag: {
    paddingHorizontal: Spacing.one + Spacing.half,
    borderRadius: Radius.tag,
  },
  fpsText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  thumbnail: {
    width: 80,
    height: 60,
    borderRadius: Radius.tag,
    backgroundColor: '#000',
  },
  infoSpinner: {
    alignSelf: 'flex-start',
  },
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 35, 80, 0.75)',
    padding: Spacing.four,
  },
  downloadCard: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.sheet,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
