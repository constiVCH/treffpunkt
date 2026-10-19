import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { VideoView } from 'expo-video';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { JogWheel } from '@/components/jog-wheel';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useFramePlayer } from '@/hooks/use-frame-player';
import { useTheme } from '@/hooks/use-theme';
import { getVideosByIds, type Video } from '@/lib/db';
import { formatFps, formatTime } from '@/lib/format';
import { setPlayerRate } from '@/lib/player-control';

const Speeds = [0.1, 0.25, 0.5, 1];

type PaneHandle = {
  play: () => void;
  pause: () => void;
  setRate: (rate: number) => void;
  frameDuration: () => number;
  /** Starts a scrub that moves this pane relative to its current position. */
  beginScrub: () => void;
  scrubBy: (seconds: number) => void;
  endScrub: () => void;
};

export default function CompareScreen() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const db = useSQLiteContext();
  const [videos, setVideos] = useState<[Video, Video] | null>(null);

  useEffect(() => {
    getVideosByIds(db, [Number(a), Number(b)]).then((rows) => {
      const first = rows.find((row) => row.id === Number(a));
      const second = rows.find((row) => row.id === Number(b));
      if (first && second) setVideos([first, second]);
    });
  }, [db, a, b]);

  return (
    <>
      <StatusBar hidden />
      {videos ? <Comparison videos={videos} /> : <View style={styles.screen} />}
    </>
  );
}

function Comparison({ videos }: { videos: [Video, Video] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [sideBySide, setSideBySide] = useState(window.width > window.height);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const first = useRef<PaneHandle>(null);
  const second = useRef<PaneHandle>(null);

  const panes = () => [first.current, second.current].filter((pane) => pane !== null);

  function togglePlay() {
    if (playing) {
      panes().forEach((pane) => pane.pause());
    } else {
      panes().forEach((pane) => pane.play());
    }
    setPlaying(!playing);
  }

  function pauseAll() {
    panes().forEach((pane) => pane.pause());
    setPlaying(false);
  }

  /** Both panes move by the same time, one frame of the faster video, so they stay aligned. */
  function syncStep() {
    return Math.min(...panes().map((pane) => pane.frameDuration()));
  }

  function stepBoth(direction: 1 | -1) {
    pauseAll();
    const step = syncStep();
    panes().forEach((pane) => {
      pane.beginScrub();
      pane.scrubBy(direction * step);
      pane.endScrub();
    });
  }

  function changeSpeed(value: number) {
    panes().forEach((pane) => pane.setRate(value));
    setSpeed(value);
  }

  const sideInsets = { paddingLeft: insets.left + Spacing.two, paddingRight: insets.right + Spacing.two };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, sideInsets, { paddingTop: insets.top + Spacing.two }]}>
        <Button label="‹" compact accessibilityLabel="Zurück" style={styles.icon} onPress={() => router.back()} />
        <ThemedText type="subtitle" style={styles.flex}>
          Vergleich
        </ThemedText>
        <Button
          label={sideBySide ? 'Untereinander' : 'Nebeneinander'}
          compact
          onPress={() => {
            // Re-layout with both videos paused; resizing two decoding surfaces is the riskiest moment.
            pauseAll();
            setSideBySide((value) => !value);
          }}
        />
      </View>

      <View style={[styles.panes, sideBySide && styles.sideBySide, sideInsets]}>
        <ComparePane ref={first} video={videos[0]} onInteract={pauseAll} />
        <ComparePane ref={second} video={videos[1]} onInteract={pauseAll} />
      </View>

      <View style={[styles.bottomBar, sideInsets, { paddingBottom: insets.bottom + Spacing.two }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Bring beide Videos mit ihrem eigenen Rad auf denselben Moment, z. B. den Absprung. Dieses
          Rad und die Tasten bewegen dann beide gemeinsam.
        </ThemedText>
        <JogWheel
          onScrubStart={() => {
            pauseAll();
            panes().forEach((pane) => pane.beginScrub());
          }}
          onScrub={(frames) => {
            const step = syncStep();
            panes().forEach((pane) => pane.scrubBy(frames * step));
          }}
          onScrubEnd={() => panes().forEach((pane) => pane.endScrub())}
        />
        <View style={styles.row}>
          <Button label="−1" compact accessibilityLabel="Beide ein Bild zurück" style={styles.icon} onPress={() => stepBoth(-1)} />
          <Button
            label={playing ? '❚❚' : '▶'}
            accessibilityLabel={playing ? 'Beide pausieren' : 'Beide abspielen'}
            variant="primary"
            compact
            style={styles.play}
            onPress={togglePlay}
          />
          <Button label="+1" compact accessibilityLabel="Beide ein Bild vor" style={styles.icon} onPress={() => stepBoth(1)} />
        </View>
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
      </View>
    </View>
  );
}

