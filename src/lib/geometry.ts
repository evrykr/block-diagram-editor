import type {
  Bounds,
  Diagram,
  DiagramEdge,
  DiagramNode,
  Point,
  Side,
  Viewport,
} from '../types/diagram';
import { measureLabel } from './text';

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const snap = (value: number, step = 10) => Math.round(value / step) * step;

export function createId(prefix = 'n'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const nodeCenter = (node: DiagramNode): Point => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2,
});

export const nodeBounds = (node: DiagramNode): Bounds => ({
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
});

export function anchorPoint(node: DiagramNode, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
  }
}

export function sideDirection(side: Side): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
  }
}

export function nearestSide(node: DiagramNode, point: Point): Side {
  const center = nodeCenter(node);
  const nx = clamp(point.x, node.x, node.x + node.width);
  const ny = clamp(point.y, node.y, node.y + node.height);
  const distances: Record<Side, number> = {
    top: Math.abs(ny - node.y) + Math.abs(point.x - center.x) * 0.12,
    bottom:
      Math.abs(ny - (node.y + node.height)) +
      Math.abs(point.x - center.x) * 0.12,
    left: Math.abs(nx - node.x) + Math.abs(point.y - center.y) * 0.12,
    right:
      Math.abs(nx - (node.x + node.width)) +
      Math.abs(point.y - center.y) * 0.12,
  };
  return SIDES.reduce((best, side) =>
    distances[side] < distances[best] ? side : best,
  );
}

export function autoSides(
  from: DiagramNode,
  to: DiagramNode,
): { fromSide: Side; toSide: Side } {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    return dx >= 0
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' };
  }
  return dy >= 0
    ? { fromSide: 'bottom', toSide: 'top' }
    : { fromSide: 'top', toSide: 'bottom' };
}

export function nodePath(node: DiagramNode): string {
  const { x, y, width: w, height: h } = node;
  switch (node.kind) {
    case 'start':
    case 'end': {
      const r = h / 2;
      return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
    }
    case 'process':
    case 'predefined':
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    case 'decision':
      return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;
    case 'io': {
      const s = Math.min(22, w * 0.12);
      return `M ${x + s} ${y} H ${x + w} L ${x + w - s} ${y + h} H ${x} Z`;
    }
    case 'document': {
      const wave = Math.min(9, h * 0.12);
      const base = y + h - wave;
      return `M ${x} ${y} H ${x + w} V ${base} C ${x + w * 0.78} ${base - wave * 1.7}, ${x + w * 0.57} ${base + wave * 1.5}, ${x + w * 0.38} ${base} C ${x + w * 0.24} ${base - wave * 1.1}, ${x + w * 0.1} ${base + wave * 0.8}, ${x} ${base - wave * 0.35} Z`;
    }
    case 'preparation': {
      const s = Math.min(28, w * 0.14);
      return `M ${x + s} ${y} H ${x + w - s} L ${x + w} ${y + h / 2} L ${x + w - s} ${y + h} H ${x + s} L ${x} ${y + h / 2} Z`;
    }
    case 'manual': {
      const s = Math.min(22, w * 0.1);
      return `M ${x} ${y} H ${x + w} L ${x + w - s} ${y + h} H ${x + s} Z`;
    }
    case 'delay': {
      const r = h / 2;
      return `M ${x} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x} Z`;
    }
    case 'connector': {
      const r = Math.min(w, h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }
    case 'comment': {
      const notch = Math.min(18, h * 0.24);
      const lip = Math.min(16, w * 0.1);
      return `M ${x + lip} ${y} H ${x + w} V ${y + h} H ${x + lip} V ${y + h - notch} H ${x + 5} V ${y + notch} H ${x + lip} Z`;
    }
  }
}

export function simplifyPoints(points: Point[]): Point[] {
  const unique = points.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point.x - points[index - 1].x) > 0.01 ||
      Math.abs(point.y - points[index - 1].y) > 0.01,
  );
  if (unique.length < 3) return unique;
  const result: Point[] = [unique[0]];
  for (let index = 1; index < unique.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = unique[index];
    const next = unique[index + 1];
    const collinearX =
      Math.abs(previous.x - current.x) < 0.01 &&
      Math.abs(current.x - next.x) < 0.01;
    const collinearY =
      Math.abs(previous.y - current.y) < 0.01 &&
      Math.abs(current.y - next.y) < 0.01;
    if (!collinearX && !collinearY) result.push(current);
  }
  result.push(unique[unique.length - 1]);
  return result;
}

