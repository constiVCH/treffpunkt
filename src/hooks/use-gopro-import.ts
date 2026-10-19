import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { addVideo } from '@/lib/db';
import { describeError } from '@/lib/export';
import { formatDateTime } from '@/lib/format';
import { downloadVideo, getVideoInfo, type GoProVideo, type GoProVideoInfo } from '@/lib/gopro';

export type GoProDownload = { video: GoProVideo; progress: number };

/** Transfers a video from the GoPro into the library and opens it in the analysis. */
export function useGoProImport() {
  const db = useSQLiteContext();
  const [download, setDownload] = useState<GoProDownload | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Cancel a running transfer when leaving the screen.
  useEffect(() => () => abort.current?.abort(), []);

  async function importVideo(video: GoProVideo, knownInfo?: GoProVideoInfo | null) {
    const controller = new AbortController();
    abort.current = controller;
    setDownload({ video, progress: 0 });
    try {
      const info = knownInfo ?? (await getVideoInfo(video).catch(() => null));
      const uri = await downloadVideo(
        video,
        (progress) => setDownload({ video, progress }),
        controller.signal
      );
      const id = await addVideo(db, {
        title: `GoPro ${video.file.replace(/\.mp4$/i, '')} vom ${formatDateTime(video.createdAt)}`,
        uri,
        duration: info?.duration ?? 0,
        frameRate: info?.frameRate,
      });
      router.replace({ pathname: '/video/[id]', params: { id } });
    } catch (error) {
      if (!controller.signal.aborted) {
        Alert.alert('Video nicht übertragen', describeError(error));
      }
    } finally {
      abort.current = null;
      setDownload(null);
    }
  }

  function cancel() {
    abort.current?.abort();
  }

  return { download, importVideo, cancel };
}
