import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  /** primary: the screen's main action · secondary: everything else · danger: destructive. */
  variant?: 'primary' | 'secondary' | 'danger';
  selected?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = 'secondary',
  selected = false,
  compact = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'primary' || selected;

  const backgroundColor = filled
    ? theme.primary
    : variant === 'danger'
      ? 'transparent'
      : theme.backgroundElement;
  const color = filled ? theme.onPrimary : variant === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        variant === 'danger' && { borderWidth: 1.5, borderColor: theme.danger },
        style,
      ]}
      {...rest}>
      <ThemedText
        numberOfLines={1}
        style={[styles.label, compact && styles.labelCompact, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    minHeight: 48,
  },
  compact: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
  },
  label: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22,
  },
  labelCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
});
