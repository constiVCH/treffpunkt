import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SheetProps = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A panel sliding up from the bottom edge. Content is swapped inside one sheet rather
 * than stacking modals, because iOS cannot present a modal while another one closes.
 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Without this, iOS rotates an iPad held in landscape to portrait while the sheet is open.
      supportedOrientations={['portrait', 'landscape']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.line }]}>
          {title ? (
            <ThemedText type="subtitle" numberOfLines={2}>
              {title}
            </ThemedText>
          ) : null}
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type SheetActionProps = {
  label: string;
  detail?: string;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
};

/** One full-width choice in a sheet, separated from the next by a court line. */
export function SheetAction({ label, detail, destructive, selected, onPress }: SheetActionProps) {
  const theme = useTheme();
  const color = destructive ? theme.danger : selected ? theme.highlight : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderTopColor: theme.line, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText style={[styles.flex, { color }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

type TextPromptProps = {
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/** A text field with confirm and cancel, for use inside a sheet. Remount it to reset. */
export function TextPrompt({ initialValue = '', placeholder, confirmLabel, onSubmit, onCancel }: TextPromptProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  function submit() {
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <View style={styles.buttons}>
        <Button label="Abbrechen" compact style={styles.flex} onPress={onCancel} />
        <Button label={confirmLabel} variant="primary" compact disabled={!trimmed} style={styles.flex} onPress={submit} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    backgroundColor: 'rgba(5, 12, 30, 0.6)',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  flex: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderTopWidth: 1,
  },
  input: {
    fontFamily: Fonts.body,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderRadius: Radius.control,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
