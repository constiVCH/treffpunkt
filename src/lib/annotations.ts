/** A point in normalized video coordinates: (0, 0) is the top-left, (1, 1) the bottom-right. */
export type Point = { x: number; y: number };

export type Tool = 'freehand' | 'line' | 'arrow' | 'circle' | 'angle';

export type Shape = {
  tool: Tool;
  color: string;
  /**
   * freehand: the stroke · line/arrow: start, end · circle: center, edge point ·
   * angle: first arm end, vertex, second arm end.
   */
  points: Point[];
};

export const Tools: { key: Tool; label: string; hint: string }[] = [
  { key: 'freehand', label: '✎ Frei', hint: 'Mit dem Finger frei zeichnen.' },
  { key: 'line', label: '╱ Linie', hint: 'Ziehen, um eine Linie zu zeichnen.' },
  { key: 'arrow', label: '→ Pfeil', hint: 'Ziehen, um einen Pfeil zu zeichnen.' },
  { key: 'circle', label: '◯ Kreis', hint: 'Vom Mittelpunkt nach außen ziehen.' },
  {
    key: 'angle',
    label: '∠ Winkel',
    hint: 'Ersten Schenkel bis zum Scheitelpunkt ziehen, dann den zweiten Endpunkt tippen.',
  },
];

/** Ball yellow, court orange, net white, plus red and green for good/bad comparisons. */
export const AnnotationColors = ['#FFD23F', '#FF6B1A', '#F3F5FA', '#FF5A5F', '#3DDC97'];

/** How long (in video seconds) a drawing stays visible after the frame it was drawn on. */
export const AnnotationHold = 1;

export function isAnnotationVisible(time: number, position: number, frameDuration: number) {
  return position >= time - frameDuration / 2 && position <= time + AnnotationHold;
}

/** Inner angle at `vertex` in degrees (0–180), measured in on-screen pixels. */
export function angleDegrees(a: Point, vertex: Point, c: Point) {
  const a1 = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const a2 = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  let degrees = Math.abs(((a2 - a1) * 180) / Math.PI);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

/** Minimum number of points a shape needs before it can be saved. */
export function requiredPoints(tool: Tool) {
  return tool === 'angle' ? 3 : 2;
}
