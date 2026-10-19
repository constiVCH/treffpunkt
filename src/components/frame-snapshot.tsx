import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { useRef, type ComponentRef } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AnnotationShapes } from '@/components/annotation-layer';
import type { Shape } from '@/lib/annotations';

type FrameSnapshotProps = {
  thumbnail: VideoThumbnail;
  shapes: Shape[];
  mirrored: boolean;
  /** Width of the picture on screen, so strokes keep their on-screen thickness. */
  screenWidth: number;
  onCaptured: (uri: string) => void;
  onError: (error: unknown) => void;
};

/**
 * Renders a video frame at full resolution with its drawings on top and captures it as a JPEG.
 * Mount it while exporting; it reports back once and should then be unmounted.
 */
export function FrameSnapshot({
  thumbnail,
  shapes,
  mirrored,
  screenWidth,
  onCaptured,
  onError,
}: FrameSnapshotProps) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const done = useRef(false);

  // Lay the view out in points so the captured image has the frame's pixel size.
  const ratio = PixelRatio.get();
  const width = thumbnail.width / ratio;
  const height = thumbnail.height / ratio;
  const scale = screenWidth > 0 ? width / screenWidth : 1;

  function capture() {
    if (done.current) return;
    done.current = true;
    // Give the image one more frame to be drawn before capturing.
    requestAnimationFrame(() => {
      captureRef(ref, { format: 'jpg', quality: 0.92 }).then(onCaptured, onError);
    });
  }

  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="none"
      style={[styles.snapshot, { width, height }]}>
      <Image
        source={thumbnail}
        style={[StyleSheet.absoluteFill, mirrored && styles.mirrored]}
        onLoad={capture}
        onError={(event) => onError(new Error(event.error))}
      />
      <AnnotationShapes width={width} height={height} mirrored={mirrored} shapes={shapes} scale={scale} />
    </View>
  );
}

const styles = StyleSheet.create({
  snapshot: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#000',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
