import { LibVlcPlayerView } from 'expo-libvlc-player';
import type { StyleProp, ViewStyle } from 'react-native';

import { PreviewUrl } from '@/lib/gopro';

// Keep the buffer small so the preview lags the camera as little as possible.
const LowLatencyOptions = ['--network-caching=150', '--clock-jitter=0', '--clock-synchro=0'];

type GoProLiveViewProps = {
  style?: StyleProp<ViewStyle>;
  onPlaying: () => void;
  onError: (message: string) => void;
};

/**
 * The GoPro's UDP preview stream. Needs the native libVLC module, so it only exists in a
 * development or release build, never in Expo Go.
 */
export function GoProLiveView({ style, onPlaying, onError }: GoProLiveViewProps) {
  return (
    <LibVlcPlayerView
      style={style}
      source={PreviewUrl}
      options={LowLatencyOptions}
      contentFit="contain"
      mute
      autoplay
      onPlaying={onPlaying}
      onEncounteredError={(event) => onError(event.message)}
    />
  );
}
