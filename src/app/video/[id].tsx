import Slider from '@react-native-community/slider';
import { useEventListener } from 'expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { VideoView, type VideoThumbnail } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnnotationLayer } from '@/components/annotation-layer';
import { Button } from '@/components/button';
import { FrameSnapshot } from '@/components/frame-snapshot';
import { JogWheel } from '@/components/jog-wheel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { fitContain, useFramePlayer } from '@/hooks/use-frame-player';
import { useTheme } from '@/hooks/use-theme';
import {
  AnnotationColors,
  isAnnotationVisible,
  Tools,
  type Shape,
  type Tool,
} from '@/lib/annotations';
import {
  addAnnotation,
  addNote,
  deleteAnnotations,
  deleteNote,
  deleteVideo,
  getAnnotations,
  getNotes,
  getVideo,
  renameVideo,
  setVideoFrameRate,
  type Annotation,
  type Note,
  type Video,
} from '@/lib/db';
import { describeError, saveToGallery, shareFile } from '@/lib/export';
import { formatFps, formatTime } from '@/lib/format';
import { setPlayerRate } from '@/lib/player-control';
import { removeVideoFile } from '@/lib/video-files';

const Speeds = [0.1, 0.25, 0.5, 1];

type Panel = 'draw' | 'tempo' | 'notes' | 'export';
const Panels: { key: Panel; icon: string; label: string }[] = [
  { key: 'draw', icon: '✎', label: 'Zeichnen' },
  { key: 'tempo', icon: '⏱', label: 'Tempo & Schleife' },
  { key: 'notes', icon: '✍', label: 'Notizen' },
  { key: 'export', icon: '⤴', label: 'Export' },
];

type Snapshot = {
  thumbnail: VideoThumbnail;
  shapes: Shape[];
  target: 'share' | 'gallery';
};

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [video, setVideo] = useState<Video | null | undefined>(undefined);

  useEffect(() => {
    getVideo(db, Number(id)).then(setVideo);
  }, [db, id]);

  return (
    <>
      <StatusBar hidden />
      {video === undefined && <View style={styles.screen} />}
      {video === null && (
        <ThemedView style={[styles.screen, styles.center]}>
          <ThemedText>Video nicht gefunden.</ThemedText>
          <Button label="Zurück" compact onPress={() => router.back()} />
        </ThemedView>
      )}
      {video && <Analyzer video={video} />}
    </>
  );
}

