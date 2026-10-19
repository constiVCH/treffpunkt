import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LogoMark } from '@/components/logo-mark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addVideo, deleteVideo, getVideos, type Video } from '@/lib/db';
import { describeError } from '@/lib/export';
import { formatDate, formatDateTime, formatFps, formatTime } from '@/lib/format';
import { removeVideoFile, storeVideo } from '@/lib/video-files';

type Source = 'camera' | 'library';

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  // Compare mode: the first selected video waits here for its partner.
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const reload = useCallback(() => {
    getVideos(db).then(setVideos);
  }, [db]);

  useFocusEffect(reload);

  async function capture(source: Source) {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Kein Zugriff',
        source === 'camera'
          ? 'Erlaube den Kamerazugriff in den Einstellungen, um aufzunehmen.'
          : 'Erlaube den Zugriff auf deine Videos in den Einstellungen, um zu importieren.'
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['videos'],
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
            // Keep the original file (including high frame rates) instead of a transcoded copy.
            preferredAssetRepresentationMode:
              ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
          });
    if (result.canceled) return;

    const asset = result.assets[0];
    setBusy(true);
    try {
      const uri = await storeVideo(asset.uri);
      const prefix = source === 'camera' ? 'Aufnahme' : 'Import';
      const id = await addVideo(db, {
        title: `${prefix} vom ${formatDateTime(Date.now())}`,
        uri,
        // The picker reports duration in milliseconds.
        duration: (asset.duration ?? 0) / 1000,
      });
      router.push({ pathname: '/video/[id]', params: { id } });
    } catch (error) {
      Alert.alert('Video nicht übernommen', describeError(error));
    } finally {
      setBusy(false);
    }
  }

  function startCompare() {
    if (videos.length < 2) {
      Alert.alert('Vergleichen', 'Für einen Vergleich brauchst du mindestens zwei Videos.');
      return;
    }
    setComparing(true);
    setSelected(null);
  }

  function stopCompare() {
    setComparing(false);
    setSelected(null);
  }

  function openVideo(video: Video) {
    if (!comparing) {
      router.push({ pathname: '/video/[id]', params: { id: video.id } });
    } else if (selected === null) {
      setSelected(video.id);
    } else if (selected === video.id) {
      setSelected(null);
    } else {
      router.push({ pathname: '/compare', params: { a: selected, b: video.id } });
      stopCompare();
    }
  }

  function confirmDelete(video: Video) {
    Alert.alert('Video löschen?', `„${video.title}“ wird mit allen Zeichnungen und Notizen gelöscht.`, [
      { text: 'Behalten', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteVideo(db, video.id);
          removeVideoFile(video.uri);
          reload();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={videos}
          keyExtractor={(video) => String(video.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.brand}>
                <LogoMark size={40} />
                <ThemedText type="title">Treffpunkt</ThemedText>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aufnehmen"
                disabled={busy}
                onPress={() => capture('camera')}
                style={({ pressed }) => [
                  styles.record,
                  { backgroundColor: theme.primary, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
                ]}>
                <View style={[styles.recordDot, { borderColor: theme.onPrimary }]}>
                  <View style={[styles.recordDotInner, { backgroundColor: theme.onPrimary }]} />
                </View>
                <View style={styles.flex}>
                  <ThemedText style={[styles.recordLabel, { color: theme.onPrimary }]}>
                    Aufnehmen
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.onPrimary }}>
                    Danach geht es direkt in die Analyse.
                  </ThemedText>
                </View>
              </Pressable>

              <View style={styles.actions}>
                <Button label="Importieren" compact disabled={busy} style={styles.flex} onPress={() => capture('library')} />
                <Button label="GoPro" compact disabled={busy} style={styles.flex} onPress={() => router.push('/gopro')} />
                <Button
                  label={comparing ? 'Abbrechen' : 'Vergleichen'}
                  compact
                  selected={comparing}
                  disabled={busy}
                  style={styles.flex}
                  onPress={comparing ? stopCompare : startCompare}
                />
              </View>

              {busy && (
                <View style={styles.status}>
                  <ActivityIndicator color={theme.primary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Video wird übernommen …
                  </ThemedText>
                </View>
              )}
              {comparing && (
                <ThemedText type="smallBold" style={{ color: theme.highlight }}>
                  {selected === null
                    ? 'Tippe auf das erste Video für den Vergleich.'
                    : 'Tippe jetzt auf das zweite Video.'}
                </ThemedText>
              )}

              {videos.length > 0 && (
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Deine Videos
                </ThemedText>
              )}
            </View>
          }
          ItemSeparatorComponent={() => <View style={[styles.courtLine, { backgroundColor: theme.line }]} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText type="subtitle">Noch keine Videos</ThemedText>
              <ThemedText themeColor="textSecondary">
                Nimm einen Angriff, Aufschlag oder eine Annahme auf. Du kannst auch ein Video aus
                deiner Galerie oder von der GoPro holen.
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selected === item.id;
            return (
              <Pressable
                onPress={() => openVideo(item)}
                onLongPress={() => !comparing && confirmDelete(item)}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.row,
                  isSelected && { backgroundColor: theme.backgroundElement, borderLeftColor: theme.highlight },
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={styles.rowFigures}>
                  <ThemedText type="numberLarge">{formatTime(item.duration).split('.')[0]}</ThemedText>
                  {item.frameRate ? (
                    <View style={[styles.fpsTag, { backgroundColor: theme.highlight }]}>
                      <ThemedText style={[styles.fpsText, { color: theme.onHighlight }]}>
                        {formatFps(item.frameRate)}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={2}>{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDate(item.createdAt)}
                  </ThemedText>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            videos.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
                Lange drücken, um ein Video zu löschen.
              </ThemedText>
            ) : undefined
          }
        />
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
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    marginTop: Spacing.two,
  },
  recordDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDotInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  recordLabel: {
    fontFamily: Fonts.display,
    fontSize: 37,
    lineHeight: 40,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.four,
  },
  courtLine: {
    height: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  rowFigures: {
    width: 76,
    alignItems: 'flex-start',
    gap: Spacing.one,
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
  empty: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    maxWidth: 520,
  },
  footer: {
    marginTop: Spacing.three,
  },
});
