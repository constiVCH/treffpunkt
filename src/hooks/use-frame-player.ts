import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { useRef, useState } from 'react';

import { setPlayerScrubbing, setPlayerTime } from '@/lib/player-control';

const FallbackFrameRate = 30;

/**
 * A video player with frame-accurate stepping and scrubbing, shared by the analysis
 * and comparison screens.
 */
export function useFramePlayer(uri: string, options: { duration: number; frameRate: number | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 1 / 30;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [position, setPosition] = useState(0);
  // Seeks are asynchronous, so the latest requested time is tracked here for frame stepping.
  const positionRef = useRef(0);
  const [duration, setDuration] = useState(options.duration);
  const [detectedFrameRate, setDetectedFrameRate] = useState<number | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  useEventListener(player, 'sourceLoad', ({ duration: loaded, availableVideoTracks }) => {
    if (loaded > 0) setDuration(loaded);
    const fps = player.videoTrack?.frameRate || availableVideoTracks[0]?.frameRate;
    if (fps) setDetectedFrameRate(fps);

    // Thumbnails respect the recording orientation, the raw track size does not on iOS.
    player
      .generateThumbnailsAsync(0, { maxWidth: 160 })
      .then(([thumbnail]) => setAspect(thumbnail.width / thumbnail.height))
      .catch(() => {
        const size = player.videoTrack?.size;
        setAspect(size && size.height > 0 ? size.width / size.height : 16 / 9);
      });
  });

  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    if (videoTrack?.frameRate) setDetectedFrameRate(videoTrack.frameRate);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    positionRef.current = currentTime;
    setPosition(currentTime);
  });

  const knownFrameRate = detectedFrameRate ?? options.frameRate;
  const frameRate = knownFrameRate ?? FallbackFrameRate;
  const frameAt = (time: number) => Math.floor(time * frameRate + 1e-6);
  // Seek to the middle of a frame so rounding never lands on its neighbour.
  const timeOfFrame = (frame: number) => (frame + 0.5) / frameRate;

  function seekTo(time: number) {
    const clamped = Math.min(Math.max(time, 0), duration || time);
    setPlayerTime(player, clamped);
    positionRef.current = clamped;
    setPosition(clamped);
  }

  function stepFrames(frames: number) {
    player.pause();
    seekTo(timeOfFrame(frameAt(positionRef.current) + frames));
  }

  function setScrubbing(enabled: boolean) {
    setPlayerScrubbing(player, enabled);
  }

  function togglePlay() {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return {
    player,
    isPlaying,
    position,
    positionRef,
    duration,
    /** Frame rate used for stepping (falls back to 30 until known). */
    frameRate,
    /** The real frame rate, or null while it is still unknown. */
    knownFrameRate,
    detectedFrameRate,
    aspect,
    frameAt,
    timeOfFrame,
    seekTo,
    stepFrames,
    setScrubbing,
    togglePlay,
  };
}

/** Size of a picture with the given aspect ratio fitted into a box (contentFit="contain"). */
export function fitContain(box: { width: number; height: number }, aspect: number | null) {
  if (!aspect || box.width <= 0 || box.height <= 0) return { width: 0, height: 0 };
  return box.width / box.height > aspect
    ? { width: box.height * aspect, height: box.height }
    : { width: box.width, height: box.width / aspect };
}