export function roundedPath(points: Point[], radius = 10): string {
  const pts = simplifyPoints(points);
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let index = 1; index < pts.length - 1; index += 1) {
    const previous = pts[index - 1];
    const current = pts[index];
    const next = pts[index + 1];
    const lengthIn = Math.hypot(current.x - previous.x, current.y - previous.y);
    const lengthOut = Math.hypot(next.x - current.x, next.y - current.y);
    const r = Math.min(radius, lengthIn / 2, lengthOut / 2);
    if (r < 0.5) {
      d += ` L ${current.x} ${current.y}`;
      continue;
    }
    const before = {
      x: current.x - ((current.x - previous.x) / lengthIn) * r,
      y: current.y - ((current.y - previous.y) / lengthIn) * r,
    };
    const after = {
      x: current.x + ((next.x - current.x) / lengthOut) * r,
      y: current.y + ((next.y - current.y) / lengthOut) * r,
    };
    d += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function sameSideRoute(
  from: Point,
  to: Point,
  side: Side,
  offset = 38,
): Point[] {
  switch (side) {
    case 'top': {
      const lane = Math.min(from.y, to.y) - offset;
      return [from, { x: from.x, y: lane }, { x: to.x, y: lane }, to];
    }
    case 'bottom': {
      const lane = Math.max(from.y, to.y) + offset;
      return [from, { x: from.x, y: lane }, { x: to.x, y: lane }, to];
    }
    case 'left': {
      const lane = Math.min(from.x, to.x) - offset;
      return [from, { x: lane, y: from.y }, { x: lane, y: to.y }, to];
    }
    case 'right': {
      const lane = Math.max(from.x, to.x) + offset;
      return [from, { x: lane, y: from.y }, { x: lane, y: to.y }, to];
    }
  }
}

export function edgePoints(
  edge: DiagramEdge,
  fromNode: DiagramNode,
  toNode: DiagramNode,
): { points: Point[]; fromSide: Side; toSide: Side } {
  const auto = autoSides(fromNode, toNode);
  const fromSide = edge.fromSide ?? auto.fromSide;
  const toSide = edge.toSide ?? auto.toSide;
  const start = anchorPoint(fromNode, fromSide);
  const end = anchorPoint(toNode, toSide);

  if (edge.waypoints?.length) {
    return {
      points: simplifyPoints([start, ...edge.waypoints, end]),
      fromSide,
      toSide,
    };
  }

  if (fromSide === toSide) {
    return {
      points: simplifyPoints(sameSideRoute(start, end, fromSide)),
      fromSide,
      toSide,
    };
  }

  const fromDir = sideDirection(fromSide);
  const toDir = sideDirection(toSide);
  const stub = 24;
  const p1 = { x: start.x + fromDir.x * stub, y: start.y + fromDir.y * stub };
  const p2 = { x: end.x + toDir.x * stub, y: end.y + toDir.y * stub };
  const vertical = (side: Side) => side === 'top' || side === 'bottom';
  let middle: Point[] = [];

  if (vertical(fromSide) && vertical(toSide)) {
    const midY = (p1.y + p2.y) / 2;
    middle = [
      { x: p1.x, y: midY },
      { x: p2.x, y: midY },
    ];
  } else if (!vertical(fromSide) && !vertical(toSide)) {
    const midX = (p1.x + p2.x) / 2;
    middle = [
      { x: midX, y: p1.y },
      { x: midX, y: p2.y },
    ];
  } else if (vertical(fromSide)) {
    middle = [{ x: p1.x, y: p2.y }];
  } else {
    middle = [{ x: p2.x, y: p1.y }];
  }

  return {
    points: simplifyPoints([start, p1, ...middle, p2, end]),
    fromSide,
    toSide,
  };
}

export function pointOnPolyline(points: Point[], ratio: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    lengths.push(length);
    total += length;
  }
  let target = total * clamp(ratio, 0, 1);
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const local = lengths[index] === 0 ? 0 : target / lengths[index];
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * local,
        y: points[index].y + (points[index + 1].y - points[index].y) * local,
      };
    }
    target -= lengths[index];
  }
  return points[points.length - 1];
}

export function diagramBounds(nodes: DiagramNode[], padding = 0): Bounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Bounds of every visible element, including orthogonal edge lanes and labels.
 * Used for fitting and exporting so nothing at the edge of the drawing is cut.
 */
export function diagramContentBounds(
  diagram: Diagram,
  padding = 0,
): Bounds {
  if (diagram.nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  let minX = Math.min(...diagram.nodes.map((node) => node.x));
  let minY = Math.min(...diagram.nodes.map((node) => node.y));
  let maxX = Math.max(
    ...diagram.nodes.map((node) => node.x + node.width),
  );
  let maxY = Math.max(
    ...diagram.nodes.map((node) => node.y + node.height),
  );
  for (const edge of diagram.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const geometry = edgePoints(edge, from, to);
    for (const point of geometry.points) {
      minX = Math.min(minX, point.x - 3);
      minY = Math.min(minY, point.y - 3);
      maxX = Math.max(maxX, point.x + 10);
      maxY = Math.max(maxY, point.y + 10);
    }
    if (edge.label) {
      const point = pointOnPolyline(
        geometry.points,
        edge.branch ? 0.24 : 0.5,
      );
      const labelWidth = measureLabel(edge.label, 11.5, 600) + 18;
      minX = Math.min(minX, point.x - labelWidth / 2);
      maxX = Math.max(maxX, point.x + labelWidth / 2);
      minY = Math.min(minY, point.y - 22);
      maxY = Math.max(maxY, point.y);
    }
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
}

export function fitViewport(
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = 90,
  maxZoom = 1.15,
): Viewport {
  const zoom = Math.min(
    (viewportWidth - padding * 2) / Math.max(bounds.width, 1),
    (viewportHeight - padding * 2) / Math.max(bounds.height, 1),
    maxZoom,
  );
  const safeZoom = clamp(zoom, 0.2, 1.6);
  return {
    zoom: safeZoom,
    x: viewportWidth / 2 - (bounds.x + bounds.width / 2) * safeZoom,
    y: viewportHeight / 2 - (bounds.y + bounds.height / 2) * safeZoom,
  };
}

export function screenToWorld(
  point: Point,
  viewport: Viewport,
): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function nodesBoundingBox(nodes: DiagramNode[]): Bounds {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function rectsOverlap(
  a: Bounds,
  b: Bounds,
  gap = 0,
): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export function orthogonalDistanceToSegment(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      (dx * dx + dy * dy),
    0,
    1,
  );
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}
