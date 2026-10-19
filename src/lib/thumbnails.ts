import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { setVideoThumbnail, type Video } from '@/lib/db';

const ThumbnailWidth = 320;
const LoadTimeout = 15_000;

// Videos whose thumbnail is being generated or could not be generated in this session.
const attempted = new Set<number>();

/**
 * Generates missing thumbnails one after another, so a large library never decodes
 * several videos at once. Covers new recordings, imports and videos from before thumbnails.
 */
export async function ensureThumbnails(
  db: SQLiteDatabase,
  videos: Video[],
  onThumbnail: (id: number, thumbnailUri: string) => void
) {
  // expo-video cannot extract frames on the web.
  if (Platform.OS === 'web') return;

  for (const video of videos) {
    if (video.thumbnailUri || attempted.has(video.id)) continue;
    attempted.add(video.id);
    try {
      const uri = await createThumbnail(video.uri, video.duration);
      await setVideoThumbnail(db, video.id, uri);
      onThumbnail(video.id, uri);
    } catch {
      // The list shows a placeholder instead.
    }
  }
}

async function createThumbnail(videoUri: string, duration: number): Promise<string> {
  const player = createVideoPlayer(videoUri);
  player.muted = true;
  try {
    await waitUntilReady(player);
    // A moment into the clip shows the scene rather than a dark first frame.
    const time = Math.min(1, (player.duration || duration) / 2);
    const [thumbnail] = await player.generateThumbnailsAsync(time, { maxWidth: ThumbnailWidth });
    const image = await ImageManipulator.manipulate(thumbnail).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

    // Saved images land in the cache, which the OS may clear.
    const folder = new Directory(Paths.document, 'thumbnails');
    if (!folder.exists) {
      folder.create({ intermediates: true });
    }
    const target = new File(folder, `thumb-${Date.now()}.jpg`);
    await new File(saved.uri).move(target);
    return target.uri;
  } finally {
    player.release();
  }
}

function waitUntilReady(player: VideoPlayer) {
  if (player.status === 'readyToPlay') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error('Video lädt nicht.'));
    }, LoadTimeout);
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status !== 'readyToPlay' && status !== 'error') return;
      clearTimeout(timer);
      subscription.remove();
      if (status === 'readyToPlay') resolve();
      else reject(new Error(error?.message ?? 'Video lädt nicht.'));
    });
  });
}
