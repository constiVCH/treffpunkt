import Svg, { Circle, ClipPath, Defs, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/**
 * The Treffpunkt mark: earlier frames of the ball rising to the contact point, inside a
 * camera viewfinder. Geometry matches assets/logo/treffpunkt-mark.svg.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  const { text, primary, highlight, background } = Colors.dark;
  return (
    <Svg width={size} height={size} viewBox="176 176 672 672" accessibilityLabel="Treffpunkt">
      <Defs>
        <ClipPath id="ball">
          <Circle cx={628} cy={392} r={124} />
        </ClipPath>
      </Defs>
      <Path
        d="M196 312 V196 H312 M712 196 H828 V312 M828 712 V828 H712 M312 828 H196 V712"
        fill="none"
        stroke={text}
        strokeWidth={40}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={456.8} cy={520.4} r={64} fill="none" stroke={primary} strokeWidth={14} />
      <Circle cx={353.2} cy={614.2} r={50} fill="none" stroke={primary} strokeWidth={10} />
      <Circle cx={279.3} cy={698.2} r={36} fill="none" stroke={primary} strokeWidth={7} />
      <Circle cx={628} cy={392} r={124} fill={highlight} />
      <Path
        d="M628 392 Q529.6 352.3 604.4 258.1 M628 392 Q711.6 326.7 755.8 438.5 M628 392 Q642.8 497.0 523.8 479.4"
        clipPath="url(#ball)"
        fill="none"
        stroke={background}
        strokeWidth={16}
        strokeLinecap="round"
      />
    </Svg>
  );
}
