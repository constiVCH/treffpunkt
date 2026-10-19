import { Directory, File, Paths } from 'expo-file-system';

/**
 * Picked and recorded videos live in temporary locations that the OS may clear,
 * so we copy them into the app's document directory.
 */
export async function storeVideo(sourceUri: string): Promise<string> {
  const source = new File(sourceUri);
  const target = newVideoFile(source.extension || '.mp4');
  await source.copy(target);
  return target.uri;
}

/** A not-yet-existing file in the app's video folder, e.g. as a download target. */
export function newVideoFile(extension: string): File {
  const folder = new Directory(Paths.document, 'videos');
  if (!folder.exists) {
    folder.create({ intermediates: true });
  }
  return new File(folder, `video-${Date.now()}${extension}`);
}

/** Deletes a library video's file and its thumbnail. */
export function removeVideoFiles(video: { uri: string; thumbnailUri: string | null }) {
  for (const uri of [video.uri, video.thumbnailUri]) {
    if (!uri) continue;
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  }
}
