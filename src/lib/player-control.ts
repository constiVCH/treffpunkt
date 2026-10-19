import type { VideoPlayer } from 'expo-video';
import { Platform } from 'react-native';

// Players returned from hooks are treated as immutable by the React Compiler, so their
// imperative properties are set through these helpers.

export function setPlayerTime(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

export function setPlayerRate(player: VideoPlayer, rate: number) {
  player.playbackRate = rate;
}

/** Faster decoding for many quick seeks (jog wheel, slider). Pause playback while it is on. */
export function setPlayerScrubbing(player: VideoPlayer, enabled: boolean) {
  if (Platform.OS !== 'web') {
    player.scrubbingModeOptions = { scrubbingModeEnabled: enabled };
  }
}
