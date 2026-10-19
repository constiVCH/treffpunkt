import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'number' | 'numberLarge';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

// Sizes follow a 4:3 scale from the 16 pt body: 12 · 16 · 21 · 28 · 37 · 50.
const styles = StyleSheet.create({
  default: {
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 24,
  },
  small: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 37,
    lineHeight: 40,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: Fonts.displayMedium,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  /** Timecodes, frame numbers, durations: equal-width digits so values don't jitter. */
  number: {
    fontFamily: Fonts.displayMedium,
    fontSize: 18,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  numberLarge: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
});
