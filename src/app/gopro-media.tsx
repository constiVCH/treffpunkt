import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DownloadOverlay } from '@/components/download-overlay';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useGoProImport } from '@/hooks/use-gopro-import';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatFps, formatTime } from '@/lib/format';
import {
  getVideoInfo,
  listVideos,
  thumbnailUrl,
  type GoProVideo,
  type GoProVideoInfo,
} from '@/lib/gopro';

export default function GoProMediaScreen() {
  const theme = useTheme();
  const [videos, setVideos] = useState<GoProVideo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { download, importVideo, cancel } = useGoProImport();

  function load() {
    listVideos().then(setVideos, () => setFailed(true));
  }

  function refresh() {
    setFailed(false);
    load();
  }

  useEffect(load, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <FlatList
          data={videos ?? []}
          keyExtractor={(video) => video.path}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText themeColor="textSecondary" style={styles.flex}>
                Tippe auf ein Video, um es zu übertragen und zu analysieren.
              </ThemedText>
              <Button label="Aktualisieren" compact onPress={refresh} />
            </View>
          }
          ListEmptyComponent={
            failed ? (
              <ThemedText style={{ color: theme.danger }}>
                Die GoPro antwortet nicht. Prüfe, ob dein Handy im WLAN der Kamera ist.
              </ThemedText>
            ) : videos === null ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <ThemedText themeColor="textSecondary">Auf der Speicherkarte sind keine Videos.</ThemedText>
            )
          }
          renderItem={({ item }) => (
            <GoProVideoRow video={item} disabled={download !== null} onImport={importVideo} />
          )}
        />
        {download && <DownloadOverlay download={download} onCancel={cancel} />}
      </SafeAreaView>
    </ThemedView>
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
        <ThemedText numberOfLines={1}>{video.file}</ThemedText>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
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
});
