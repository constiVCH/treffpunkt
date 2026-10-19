import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LogoMark } from '@/components/logo-mark';
import { Sheet, SheetAction, TextPrompt } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addFolder,
  addVideo,
  deleteFolder,
  deleteVideo,
  getFolders,
  getVideos,
  moveVideo,
  renameFolder,
  renameVideo,
  type Folder,
  type Video,
} from '@/lib/db';
import { describeError } from '@/lib/export';
import { formatDate, formatDateTime, formatFps, formatTime } from '@/lib/format';
import { ensureThumbnails } from '@/lib/thumbnails';
import { removeVideoFiles, storeVideo } from '@/lib/video-files';

type Source = 'camera' | 'library';

/** What the bottom sheet shows. One sheet changes its content instead of stacking modals. */
type SheetState =
  | { kind: 'video'; video: Video }
  | { kind: 'move'; video: Video }
  | { kind: 'folder'; folder: Folder }
  | {
      kind: 'prompt';
      title: string;
      initialValue?: string;
      placeholder?: string;
      confirmLabel: string;
      onSubmit: (value: string) => Promise<void>;
    };

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  // null shows every video, otherwise only the videos in that folder.
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  // Compare mode: the first selected video waits here for its partner.
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const reload = useCallback(() => {
    Promise.all([getVideos(db), getFolders(db)]).then(([loadedVideos, loadedFolders]) => {
      setVideos(loadedVideos);
      setFolders(loadedFolders);
      ensureThumbnails(db, loadedVideos, (id, thumbnailUri) =>
        setVideos((current) =>
          current.map((video) => (video.id === id ? { ...video, thumbnailUri } : video))
        )
      );
    });
  }, [db]);

  useFocusEffect(reload);

  const visibleVideos =
    activeFolder === null ? videos : videos.filter((video) => video.folderId === activeFolder);
  const folderName = (id: number | null) => folders.find((folder) => folder.id === id)?.name;

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
        // New videos land in the folder that is open.
        folderId: activeFolder,
      });
      router.push({ pathname: '/video/[id]', params: { id } });
    } catch (error) {
      Alert.alert('Video nicht übernommen', describeError(error));
    } finally {
      setBusy(false);
    }
  }

  function startCompare() {
    if (visibleVideos.length < 2) {
      Alert.alert(
        'Vergleichen',
        activeFolder === null
          ? 'Für einen Vergleich brauchst du mindestens zwei Videos.'
          : 'In diesem Ordner brauchst du mindestens zwei Videos für einen Vergleich.'
      );
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

  function selectFolder(id: number | null) {
    setActiveFolder(id);
    // A half-finished comparison would otherwise wait for a video that is now hidden.
    setSelected(null);
  }

  function closeSheet() {
    setSheet(null);
  }

  function promptRenameVideo(video: Video) {
    setSheet({
      kind: 'prompt',
      title: 'Video umbenennen',
      initialValue: video.title,
      confirmLabel: 'Umbenennen',
      onSubmit: (title) => renameVideo(db, video.id, title),
    });
  }

  function promptNewFolder(thenMove?: Video) {
    setSheet({
      kind: 'prompt',
      title: 'Neuer Ordner',
      placeholder: 'z. B. Aufschlag oder Turnier Mai',
      confirmLabel: 'Anlegen',
      onSubmit: async (name) => {
        const id = await addFolder(db, name);
        if (thenMove) {
          await moveVideo(db, thenMove.id, id);
        } else {
          selectFolder(id);
        }
      },
    });
  }

  function promptRenameFolder(folder: Folder) {
    setSheet({
      kind: 'prompt',
      title: 'Ordner umbenennen',
      initialValue: folder.name,
      confirmLabel: 'Umbenennen',
      onSubmit: (name) => renameFolder(db, folder.id, name),
    });
  }

  async function submitPrompt(onSubmit: (value: string) => Promise<void>, value: string) {
    closeSheet();
    try {
      await onSubmit(value);
    } catch (error) {
      Alert.alert('Nicht gespeichert', describeError(error));
    }
    reload();
  }

  async function moveTo(video: Video, folderId: number | null) {
    closeSheet();
    await moveVideo(db, video.id, folderId);
    reload();
  }

  function confirmDelete(video: Video) {
    closeSheet();
    Alert.alert('Video löschen?', `„${video.title}“ wird mit allen Zeichnungen und Notizen gelöscht.`, [
      { text: 'Behalten', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteVideo(db, video.id);
          removeVideoFiles(video);
          reload();
        },
      },
    ]);
  }

  function confirmDeleteFolder(folder: Folder) {
    closeSheet();
    Alert.alert(
      'Ordner löschen?',
      `Die Videos aus „${folder.name}“ bleiben erhalten und stehen danach ohne Ordner unter „Alle“.`,
      [
        { text: 'Behalten', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await deleteFolder(db, folder.id);
            if (activeFolder === folder.id) selectFolder(null);
            reload();
          },
        },
      ]
    );
  }

  const sheetTitle =
    sheet?.kind === 'video'
      ? sheet.video.title
      : sheet?.kind === 'move'
        ? 'Verschieben nach'
        : sheet?.kind === 'folder'
          ? sheet.folder.name
          : sheet?.title;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={visibleVideos}
          keyExtractor={(video) => String(video.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <View style={styles.brand}>
                  <LogoMark size={40} />
                  <ThemedText type="title">Treffpunkt</ThemedText>
                </View>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={Spacing.three}
                  onPress={() => router.push('/about')}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Impressum
                  </ThemedText>
                </Pressable>
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

              {(videos.length > 0 || folders.length > 0) && (
                <>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Deine Videos
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.folders}>
                    <Button
                      label={`Alle ${videos.length}`}
                      compact
                      selected={activeFolder === null}
                      onPress={() => selectFolder(null)}
                    />
                    {folders.map((folder) => (
                      <Button
                        key={folder.id}
                        label={`${folder.name} ${videos.filter((video) => video.folderId === folder.id).length}`}
                        compact
                        selected={activeFolder === folder.id}
                        onPress={() => selectFolder(folder.id)}
                        onLongPress={() => setSheet({ kind: 'folder', folder })}
                      />
                    ))}
                    <Button label="+ Ordner" compact onPress={() => promptNewFolder()} />
                  </ScrollView>
                </>
              )}
            </View>
          }
          ItemSeparatorComponent={() => <View style={[styles.courtLine, { backgroundColor: theme.line }]} />}
          ListEmptyComponent={
            activeFolder !== null ? (
              <View style={styles.empty}>
                <ThemedText type="subtitle">Ordner ist leer</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Halte unter „Alle“ ein Video gedrückt und wähle „In Ordner verschieben“. Neue
                  Aufnahmen und Importe landen direkt in diesem Ordner.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.empty}>
                <ThemedText type="subtitle">Noch keine Videos</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Nimm einen Angriff, Aufschlag oder eine Annahme auf. Du kannst auch ein Video aus
                  deiner Galerie oder von der GoPro holen.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isSelected = selected === item.id;
            const folder = activeFolder === null ? folderName(item.folderId) : undefined;
            return (
              <Pressable
                onPress={() => openVideo(item)}
                onLongPress={() => !comparing && setSheet({ kind: 'video', video: item })}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.row,
                  isSelected && { backgroundColor: theme.backgroundElement, borderLeftColor: theme.highlight },
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={[styles.thumbnail, { backgroundColor: theme.backgroundElement }]}>
                  {item.thumbnailUri ? (
                    <Image
                      source={item.thumbnailUri}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      recyclingKey={String(item.id)}
                    />
                  ) : null}
                  <View style={[styles.tag, { backgroundColor: theme.overlay }]}>
                    <ThemedText style={styles.tagText}>{formatTime(item.duration).split('.')[0]}</ThemedText>
                  </View>
                </View>
                <View style={[styles.flex, styles.rowText]}>
                  <ThemedText numberOfLines={2}>{item.title}</ThemedText>
                  <View style={styles.meta}>
                    {item.frameRate ? (
                      <View style={[styles.tag, styles.inlineTag, { backgroundColor: theme.highlight }]}>
                        <ThemedText style={[styles.tagText, { color: theme.onHighlight }]}>
                          {formatFps(item.frameRate)}
                        </ThemedText>
                      </View>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
                      {folder ? `${formatDate(item.createdAt)} in ${folder}` : formatDate(item.createdAt)}
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            visibleVideos.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
                Lange drücken zum Umbenennen, Verschieben oder Löschen. Das geht auch bei Ordnern.
              </ThemedText>
            ) : undefined
          }
        />
      </SafeAreaView>

      <Sheet visible={sheet !== null} title={sheetTitle} onClose={closeSheet}>
        {sheet?.kind === 'video' && (
          <View>
            <SheetAction label="Umbenennen" onPress={() => promptRenameVideo(sheet.video)} />
            <SheetAction
              label="In Ordner verschieben"
              detail={folderName(sheet.video.folderId)}
              onPress={() => setSheet({ kind: 'move', video: sheet.video })}
            />
            <SheetAction label="Löschen" destructive onPress={() => confirmDelete(sheet.video)} />
          </View>
        )}
        {sheet?.kind === 'move' && (
          <ScrollView style={styles.sheetList}>
            <SheetAction
              label="Kein Ordner"
              selected={sheet.video.folderId === null}
              onPress={() => moveTo(sheet.video, null)}
            />
            {folders.map((folder) => (
              <SheetAction
                key={folder.id}
                label={folder.name}
                selected={sheet.video.folderId === folder.id}
                onPress={() => moveTo(sheet.video, folder.id)}
              />
            ))}
            <SheetAction label="+ Neuer Ordner" onPress={() => promptNewFolder(sheet.video)} />
          </ScrollView>
        )}
        {sheet?.kind === 'folder' && (
          <View>
            <SheetAction label="Umbenennen" onPress={() => promptRenameFolder(sheet.folder)} />
            <SheetAction label="Ordner löschen" destructive onPress={() => confirmDeleteFolder(sheet.folder)} />
          </View>
        )}
        {sheet?.kind === 'prompt' && (
          <TextPrompt
            key={sheet.title}
            initialValue={sheet.initialValue}
            placeholder={sheet.placeholder}
            confirmLabel={sheet.confirmLabel}
            onCancel={closeSheet}
            onSubmit={(value) => submitPrompt(sheet.onSubmit, value)}
          />
        )}
      </Sheet>
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
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
  folders: {
    gap: Spacing.two,
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
  thumbnail: {
    width: 128,
    aspectRatio: 16 / 9,
    borderRadius: Radius.control,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  rowText: {
    gap: Spacing.one,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tag: {
    margin: Spacing.one,
    paddingHorizontal: Spacing.one + Spacing.half,
    borderRadius: Radius.tag,
  },
  inlineTag: {
    margin: 0,
  },
  tagText: {
    fontFamily: Fonts.displayMedium,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  sheetList: {
    maxHeight: 360,
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
