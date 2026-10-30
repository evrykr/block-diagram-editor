import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { Diagram, DiagramEdge, Side } from '../types/diagram';
import { anchorPoint, nodeCenter, snap } from './geometry';

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function autoLayoutDiagram(diagram: Diagram): Diagram {
  if (diagram.nodes.length < 2) return diagram;
  const graph = new graphlib.Graph({ directed: true, multigraph: true });
  graph.setGraph({
    rankdir: 'TB',
    nodesep: 54,
    ranksep: 48,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
    ranker: 'network-simplex',
    acyclicer: 'greedy',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of diagram.nodes) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }
  let index = 0;
  for (const edge of diagram.edges) {
    if (edge.back) continue;
    if (edge.loopExit) {
      const tails = diagram.edges
        .filter((candidate) => candidate.back && candidate.to === edge.from)
        .map((candidate) => candidate.from);
      for (const tail of tails) {
        if (tail !== edge.to) {
          graph.setEdge(tail, edge.to, { weight: 0, minlen: 1 }, `h${index}`);
          index += 1;
        }
      }
      continue;
    }
    graph.setEdge(edge.from, edge.to, { weight: 1, minlen: 1 }, `e${index}`);
    index += 1;
  }
  try {
    dagreLayout(graph);
  } catch {
    return diagram;
  }

  const positions = new Map<string, { x: number; y: number }>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const node of diagram.nodes) {
    const point = graph.node(node.id);
    if (!point) return diagram;
    const x = point.x - node.width / 2;
    const y = point.y - node.height / 2;
    positions.set(node.id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  const shiftX = 110 - minX;
  const shiftY = 90 - minY;
  for (const point of positions.values()) {
    point.x = snap(point.x + shiftX, 5);
    point.y = snap(point.y + shiftY, 5);
  }

  const layoutNodes: LayoutNode[] = diagram.nodes.map((node) => ({
    id: node.id,
    width: node.width,
    height: node.height,
    ...positions.get(node.id)!,
  }));
  const layoutMap = new Map(layoutNodes.map((node) => [node.id, node]));
  const maxRight = Math.max(
    ...layoutNodes.map((node) => node.x + node.width),
  );
  const minLeft = Math.min(...layoutNodes.map((node) => node.x));
  let backLane = 0;
  let exitLane = 0;

  const edges: DiagramEdge[] = diagram.edges.map((edge) => {
    const from = layoutMap.get(edge.from);
    const to = layoutMap.get(edge.to);
    if (!from || !to) return edge;
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    const next: DiagramEdge = { ...edge, waypoints: undefined };

    if (edge.loopExit) {
      const lane = maxRight + 46 + exitLane * 28;
      exitLane += 1;
      next.fromSide = 'right';
      next.toSide = 'top';
      next.waypoints = [
        { x: lane, y: fromCenter.y },
        { x: lane, y: to.y - 32 },
        { x: toCenter.x, y: to.y - 32 },
      ];
      return next;
    }
    if (edge.back) {
      if (toCenter.y < fromCenter.y) {
        const lane = minLeft - 42 - backLane * 28;
        backLane += 1;
        next.fromSide = 'bottom';
        next.toSide = 'left';
        next.waypoints = [
          { x: fromCenter.x, y: from.y + from.height + 28 },
          { x: lane, y: from.y + from.height + 28 },
          { x: lane, y: toCenter.y },
        ];
      } else {
        const lane = maxRight + 46 + backLane * 28;
        backLane += 1;
        next.fromSide = 'bottom';
        next.toSide = 'right';
        next.waypoints = [
          { x: fromCenter.x, y: from.y + from.height + 28 },
          { x: lane, y: from.y + from.height + 28 },
          { x: lane, y: toCenter.y },
        ];
      }
      return next;
    }
    const fromNode = diagram.nodes.find((node) => node.id === edge.from);
    if (fromNode?.kind === 'decision' && (edge.branch || edge.label)) {
      if (
        Math.abs(toCenter.x - fromCenter.x) < 24 &&
        toCenter.y > fromCenter.y
      ) {
        next.fromSide = 'bottom';
        next.toSide = 'top';
      } else {
        const side: Side = toCenter.x < fromCenter.x ? 'left' : 'right';
        next.fromSide = side;
        next.toSide = 'top';
      }
      return next;
    }
    if (toCenter.y > fromCenter.y + 20) {
      next.fromSide = 'bottom';
      next.toSide = 'top';
    } else if (toCenter.y < fromCenter.y - 20) {
      next.fromSide = 'top';
      next.toSide = 'bottom';
    } else if (Math.abs(toCenter.x - fromCenter.x) > 4) {
      next.fromSide = toCenter.x > fromCenter.x ? 'right' : 'left';
      next.toSide = toCenter.x > fromCenter.x ? 'left' : 'right';
    } else {
      next.fromSide = 'bottom';
      next.toSide = 'top';
    }
    return next;
  });

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      ...positions.get(node.id)!,
    })),
    edges,
    updatedAt: Date.now(),
  };
}

export function anchorFor(
  edge: DiagramEdge,
  diagram: Diagram,
  nodeId: string,
): { x: number; y: number } | null {
  const node = diagram.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const center = nodeCenter(node);
  void center;
  const side =
    edge.from === nodeId ? edge.fromSide ?? 'bottom' : edge.toSide ?? 'top';
  return anchorPoint(node, side);
}
