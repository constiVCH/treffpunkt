import * as MediaLibrary from 'expo-media-library';
import * as LegacyMediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

/** Turns any thrown value into a message that says what failed, for alerts and the dev log. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    return code ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}

/** Opens the system share sheet (AirDrop, WhatsApp, Mail, Files …) for a local file. */
export async function shareFile(uri: string) {
  try {
    await Sharing.shareAsync(uri);
  } catch (error) {
    console.error('[export] expo-sharing failed', uri, error);
    // iOS can share local files through React Native's own share sheet as well.
    if (Platform.OS === 'ios') {
      await Share.share({ url: uri });
      return;
    }
    throw error;
  }
}

/** Saves a local image or video file to the device gallery. */
export async function saveToGallery(uri: string) {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      throw new Error('Kein Zugriff auf die Galerie. Erlaube ihn in den Einstellungen.');
    }
    await MediaLibrary.Asset.create(uri);
  } catch (error) {
    console.error('[export] media library failed, trying legacy API', uri, error);
    const permission = await LegacyMediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      throw new Error('Kein Zugriff auf die Galerie. Erlaube ihn in den Einstellungen.');
    }
    await LegacyMediaLibrary.saveToLibraryAsync(uri);
  }
}
