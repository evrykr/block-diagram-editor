import type { Diagram, DiagramEdge, DiagramNode } from '../types/diagram';
import { NODE_MAP } from '../constants/design';
import { createId } from '../lib/geometry';

const node = (
  id: string,
  kind: DiagramNode['kind'],
  text: string,
  x: number,
  y: number,
  width?: number,
  height?: number,
): DiagramNode => ({
  id,
  kind,
  text,
  x,
  y,
  width: width ?? NODE_MAP[kind].width,
  height: height ?? NODE_MAP[kind].height,
});

const edge = (
  id: string,
  from: string,
  to: string,
  extra: Partial<DiagramEdge> = {},
): DiagramEdge => ({ id, from, to, ...extra });

export function createDemoDiagram(): Diagram {
  return {
    title: 'Проверка чётности числа',
    updatedAt: Date.now(),
    nodes: [
      node('demo-start', 'start', 'Начало', 520, 70),
      node('demo-input', 'io', 'Ввод: n', 510, 185),
      node('demo-decision', 'decision', 'n mod 2 = 0?', 495, 325),
      node('demo-even', 'io', 'Вывод: «чётное»', 200, 555),
      node('demo-odd', 'io', 'Вывод: «нечётное»', 780, 555),
      node('demo-end', 'end', 'Конец', 520, 760),
    ],
    edges: [
      edge('e-start-input', 'demo-start', 'demo-input'),
      edge('e-input-decision', 'demo-input', 'demo-decision'),
      edge('e-decision-even', 'demo-decision', 'demo-even', {
        fromSide: 'left',
        toSide: 'top',
        label: 'Да',
        branch: 'yes',
      }),
      edge('e-decision-odd', 'demo-decision', 'demo-odd', {
        fromSide: 'right',
        toSide: 'top',
        label: 'Нет',
        branch: 'no',
      }),
      edge('e-even-end', 'demo-even', 'demo-end', {
        fromSide: 'bottom',
        toSide: 'top',
      }),
      edge('e-odd-end', 'demo-odd', 'demo-end', {
        fromSide: 'bottom',
        toSide: 'top',
      }),
    ],
  };
}

/**
 * The first demo version used a connector circle between the two branches.
 * Convert that saved demo to the simpler shared merge line without touching
 * diagrams the user has created themselves.
 */
export function migrateLegacyDemo(diagram: Diagram): Diagram {
  const join = diagram.nodes.find((item) => item.id === 'demo-join');
  if (!join) return diagram;
  const outgoing = diagram.edges.filter((item) => item.from === join.id);
  const incoming = diagram.edges.filter((item) => item.to === join.id);
  if (outgoing.length !== 1 || incoming.length === 0) return diagram;
  const target = outgoing[0].to;
  if (!diagram.nodes.some((item) => item.id === target)) return diagram;
  const rewired = incoming.map((item) => ({
    ...item,
    to: target,
    fromSide: 'bottom' as const,
    toSide: 'top' as const,
    waypoints: undefined,
  }));
  const edges = [
    ...diagram.edges.filter(
      (item) => item.from !== join.id && item.to !== join.id,
    ),
    ...rewired,
  ];
  const nodes = diagram.nodes
    .filter((item) => item.id !== join.id)
    .map((item) =>
      item.id === 'demo-end' && item.x === 520 && item.y === 800
        ? { ...item, y: 760 }
        : item,
    );
  return {
    ...diagram,
    nodes,
    edges,
    updatedAt: Date.now(),
  };
}

export function createBlankDiagram(title = 'Новая блок-схема'): Diagram {
  const startId = createId('n');
  const endId = createId('n');
  return {
    title,
    updatedAt: Date.now(),
    nodes: [
      node(startId, 'start', 'Начало', 520, 120),
      node(endId, 'end', 'Конец', 520, 360),
    ],
    edges: [],
  };
}

export const STORAGE_KEY = 'schemogost.diagram.v1';
