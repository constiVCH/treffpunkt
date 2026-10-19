/**
 * Open GoPro HTTP API (HERO9 and newer) over the camera's own WiFi access point.
 * Endpoints follow the official Open GoPro SDK: https://github.com/gopro/OpenGoPro
 */
import { File } from 'expo-file-system';

import { newVideoFile } from '@/lib/video-files';

export const GoProBaseUrl = 'http://10.5.5.9:8080';

/** Status ID 10: whether the camera is currently encoding (recording). */
const StatusEncoding = '10';

export type GoProVideo = {
  /** Camera path, e.g. "100GOPRO/GX010042.MP4". */
  path: string;
  folder: string;
  file: string;
  /** Creation time in milliseconds since epoch. */
  createdAt: number;
};

export type GoProVideoInfo = {
  frameRate: number | null;
  duration: number;
  width: number;
  height: number;
  size: number;
};

async function request(path: string, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GoProBaseUrl}${path}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`GoPro antwortet mit Fehler ${response.status}.`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function getRecordingState(): Promise<{ recording: boolean }> {
  const response = await request('/gopro/camera/state');
  const state = (await response.json()) as { status?: Record<string, number> };
  return { recording: state.status?.[StatusEncoding] === 1 };
}

/** Keeps the camera from going to sleep; GoPro recommends calling it every few seconds. */
export async function keepAlive() {
  await request('/gopro/camera/keep_alive');
}

export async function setShutter(recording: boolean) {
  await request(`/gopro/camera/shutter/${recording ? 'start' : 'stop'}`, 8000);
}

/** UDP port the camera sends its live preview (MPEG-TS) to, on the phone's address. */
export const PreviewPort = 8554;
export const PreviewUrl = `udp://@:${PreviewPort}`;

export async function startPreview() {
  // A stream left running from an earlier session makes "start" fail, so stop it first.
  await stopPreview().catch(() => {});
  await request(`/gopro/camera/stream/start?port=${PreviewPort}`);
}

export async function stopPreview() {
  await request('/gopro/camera/stream/stop');
}

export async function listVideos(): Promise<GoProVideo[]> {
  const response = await request('/gopro/media/list', 10000);
  const list = (await response.json()) as {
    media?: { d: string; fs: { n: string; cre: string }[] }[];
  };
  return (list.media ?? [])
    .flatMap((directory) =>
      directory.fs.map((item) => ({
        path: `${directory.d}/${item.n}`,
        folder: directory.d,
        file: item.n,
        createdAt: Number(item.cre) * 1000,
      }))
    )
    .filter((video) => /\.mp4$/i.test(video.file))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVideoInfo(video: GoProVideo): Promise<GoProVideoInfo> {
  const response = await request(`/gopro/media/info?path=${encodeURIComponent(video.path)}`);
  const info = (await response.json()) as Record<string, string | undefined>;
  const fps = Number(info.fps);
  const denominator = Number(info.fps_denom);
  // Fractional rates (e.g. 239.76) are reported as numerator and denominator.
  const frameRate = fps > 0 ? (denominator > 1 && fps / denominator >= 10 ? fps / denominator : fps) : null;
  return {
    frameRate,
    duration: Number(info.dur) || 0,
    width: Number(info.w) || 0,
    height: Number(info.h) || 0,
    size: Number(info.s) || 0,
  };
}

export function thumbnailUrl(video: GoProVideo) {
  return `${GoProBaseUrl}/gopro/media/thumbnail?path=${encodeURIComponent(video.path)}`;
}

/** Downloads a video from the camera into the app's video folder and returns its local URI. */
export async function downloadVideo(
  video: GoProVideo,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<string> {
  const target = newVideoFile('.mp4');
  try {
    const file = await File.downloadFileAsync(
      `${GoProBaseUrl}/videos/DCIM/${video.folder}/${video.file}`,
      target,
      {
        signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
        },
      }
    );
    return file.uri;
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  }
}