function Analyzer({ video }: { video: Video }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const landscape = window.width > window.height;

  const {
    player,
    isPlaying,
    position,
    positionRef,
    duration,
    frameRate,
    knownFrameRate,
    detectedFrameRate,
    aspect,
    frameAt,
    timeOfFrame,
    seekTo,
    stepFrames,
    setScrubbing,
    togglePlay,
  } = useFramePlayer(video.uri, video);

  const [box, setBox] = useState({ width: 0, height: 0 });
  const jogStartFrame = useRef(0);
  const drawTime = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [mirrored, setMirrored] = useState(false);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const [tool, setTool] = useState<Tool | null>(null);
  const [color, setColor] = useState(AnnotationColors[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [title, setTitle] = useState(video.title);

  const reloadNotes = useCallback(() => {
    getNotes(db, video.id).then(setNotes);
  }, [db, video.id]);

  useEffect(reloadNotes, [reloadNotes]);

  useEffect(() => {
    getAnnotations(db, video.id).then(setAnnotations);
  }, [db, video.id]);

  // Remember the detected frame rate so the library can show it.
  useEffect(() => {
    if (detectedFrameRate && detectedFrameRate !== video.frameRate) {
      setVideoFrameRate(db, video.id, detectedFrameRate);
    }
  }, [db, detectedFrameRate, video.frameRate, video.id]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // Keep playback inside the A–B segment while it is set.
    if (isPlaying && loopStart !== null && loopEnd !== null && currentTime >= loopEnd) {
      seekTo(loopStart);
    }
  });

  function changeSpeed(value: number) {
    setPlayerRate(player, value);
    setSpeed(value);
  }

  function markLoop() {
    const now = positionRef.current;
    if (loopStart === null || loopEnd !== null) {
      setLoopStart(now);
      setLoopEnd(null);
    } else if (now > loopStart) {
      setLoopEnd(now);
      seekTo(loopStart);
    } else {
      setLoopStart(now);
    }
  }

  function clearLoop() {
    setLoopStart(null);
    setLoopEnd(null);
  }

  function togglePanel(key: Panel) {
    setPanel((current) => (current === key ? null : key));
  }

  // --- Drawings ---

  const visibleAnnotations = annotations.filter((annotation) =>
    isAnnotationVisible(annotation.time, position, 1 / frameRate)
  );

  function handleDrawStart() {
    player.pause();
    drawTime.current = positionRef.current;
  }

  async function handleCommit(shape: Shape) {
    const time = drawTime.current;
    const id = await addAnnotation(db, video.id, time, shape);
    setAnnotations((list) => [...list, { id, videoId: video.id, time, shape }]);
  }

  async function undoAnnotation() {
    const last = visibleAnnotations.reduce<Annotation | null>(
      (latest, annotation) => (!latest || annotation.id > latest.id ? annotation : latest),
      null
    );
    if (!last) return;
    await deleteAnnotations(db, [last.id]);
    setAnnotations((list) => list.filter((annotation) => annotation.id !== last.id));
  }

  function clearVisibleAnnotations() {
    const ids = visibleAnnotations.map((annotation) => annotation.id);
    Alert.alert('Zeichnungen löschen?', `${ids.length} Zeichnung(en) an dieser Stelle entfernen.`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteAnnotations(db, ids);
          setAnnotations((list) => list.filter((annotation) => !ids.includes(annotation.id)));
        },
      },
    ]);
  }

  // --- Export ---

  async function exportFrame(target: Snapshot['target']) {
    player.pause();
    setBusy(true);
    try {
      const [thumbnail] = await player.generateThumbnailsAsync(positionRef.current, {
        maxWidth: 1920,
        maxHeight: 1920,
      });
      setSnapshot({
        thumbnail,
        shapes: visibleAnnotations.map((annotation) => annotation.shape),
        target,
      });
    } catch (error) {
      console.error('[export] frame grab failed', error);
      setBusy(false);
      Alert.alert('Standbild nicht erstellt', describeError(error));
    }
  }

  async function handleSnapshot(uri: string) {
    const target = snapshot?.target;
    setSnapshot(null);
    try {
      if (target === 'gallery') {
        await saveToGallery(uri);
        Alert.alert('Gespeichert', 'Das Standbild liegt jetzt in deiner Galerie.');
      } else {
        await shareFile(uri);
      }
    } catch (error) {
      console.error('[export] frame export failed', error);
      Alert.alert('Standbild nicht exportiert', describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function exportVideo(target: Snapshot['target']) {
    player.pause();
    setBusy(true);
    try {
      if (target === 'gallery') {
        await saveToGallery(video.uri);
        Alert.alert('Gespeichert', 'Das Video liegt jetzt in deiner Galerie.');
      } else {
        await shareFile(video.uri);
      }
    } catch (error) {
      console.error('[export] video export failed', video.uri, error);
      Alert.alert('Video nicht exportiert', describeError(error));
    } finally {
      setBusy(false);
    }
  }

  // --- Notes & video ---

  async function saveNote() {
    const text = noteText.trim();
    if (!text) return;
    await addNote(db, video.id, positionRef.current, text);
    setNoteText('');
    reloadNotes();
  }

  function confirmDeleteNote(note: Note) {
    Alert.alert('Notiz löschen?', note.text, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(db, note.id);
          reloadNotes();
        },
      },
    ]);
  }

  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(video.title);
      return;
    }
    await renameVideo(db, video.id, trimmed);
  }

  function confirmDeleteVideo() {
    Alert.alert('Video löschen?', 'Das Video, alle Zeichnungen und Notizen werden entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          player.pause();
          await deleteVideo(db, video.id);
          removeVideoFile(video.uri);
          router.back();
        },
      },
    ]);
  }

  const content = fitContain(box, aspect);
  const markerTimes = [
    ...new Set(annotations.map((annotation) => Math.round(annotation.time * 10) / 10)),
  ];
  const loopLabel = loopStart === null ? 'A setzen' : loopEnd === null ? 'B setzen' : 'Neues A';
  const activeTool = Tools.find((t) => t.key === tool);
  const sideInsets = { paddingLeft: insets.left + Spacing.two, paddingRight: insets.right + Spacing.two };

  const jogWheel = (
    <JogWheel
      style={landscape ? styles.flex : undefined}
      onScrubStart={() => {
        player.pause();
        setScrubbing(true);
        jogStartFrame.current = frameAt(positionRef.current);
      }}
      onScrub={(frames) => seekTo(timeOfFrame(jogStartFrame.current + frames))}
      onScrubEnd={() => setScrubbing(false)}
    />
  );

  const transport = (
    <View style={styles.row}>
      <Button label="−1" compact accessibilityLabel="Ein Bild zurück" style={styles.icon} onPress={() => stepFrames(-1)} />
      <Button
        label={isPlaying ? '❚❚' : '▶'}
        accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}
        variant="primary"
        compact
        style={styles.play}
        onPress={togglePlay}
      />
      <Button label="+1" compact accessibilityLabel="Ein Bild vor" style={styles.icon} onPress={() => stepFrames(1)} />
    </View>
  );

  const panelTabs = (
    <View style={styles.row}>
      {Panels.map((p) => (
        <Button
          key={p.key}
          label={p.icon}
          accessibilityLabel={p.label}
          compact
          selected={panel === p.key}
          style={styles.icon}
          onPress={() => togglePanel(p.key)}
        />
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.stage} onLayout={(event: LayoutChangeEvent) => setBox(event.nativeEvent.layout)}>
        <View style={[StyleSheet.absoluteFill, mirrored && styles.mirrored]} pointerEvents="none">
          {/* TextureView on Android so the picture can be mirrored and resized safely. */}
          <VideoView
            player={player}
            nativeControls={false}
            contentFit="contain"
            surfaceType="textureView"
            style={StyleSheet.absoluteFill}
          />
        </View>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={isPlaying ? 'Pause' : 'Abspielen'}
          onPress={togglePlay}
          disabled={tool !== null}
        />
        {content.width > 0 && (
          <AnnotationLayer
            width={content.width}
            height={content.height}
            shapes={visibleAnnotations.map((annotation) => annotation.shape)}
            tool={tool}
            color={color}
            mirrored={mirrored}
            onDrawStart={handleDrawStart}
            onCommit={handleCommit}
          />
        )}

        {controlsVisible ? (
          <View
            style={[
              styles.topBar,
              sideInsets,
              { paddingTop: insets.top + Spacing.two, backgroundColor: theme.overlay },
            ]}>
            <Button label="‹" compact accessibilityLabel="Zurück" style={styles.icon} onPress={() => router.back()} />
            <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
              {title.trim() || video.title}
            </ThemedText>
            {activeTool && panel !== 'draw' && (
              <Button label={`${activeTool.label}  ✕`} compact selected onPress={() => setTool(null)} />
            )}
            <View style={[styles.fpsBadge, { backgroundColor: theme.highlight }]}>
              <ThemedText type="number" style={{ color: theme.onHighlight }}>
                {formatFps(knownFrameRate)}
              </ThemedText>
            </View>
            <Button
              label="⤢"
              compact
              accessibilityLabel="Bedienelemente ausblenden"
              style={styles.icon}
              onPress={() => {
                setPanel(null);
                setControlsVisible(false);
              }}
            />
          </View>
        ) : (
          <View style={[styles.restore, { bottom: insets.bottom + Spacing.three, right: insets.right + Spacing.three }]}>
            <View style={[styles.fpsBadge, { backgroundColor: theme.overlay }]}>
              <ThemedText type="number">{formatTime(position)}</ThemedText>
            </View>
            <View style={[styles.fpsBadge, { backgroundColor: theme.highlight }]}>
              <ThemedText type="number" style={{ color: theme.onHighlight }}>
                {formatFps(knownFrameRate)}
              </ThemedText>
            </View>
            <Button
              label="⤡"
              compact
              accessibilityLabel="Bedienelemente einblenden"
              style={styles.icon}
              onPress={() => setControlsVisible(true)}
            />
          </View>
        )}

        {controlsVisible && panel && (
          <View style={[styles.panel, sideInsets, { backgroundColor: theme.overlay }]}>
            <ScrollView
              style={{ maxHeight: box.height * 0.6 }}
              contentContainerStyle={styles.panelContent}
              keyboardShouldPersistTaps="handled">
              <ThemedText type="subtitle">{Panels.find((p) => p.key === panel)?.label}</ThemedText>

              {panel === 'draw' && (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                    <Button label="Aus" compact selected={tool === null} onPress={() => setTool(null)} />
                    {Tools.map((t) => (
                      <Button
                        key={t.key}
                        label={t.label}
                        compact
                        selected={tool === t.key}
                        onPress={() => setTool(t.key)}
                      />
                    ))}
                  </ScrollView>
                  <View style={styles.row}>
                    {AnnotationColors.map((value) => (
                      <Pressable
                        key={value}
                        accessibilityLabel={`Farbe ${value}`}
                        onPress={() => setColor(value)}
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: value,
                            borderColor: color === value ? theme.text : theme.backgroundSelected,
                          },
                        ]}
                      />
                    ))}
                    <View style={styles.flex} />
                    <Button label="↶" compact disabled={visibleAnnotations.length === 0} onPress={undoAnnotation} />
                    <Button
                      label="Leeren"
                      compact
                      disabled={visibleAnnotations.length === 0}
                      onPress={clearVisibleAnnotations}
                    />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {activeTool
                      ? `${activeTool.hint} Das Panel kannst du zum Zeichnen schließen – das Werkzeug bleibt aktiv.`
                      : 'Wähle ein Werkzeug. Zeichnungen gehören zum aktuellen Bild und erscheinen beim Abspielen für 1 s.'}
                  </ThemedText>
                </>
              )}

              {panel === 'tempo' && (
                <>
                  <View style={styles.row}>
                    {Speeds.map((value) => (
                      <Button
                        key={value}
                        label={`${String(value).replace('.', ',')}×`}
                        compact
                        selected={speed === value}
                        style={styles.flex}
                        onPress={() => changeSpeed(value)}
                      />
                    ))}
                  </View>
                  <View style={styles.row}>
                    <Button label={loopLabel} compact style={styles.flex} onPress={markLoop} />
                    <Button
                      label="Schleife aus"
                      compact
                      disabled={loopStart === null}
                      style={styles.flex}
                      onPress={clearLoop}
                    />
                    <Button
                      label="Spiegeln"
                      compact
                      selected={mirrored}
                      style={styles.flex}
                      onPress={() => setMirrored((value) => !value)}
                    />
                  </View>
                  {loopStart !== null && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Schleife: {formatTime(loopStart)} – {loopEnd !== null ? formatTime(loopEnd) : '…'}
                    </ThemedText>
                  )}
                </>
              )}

              {panel === 'notes' && (
                <>
                  <View style={styles.row}>
                    <TextInput
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder={`Notiz bei ${formatTime(position)}`}
                      placeholderTextColor={theme.textSecondary}
                      onSubmitEditing={saveNote}
                      returnKeyType="done"
                      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                    />
                    <Button label="+" variant="primary" compact disabled={!noteText.trim()} onPress={saveNote} />
                  </View>
                  {notes.map((note) => (
                    <Pressable
                      key={note.id}
                      onPress={() => {
                        player.pause();
                        seekTo(note.time);
                      }}
                      onLongPress={() => confirmDeleteNote(note)}
                      style={({ pressed }) => [
                        styles.note,
                        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <ThemedText type="number" style={{ color: theme.highlight }}>
                        {formatTime(note.time)}
                      </ThemedText>
                      <ThemedText type="small" style={styles.flex}>
                        {note.text}
                      </ThemedText>
                    </Pressable>
                  ))}
                  {notes.length > 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Tippen springt zur Stelle, lange drücken löscht.
                    </ThemedText>
                  )}
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
                    Titel
                  </ThemedText>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    onEndEditing={saveTitle}
                    returnKeyType="done"
                    style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  />
                  <Button label="Video löschen" variant="danger" compact onPress={confirmDeleteVideo} />
                </>
              )}

              {panel === 'export' && (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Standbild des aktuellen Bilds inklusive Zeichnungen:
                  </ThemedText>
                  <View style={styles.row}>
                    <Button label="Bild teilen" compact disabled={busy} style={styles.flex} onPress={() => exportFrame('share')} />
                    <Button label="Bild in Galerie" compact disabled={busy} style={styles.flex} onPress={() => exportFrame('gallery')} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Originalvideo (ohne Zeichnungen):
                  </ThemedText>
                  <View style={styles.row}>
                    <Button label="Video teilen" compact disabled={busy} style={styles.flex} onPress={() => exportVideo('share')} />
                    <Button label="Video in Galerie" compact disabled={busy} style={styles.flex} onPress={() => exportVideo('gallery')} />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {controlsVisible && (
        <View
          style={[
            styles.bottomBar,
            sideInsets,
            { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background },
          ]}>
          <View style={styles.timeRow}>
            <ThemedText type="numberLarge">{formatTime(position)}</ThemedText>
            <ThemedText type="number" themeColor="textSecondary" style={styles.flex}>
              Bild {frameAt(position) + 1}
            </ThemedText>
            <ThemedText type="number" themeColor="textSecondary">
              {formatTime(duration)}
            </ThemedText>
          </View>
          <View>
            <View style={styles.markers} pointerEvents="none">
              {duration > 0 &&
                markerTimes.map((time) => (
                  <View
                    key={time}
                    style={[styles.marker, { left: `${(time / duration) * 100}%`, backgroundColor: theme.highlight }]}
                  />
                ))}
            </View>
            <Slider
              minimumValue={0}
              maximumValue={Math.max(duration, 0.1)}
              value={position}
              onSlidingStart={() => {
                player.pause();
                setScrubbing(true);
              }}
              onValueChange={seekTo}
              onSlidingComplete={() => setScrubbing(false)}
              minimumTrackTintColor={theme.primary}
              maximumTrackTintColor={theme.backgroundSelected}
              thumbTintColor={theme.primary}
            />
          </View>
          {landscape ? (
            <View style={styles.row}>
              {transport}
              {jogWheel}
              {panelTabs}
            </View>
          ) : (
            <>
              {jogWheel}
              <View style={[styles.row, styles.spread]}>
                {transport}
                {panelTabs}
              </View>
            </>
          )}
        </View>
      )}

      {snapshot && (
        <FrameSnapshot
          thumbnail={snapshot.thumbnail}
          shapes={snapshot.shapes}
          mirrored={mirrored}
          screenWidth={content.width}
          onCaptured={handleSnapshot}
          onError={(error) => {
            console.error('[export] snapshot capture failed', error);
            setSnapshot(null);
            setBusy(false);
            Alert.alert('Standbild nicht erstellt', describeError(error));
          }}
        />
      )}
      {busy && (
        <View style={[StyleSheet.absoluteFill, styles.busy]}>
          <ActivityIndicator color={theme.primary} size="large" />
          <ThemedText type="small">Export läuft …</ThemedText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
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
  },
  restore: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fpsBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.tag,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  panelContent: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  bottomBar: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spread: {
    justifyContent: 'space-between',
  },
  icon: {
    minWidth: 44,
    paddingHorizontal: Spacing.two,
  },
  play: {
    minWidth: 56,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
  },
  markers: {
    height: 8,
    marginHorizontal: Spacing.three,
  },
  marker: {
    position: 'absolute',
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
  },
  section: {
    marginTop: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: Spacing.two + Spacing.one,
    borderRadius: Radius.control,
    fontFamily: Fonts.body,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.control,
  },
  busy: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(15, 35, 80, 0.7)',
  },
});