function ComparePane({
  video,
  ref,
  onInteract,
}: {
  video: Video;
  ref: Ref<PaneHandle>;
  /** Called when this pane is adjusted on its own, so the shared playback stops. */
  onInteract: () => void;
}) {
  const theme = useTheme();
  const {
    player,
    position,
    positionRef,
    frameRate,
    knownFrameRate,
    frameAt,
    seekTo,
    setScrubbing,
  } = useFramePlayer(video.uri, video);
  const [mirrored, setMirrored] = useState(false);
  const scrubStart = useRef(0);
  const jogStartTime = useRef(0);

  useImperativeHandle(ref, () => ({
    play: () => player.play(),
    pause: () => player.pause(),
    setRate: (rate) => setPlayerRate(player, rate),
    frameDuration: () => 1 / frameRate,
    beginScrub: () => {
      setScrubbing(true);
      scrubStart.current = positionRef.current;
    },
    scrubBy: (seconds) => seekTo(scrubStart.current + seconds),
    endScrub: () => setScrubbing(false),
  }));

  return (
    <View style={styles.pane}>
      <View style={styles.video}>
        <View style={[StyleSheet.absoluteFill, mirrored && styles.mirrored]} pointerEvents="none">
          <VideoView
            player={player}
            nativeControls={false}
            contentFit="contain"
            surfaceType="textureView"
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={[styles.label, { backgroundColor: theme.overlay }]} pointerEvents="none">
          <ThemedText type="small" numberOfLines={1}>
            {video.title}
          </ThemedText>
          <View style={styles.figures}>
            <ThemedText type="number">{formatTime(position)}</ThemedText>
            <ThemedText type="number" themeColor="textSecondary">
              Bild {frameAt(position) + 1}
            </ThemedText>
            <View style={[styles.fpsTag, { backgroundColor: theme.highlight }]}>
              <ThemedText type="number" style={{ color: theme.onHighlight }}>
                {formatFps(knownFrameRate)}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.row}>
        <JogWheel
          style={styles.flex}
          onScrubStart={() => {
            onInteract();
            setScrubbing(true);
            jogStartTime.current = positionRef.current;
          }}
          onScrub={(frames) => seekTo(jogStartTime.current + frames / frameRate)}
          onScrubEnd={() => setScrubbing(false)}
        />
        <Button
          label="⇋"
          accessibilityLabel="Spiegeln"
          compact
          selected={mirrored}
          style={styles.icon}
          onPress={() => setMirrored((value) => !value)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F2350',
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  panes: {
    flex: 1,
    gap: Spacing.two,
    alignItems: 'stretch',
  },
  pane: {
    flex: 1,
    gap: Spacing.one,
  },
  video: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: Radius.control,
    backgroundColor: '#000',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  figures: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fpsTag: {
    paddingHorizontal: Spacing.one + Spacing.half,
    borderRadius: Radius.tag,
  },
  bottomBar: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  icon: {
    minWidth: 44,
    paddingHorizontal: Spacing.two,
  },
  play: {
    minWidth: 56,
  },
  sideBySide: {
    flexDirection: 'row',
  },
});
