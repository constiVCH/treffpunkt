/**
 * Treffpunkt's palette comes from an indoor volleyball hall: the blue free zone around the
 * court, the orange playing area, the yellow of the match ball and the white of net tape
 * and court lines. The app always uses this one scheme, light or dark system setting alike,
 * because analysis happens on top of video.
 */

const Hall = {
  /** Free-zone blue: the base of every screen. */
  text: '#F3F5FA',
  background: '#0F2350',
  /** Raised controls and inputs. */
  backgroundElement: '#1B3368',
  backgroundSelected: '#2A4785',
  textSecondary: '#A7B6D6',
  /** Court orange: the main action on a screen. */
  primary: '#FF6B1A',
  onPrimary: '#0F2350',
  /** Ball yellow: measured values such as frame rate and angles. */
  highlight: '#FFD23F',
  onHighlight: '#0F2350',
  /** Court lines, used as dividers. */
  line: 'rgba(243, 245, 250, 0.22)',
  danger: '#FF5A5F',
  /** Translucent blue for controls on top of video. */
  overlay: 'rgba(15, 35, 80, 0.86)',
} as const;

export const Colors = {
  light: Hall,
  dark: Hall,
} as const;

export type ThemeColor = keyof typeof Hall;

export const Fonts = {
  body: 'Saira_400Regular',
  bodyMedium: 'Saira_500Medium',
  bodyBold: 'Saira_600SemiBold',
  /** Scoreboard face for the wordmark, headings and all numbers. */
  display: 'SairaExtraCondensed_700Bold',
  displayMedium: 'SairaExtraCondensed_600SemiBold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii by role, so controls, sheets and tags read as different things. */
export const Radius = {
  control: 6,
  tag: 3,
  sheet: 18,
} as const;

export const MaxContentWidth = 800;
