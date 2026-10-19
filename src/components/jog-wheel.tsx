import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Finger travel per video frame. Each tick on the wheel is one frame. */
const PxPerFrame = 12;
const TickCount = 80;

type JogWheelProps = {
  onScrubStart: () => void;
  /** Frames moved since the gesture started; positive means forward in time. */
  onScrub: (frames: number) => void;
  onScrubEnd: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * A film-strip style scrubber: dragging left moves forward, dragging right moves back,
 * one frame per tick.
 */
export function JogWheel({ onScrubStart, onScrub, onScrubEnd, style }: JogWheelProps) {
  const theme = useTheme();
  const startX = useRef(0);
  const lastFrames = useRef(0);
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState(false);

  function handleGrant(event: GestureResponderEvent) {
    startX.current = event.nativeEvent.pageX;
    lastFrames.current = 0;
    setActive(true);
    onScrubStart();
  }

  function handleMove(event: GestureResponderEvent) {
    const dx = event.nativeEvent.pageX - startX.current;
    setOffset(dx);
    const frames = Math.round(-dx / PxPerFrame);
    if (frames !== lastFrames.current) {
      lastFrames.current = frames;
      onScrub(frames);
    }
  }

  function handleEnd() {
    setActive(false);
    onScrubEnd();
  }

  const shift = (((offset % PxPerFrame) + PxPerFrame) % PxPerFrame) - PxPerFrame;

  return (
    <View
      style={[styles.wheel, { backgroundColor: theme.backgroundElement }, style]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleEnd}>
      <View style={[styles.ticks, { transform: [{ translateX: shift }] }]} pointerEvents="none">
        {Array.from({ length: TickCount }, (_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              { backgroundColor: theme.text, height: i % 5 === 0 ? 24 : 12 },
            ]}
          />
        ))}
      </View>
      <View style={[styles.center, { backgroundColor: theme.primary }]} pointerEvents="none" />
      {!active && (
        <View style={styles.labelBox} pointerEvents="none">
          <ThemedText
            type="smallBold"
            style={[styles.label, { backgroundColor: theme.backgroundElement }]}
            themeColor="textSecondary">
            Wischen für Einzelbilder
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: 52,
    borderRadius: Radius.control,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tick: {
    width: 2,
    marginRight: PxPerFrame - 2,
    borderRadius: 1,
    opacity: 0.35,
  },
  center: {
    position: 'absolute',
    left: '50%',
    width: 3,
    height: '100%',
    marginLeft: -1.5,
  },
  labelBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.tag,
  },
});
