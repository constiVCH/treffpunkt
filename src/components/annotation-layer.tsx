import { useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { angleDegrees, requiredPoints, type Point, type Shape, type Tool } from '@/lib/annotations';

type AnnotationLayerProps = {
  width: number;
  height: number;
  shapes: Shape[];
  tool: Tool | null;
  color: string;
  /** Mirrors the display only; shapes are always stored in unmirrored video coordinates. */
  mirrored: boolean;
  onDrawStart: () => void;
  onCommit: (shape: Shape) => void;
};

const StrokeWidth = 3;
const MinFreehandStep = 0.004;
const MinShapeSize = 8;

export function AnnotationLayer({
  width,
  height,
  shapes,
  tool,
  color,
  mirrored,
  onDrawStart,
  onCommit,
}: AnnotationLayerProps) {
  const [draft, setDraft] = useState<Shape | null>(null);
  // The draft is also kept in a ref so that the release handler sees the latest points.
  const draftRef = useRef<Shape | null>(null);
  const [draftTool, setDraftTool] = useState(tool);

  // Switching tools discards a half-finished angle.
  if (draftTool !== tool) {
    setDraftTool(tool);
    setDraft(null);
  }

  function updateDraft(next: Shape | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function toPoint(event: GestureResponderEvent): Point {
    const x = Math.min(Math.max(event.nativeEvent.locationX / width, 0), 1);
    const y = Math.min(Math.max(event.nativeEvent.locationY / height, 0), 1);
    return { x: mirrored ? 1 - x : x, y };
  }

  function toPx(point: Point) {
    return { x: (mirrored ? 1 - point.x : point.x) * width, y: point.y * height };
  }

  function pxDistance(a: Point, b: Point) {
    const pa = toPx(a);
    const pb = toPx(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }

  function handleGrant(event: GestureResponderEvent) {
    if (!tool) return;
    const point = toPoint(event);
    const current = draftRef.current;
    if (current && current.tool === 'angle' && current.points.length === 2) {
      // Second step of the angle tool: the new touch places the second arm.
      updateDraft({ ...current, points: [...current.points, point] });
      return;
    }
    onDrawStart();
    updateDraft({
      tool,
      color,
      points: tool === 'freehand' ? [point] : [point, point],
    });
  }

  function handleMove(event: GestureResponderEvent) {
    const current = draftRef.current;
    if (!current) return;
    const point = toPoint(event);
    if (current.tool === 'freehand') {
      const last = current.points[current.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < MinFreehandStep) return;
      updateDraft({ ...current, points: [...current.points, point] });
    } else {
      updateDraft({ ...current, points: [...current.points.slice(0, -1), point] });
    }
  }

  function handleRelease() {
    const current = draftRef.current;
    if (!current) return;
    const { points } = current;

    if (current.tool === 'angle' && points.length === 2) {
      // Keep the first arm and wait for the second one, unless it was just a tap.
      if (pxDistance(points[0], points[1]) < MinShapeSize) updateDraft(null);
      return;
    }

    const bigEnough =
      current.tool === 'freehand'
        ? points.length >= 2
        : pxDistance(points[0], points[points.length - 1]) >= MinShapeSize;
    if (points.length >= requiredPoints(current.tool) && bigEnough) {
      onCommit(current);
    }
    updateDraft(null);
  }

  return (
    <View
      style={[styles.layer, { width, height }]}
      pointerEvents={tool ? 'auto' : 'none'}
      onStartShouldSetResponder={() => tool !== null}
      onMoveShouldSetResponder={() => tool !== null}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnnotationShapes
          width={width}
          height={height}
          mirrored={mirrored}
          shapes={draft ? [...shapes, draft] : shapes}
        />
      </View>
    </View>
  );
}

/** Renders shapes without any touch handling, e.g. for exporting a still frame. */
export function AnnotationShapes({
  width,
  height,
  mirrored,
  shapes,
  scale = 1,
}: {
  width: number;
  height: number;
  mirrored: boolean;
  shapes: Shape[];
  /** Multiplies stroke widths and text sizes, for rendering larger than on screen. */
  scale?: number;
}) {
  const toPx = (point: Point) => ({
    x: (mirrored ? 1 - point.x : point.x) * width,
    y: point.y * height,
  });
  return (
    <Svg width={width} height={height}>
      {shapes.map((shape, index) => (
        <ShapeGraphic key={index} shape={shape} toPx={toPx} scale={scale} />
      ))}
    </Svg>
  );
}

function ShapeGraphic({
  shape,
  toPx,
  scale,
}: {
  shape: Shape;
  toPx: (point: Point) => Point;
  scale: number;
}) {
  const points = shape.points.map(toPx);
  const stroke = {
    stroke: shape.color,
    strokeWidth: StrokeWidth * scale,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  switch (shape.tool) {
    case 'freehand':
      return (
        <Path
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}
          {...stroke}
        />
      );
    case 'line':
      return <Line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} {...stroke} />;
    case 'arrow': {
      const [start, end] = points;
      const direction = Math.atan2(end.y - start.y, end.x - start.x);
      const head = 16 * scale;
      const spread = 0.45;
      const left = {
        x: end.x - head * Math.cos(direction - spread),
        y: end.y - head * Math.sin(direction - spread),
      };
      const right = {
        x: end.x - head * Math.cos(direction + spread),
        y: end.y - head * Math.sin(direction + spread),
      };
      return (
        <>
          <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...stroke} />
          <Polygon
            points={`${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`}
            fill={shape.color}
            stroke={shape.color}
            strokeWidth={StrokeWidth * scale}
            strokeLinejoin="round"
          />
        </>
      );
    }
    case 'circle': {
      const [center, edge] = points;
      const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
      return <Circle cx={center.x} cy={center.y} r={radius} {...stroke} />;
    }
    case 'angle':
      return <AngleGraphic points={points} color={shape.color} stroke={stroke} scale={scale} />;
  }
}

function AngleGraphic({
  points,
  color,
  stroke,
  scale,
}: {
  points: Point[];
  color: string;
  stroke: object;
  scale: number;
}) {
  const [a, vertex, c] = points;
  if (!c) {
    return <Line x1={a.x} y1={a.y} x2={vertex.x} y2={vertex.y} {...stroke} />;
  }

  const degrees = angleDegrees(a, vertex, c);
  const unitA = unit(a, vertex);
  const unitC = unit(c, vertex);
  const arcRadius = 26 * scale;
  const arcStart = { x: vertex.x + unitA.x * arcRadius, y: vertex.y + unitA.y * arcRadius };
  const arcEnd = { x: vertex.x + unitC.x * arcRadius, y: vertex.y + unitC.y * arcRadius };
  const sweep = unitA.x * unitC.y - unitA.y * unitC.x > 0 ? 1 : 0;

  // Put the label on the bisector, outside the arc.
  let bisector = { x: unitA.x + unitC.x, y: unitA.y + unitC.y };
  const length = Math.hypot(bisector.x, bisector.y);
  bisector = length > 0.01 ? { x: bisector.x / length, y: bisector.y / length } : { x: -unitA.y, y: unitA.x };
  const label = {
    x: vertex.x + bisector.x * 48 * scale,
    y: vertex.y + (bisector.y * 48 + 6) * scale,
  };
  const text = `${Math.round(degrees)}°`;
  const fontSize = 18 * scale;

  return (
    <>
      <Polyline points={`${a.x},${a.y} ${vertex.x},${vertex.y} ${c.x},${c.y}`} {...stroke} />
      <Path
        d={`M${arcStart.x} ${arcStart.y} A${arcRadius} ${arcRadius} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        stroke={color}
        strokeWidth={2 * scale}
        fill="none"
      />
      <SvgText
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="bold"
        stroke="#000"
        strokeWidth={4 * scale}
        strokeLinejoin="round">
        {text}
      </SvgText>
      <SvgText
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="bold"
        fill={color}>
        {text}
      </SvgText>
    </>
  );
}

function unit(point: Point, origin: Point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
  },
});
