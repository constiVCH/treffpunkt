import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import type { GoProDownload } from '@/hooks/use-gopro-import';
import { useTheme } from '@/hooks/use-theme';

export function DownloadOverlay({ download, onCancel }: { download: GoProDownload; onCancel: () => void }) {
  const theme = useTheme();
  const percent = Math.round(download.progress * 100);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">{download.video.file} wird übertragen</ThemedText>
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.primary }]} />
        </View>
        <ThemedText type="numberLarge">{percent} %</ThemedText>
        <Button label="Übertragung abbrechen" compact onPress={onCancel} />
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 35, 80, 0.75)',
    padding: Spacing.four,
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 520,
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.sheet,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
