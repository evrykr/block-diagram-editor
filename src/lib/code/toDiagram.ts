import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  NodeKind,
  Side,
} from '../../types/diagram';
import { createId } from '../geometry';
import { NODE_MAP } from '../../constants/design';
import type {
  FunctionDef,
  ParsedProgram,
  Statement,
} from './types';

interface BuildNode {
  id: string;
  kind: NodeKind;
  text: string;
  width: number;
  height: number;
  code?: string;
  x?: number;
  y?: number;
}

interface BuildEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  branch?: 'yes' | 'no';
  back?: boolean;
  loopExit?: boolean;
  layoutOnly?: boolean;
  fromSide?: Side;
  toSide?: Side;
  waypoints?: { x: number; y: number }[];
}

interface PendingEdge {
  from: string;
  label?: string;
  branch?: 'yes' | 'no';
  loopExit?: boolean;
  /** Tail nodes of a loop body; used to force the continuation below the body. */
  layoutSources?: string[];
}

interface BuildResult {
  entry?: string;
  exits: PendingEdge[];
}

export interface ConversionStats {
  nodes: number;
  edges: number;
  decisions: number;
  loops: number;
}

export interface ConversionResult {
  diagram: Diagram;
  warnings: string[];
  entryName?: string;
  stats: ConversionStats;
}

interface EntryPoint {
  name?: string;
  body: Statement[];
  kind: 'function' | 'body';
}

const NODE_SIZES: Record<
  'start' | 'end' | 'process' | 'io' | 'decision' | 'preparation',
  { width: number; height: number }
> = {
  start: { width: 200, height: 56 },
  end: { width: 200, height: 56 },
  process: { width: 232, height: 64 },
  io: { width: 232, height: 64 },
  decision: { width: 262, height: 108 },
  preparation: { width: 232, height: 64 },
};

function chooseEntry(program: ParsedProgram): EntryPoint {
  const findMain = () =>
    program.functions.find((item) => item.name.toLowerCase() === 'main') ??
    program.functions.find((item) => item.name.toLowerCase() === 'mainasync');

  if (program.language === 'python') {
    const mainFunction = findMain();
    if (mainFunction) return { name: mainFunction.name, body: mainFunction.body, kind: 'function' };
    if (program.body.length > 0) return { body: program.body, kind: 'body' };
    if (program.functions.length > 0) {
      const selected = [...program.functions].sort(
        (a, b) => b.body.length - a.body.length,
      )[0];
      return { name: selected.name, body: selected.body, kind: 'function' };
    }
  }
  if (program.language === 'pascal') {
    if (program.body.length > 0) return { body: program.body, kind: 'body' };
    const selected = findMain() ?? program.functions[0];
    if (selected) return { name: selected.name, body: selected.body, kind: 'function' };
  }
  if (program.language === 'cpp' || program.language === 'csharp') {
    const mainFunction = findMain();
    if (mainFunction) {
      return { name: mainFunction.name, body: mainFunction.body, kind: 'function' };
    }
    if (program.functions.length > 0) {
      const selected = [...program.functions].sort(
        (a, b) => b.body.length - a.body.length,
      )[0];
      return { name: selected.name, body: selected.body, kind: 'function' };
    }
    if (program.body.length > 0) return { body: program.body, kind: 'body' };
  }
  const fallback: FunctionDef | undefined = program.functions[0];
  if (fallback) {
    return { name: fallback.name, body: fallback.body, kind: 'function' };
  }
  return { body: program.body, kind: 'body' };
}

class FlowBuilder {
  nodes: BuildNode[] = [];
  edges: BuildEdge[] = [];
  warnings: string[] = [];
  decisions = 0;
  loops = 0;
  private warnedBreak = false;

  addNode(
    kind: BuildNode['kind'],
    text: string,
    size = NODE_SIZES.process,
    code?: string,
  ): BuildNode {
    const node: BuildNode = {
      id: createId('n'),
      kind,
      text: text || NODE_MAP[kind].label,
      width: size.width,
      height: size.height,
      code,
    };
    this.nodes.push(node);
    return node;
  }

  addEdge(edge: Omit<BuildEdge, 'id'>): void {
    this.edges.push({ ...edge, id: createId('e') });
  }

  connect(pending: PendingEdge[], to: string): void {
    for (const edge of pending) {
      if (edge.from === to) continue;
      this.addEdge({
        from: edge.from,
        to,
        label: edge.label,
        branch: edge.branch,
        loopExit: edge.loopExit,
      });
      for (const source of edge.layoutSources ?? []) {
        if (source !== to) {
          this.addEdge({ from: source, to, layoutOnly: true });
        }
      }
    }
  }

  sequence(statements: Statement[], incoming: PendingEdge[]): BuildResult {
    let current = incoming;
    let entry: string | undefined;
    for (const statement of statements) {
      const result = this.statement(statement, current);
      if (!entry && result.entry) entry = result.entry;
      current = result.exits;
    }
    return { entry, exits: current };
  }

  statement(statement: Statement, incoming: PendingEdge[]): BuildResult {
    switch (statement.type) {
      case 'simple': {
        const node = this.addNode(
          statement.kind === 'io' ? 'io' : 'process',
          statement.text,
          statement.kind === 'io' ? NODE_SIZES.io : NODE_SIZES.process,
          statement.code,
        );
        this.connect(incoming, node.id);
        return { entry: node.id, exits: [{ from: node.id }] };
      }
      case 'block':
        return this.sequence(statement.body, incoming);
      case 'if':
        return this.buildIf(statement, incoming);
      case 'while':
        return statement.mode === 'do'
          ? this.buildDoWhile(statement, incoming)
          : this.buildWhile(statement, incoming);
      case 'for':
        return this.buildFor(statement, incoming);
      case 'foreach':
        return this.buildForEach(statement, incoming);
      case 'return': {
        const node = this.addNode(
          'process',
          statement.value ? `return ${statement.value}` : 'return',
          NODE_SIZES.process,
          statement.value ? `return ${statement.value}` : 'return',
        );
        this.connect(incoming, node.id);
        return { entry: node.id, exits: [{ from: node.id }] };
      }
      case 'break':
      case 'continue': {
        if (!this.warnedBreak) {
          this.warnings.push(
            'Операторы break/continue показаны как действия: линии основного потока не прерываются.',
          );
          this.warnedBreak = true;
        }
        const node = this.addNode(
          'process',
          statement.type === 'break' ? 'break' : 'continue',
          { width: 196, height: 58 },
        );
        this.connect(incoming, node.id);
        return { entry: node.id, exits: [{ from: node.id }] };
      }
    }
  }

  private buildIf(
    statement: Extract<Statement, { type: 'if' }>,
    incoming: PendingEdge[],
  ): BuildResult {
    const decision = this.addNode(
      'decision',
      statement.condition,
      NODE_SIZES.decision,
      statement.sourceCondition,
    );
    this.decisions += 1;
    this.connect(incoming, decision.id);
    const thenResult = this.sequence(statement.then, [
      { from: decision.id, label: 'Да', branch: 'yes' },
    ]);
    const elseResult = this.sequence(statement.else, [
      { from: decision.id, label: 'Нет', branch: 'no' },
    ]);
    return {
      entry: decision.id,
      exits: [...thenResult.exits, ...elseResult.exits],
    };
  }

  private buildWhile(
    statement: Extract<Statement, { type: 'while' }>,
    incoming: PendingEdge[],
  ): BuildResult {
    const condition = this.addNode(
      'decision',
      statement.condition,
      NODE_SIZES.decision,
      statement.sourceCondition,
    );
    this.decisions += 1;
    this.loops += 1;
    this.connect(incoming, condition.id);
    const bodyResult = this.sequence(statement.body, [
      { from: condition.id, label: 'Да', branch: 'yes' },
    ]);
    const tails = this.uniqueSources(bodyResult.exits).filter(
      (source) => source !== condition.id,
    );
    for (const tail of tails) {
      this.addEdge({ from: tail, to: condition.id, back: true });
    }
    return {
      entry: condition.id,
      exits: [
        {
          from: condition.id,
          label: 'Нет',
          branch: 'no',
          loopExit: true,
          layoutSources: tails,
        },
      ],
    };
  }

  private buildDoWhile(
    statement: Extract<Statement, { type: 'while' }>,
    incoming: PendingEdge[],
  ): BuildResult {
    this.loops += 1;
    const bodyResult = this.sequence(statement.body, incoming);
    const condition = this.addNode(
      'decision',
      statement.condition,
      NODE_SIZES.decision,
      statement.sourceCondition,
    );
    this.decisions += 1;
    this.connect(bodyResult.exits, condition.id);
    if (bodyResult.entry) {
      this.addEdge({
        from: condition.id,
        to: bodyResult.entry,
        back: true,
        label: 'Да',
        branch: 'yes',
      });
    }
    return {
      entry: bodyResult.entry ?? condition.id,
      exits: [
        {
          from: condition.id,
          label: 'Нет',
          branch: 'no',
        },
      ],
    };
  }

  private buildFor(
    statement: Extract<Statement, { type: 'for' }>,
    incoming: PendingEdge[],
  ): BuildResult {
    this.loops += 1;
    let current = incoming;
    let entry: string | undefined;
    if (statement.init.trim()) {
      const init = this.addNode(
        'process',
        statement.init.trim(),
        NODE_SIZES.process,
      );
      this.connect(current, init.id);
      current = [{ from: init.id }];
      entry = init.id;
    }
    const condition = this.addNode(
      'decision',
      statement.condition,
      NODE_SIZES.decision,
      statement.sourceCondition,
    );
    this.decisions += 1;
    this.connect(current, condition.id);
    entry = entry ?? condition.id;
    const bodyResult = this.sequence(statement.body, [
      { from: condition.id, label: 'Да', branch: 'yes' },
    ]);
    let tails = this.uniqueSources(bodyResult.exits);
    if (statement.update.trim()) {
      const update = this.addNode(
        'process',
        statement.update.trim(),
        NODE_SIZES.process,
      );
      this.connect(bodyResult.exits, update.id);
      tails = [update.id];
    }
    tails = tails.filter((source) => source !== condition.id);
    for (const tail of tails) {
      this.addEdge({ from: tail, to: condition.id, back: true });
    }
    return {
      entry,
      exits: [
        {
          from: condition.id,
          label: 'Нет',
          branch: 'no',
          loopExit: true,
          layoutSources: tails,
        },
      ],
    };
  }

  private buildForEach(
    statement: Extract<Statement, { type: 'foreach' }>,
    incoming: PendingEdge[],
  ): BuildResult {
    this.loops += 1;
    const preparation = this.addNode(
      'preparation',
      `Для каждого ${statement.variable} из ${statement.iterable}`,
      NODE_SIZES.preparation,
    );
    this.connect(incoming, preparation.id);
    const condition = this.addNode(
      'decision',
      `есть следующий ${statement.variable}?`,
      NODE_SIZES.decision,
    );
    this.decisions += 1;
    this.connect([{ from: preparation.id }], condition.id);
    const bodyResult = this.sequence(statement.body, [
      { from: condition.id, label: 'Да', branch: 'yes' },
    ]);
    const tails = this.uniqueSources(bodyResult.exits).filter(
      (source) => source !== condition.id,
    );
    for (const tail of tails) {
      this.addEdge({ from: tail, to: condition.id, back: true });
    }
    return {
      entry: preparation.id,
      exits: [
        {
          from: condition.id,
          label: 'Нет',
          branch: 'no',
          loopExit: true,
          layoutSources: tails,
        },
      ],
    };
  }

  private uniqueSources(exits: PendingEdge[]): string[] {
    return [...new Set(exits.map((edge) => edge.from))];
  }
}

function applyDagreLayout(nodes: BuildNode[], edges: BuildEdge[]): void {
  const graph = new graphlib.Graph({ directed: true, multigraph: true });
  graph.setGraph({
    rankdir: 'TB',
    nodesep: 54,
    ranksep: 44,
    edgesep: 18,
    marginx: 36,
    marginy: 36,
    ranker: 'network-simplex',
    acyclicer: 'greedy',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) {
    graph.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }
  let edgeIndex = 0;
  for (const edge of edges) {
    if (edge.back || edge.loopExit) continue;
    if (edge.layoutOnly) {
      graph.setEdge(edge.from, edge.to, { weight: 0, minlen: 1 }, `h${edgeIndex}`);
      edgeIndex += 1;
      continue;
    }
    graph.setEdge(edge.from, edge.to, { weight: 1, minlen: 1 }, `e${edgeIndex}`);
    edgeIndex += 1;
  }
  dagreLayout(graph);
  for (const node of nodes) {
    const point = graph.node(node.id);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      node.x = point.x - node.width / 2;
      node.y = point.y - node.height / 2;
    }
  }
}

interface PositionedNode {
  x: number;
  y: number;
}

function routeEdges(
  nodes: BuildNode[],
  positions: Map<string, PositionedNode>,
  edges: BuildEdge[],
): void {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const positioned = nodes.map((node) => {
    const position = positions.get(node.id)!;
    return { ...node, ...position };
  });
  const minX = Math.min(...positioned.map((node) => node.x));
  const maxX = Math.max(...positioned.map((node) => node.x + node.width));
  let loopLaneIndex = 0;
  let backLaneIndex = 0;

  for (const edge of edges) {
    if (edge.layoutOnly) continue;
    const from = positioned.find((node) => node.id === edge.from);
    const to = positioned.find((node) => node.id === edge.to);
    if (!from || !to) continue;
    const fromCenter = {
      x: from.x + from.width / 2,
      y: from.y + from.height / 2,
    };
    const toCenter = {
      x: to.x + to.width / 2,
      y: to.y + to.height / 2,
    };

    if (edge.loopExit) {
      const lane = maxX + 45 + loopLaneIndex * 30;
      loopLaneIndex += 1;
      edge.fromSide = 'right';
      edge.toSide = 'top';
      edge.waypoints = [
        { x: lane, y: fromCenter.y },
        { x: lane, y: to.y - 32 },
        { x: toCenter.x, y: to.y - 32 },
      ];
      continue;
    }

    if (edge.back) {
      const lane = minX - 42 - backLaneIndex * 28;
      backLaneIndex += 1;
      if (toCenter.y < fromCenter.y) {
        edge.fromSide = 'bottom';
        edge.toSide = 'left';
        edge.waypoints = [
          { x: fromCenter.x, y: from.y + from.height + 28 },
          { x: lane, y: from.y + from.height + 28 },
          { x: lane, y: toCenter.y },
        ];
      } else {
        edge.fromSide = 'top';
        edge.toSide = 'right';
        edge.waypoints = [
          { x: fromCenter.x, y: from.y - 28 },
          { x: lane, y: from.y - 28 },
          { x: lane, y: toCenter.y },
        ];
      }
      continue;
    }

    if (
      edge.branch &&
      (from.kind === 'decision' || from.kind === 'start')
    ) {
      if (
        Math.abs(toCenter.x - fromCenter.x) < 24 &&
        toCenter.y > fromCenter.y
      ) {
        edge.fromSide = 'bottom';
        edge.toSide = 'top';
      } else {
        edge.fromSide = toCenter.x < fromCenter.x ? 'left' : 'right';
        edge.toSide = 'top';
      }
      continue;
    }

    if (toCenter.y > fromCenter.y + 20) {
      edge.fromSide = 'bottom';
      edge.toSide = 'top';
    } else if (toCenter.y < fromCenter.y - 20) {
      edge.fromSide = 'top';
      edge.toSide = 'bottom';
    } else if (Math.abs(toCenter.x - fromCenter.x) > 4) {
      edge.fromSide = toCenter.x > fromCenter.x ? 'right' : 'left';
      edge.toSide = toCenter.x > fromCenter.x ? 'left' : 'right';
    } else {
      edge.fromSide = 'bottom';
      edge.toSide = 'top';
    }
  }

  // Both endpoints must exist; remove edges that reference missing nodes.
  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index];
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) edges.splice(index, 1);
  }
}

export function astToDiagram(program: ParsedProgram): ConversionResult {
  const entry = chooseEntry(program);
  if (entry.body.length === 0) {
    throw new Error(
      'В выбранной функции нет операторов — не из чего строить схему.',
    );
  }
  const builder = new FlowBuilder();
  const start = builder.addNode('start', 'Начало', NODE_SIZES.start);
  const bodyResult = builder.sequence(entry.body, [{ from: start.id }]);
  const end = builder.addNode('end', 'Конец', NODE_SIZES.end);
  builder.connect(bodyResult.exits, end.id);

  applyDagreLayout(builder.nodes, builder.edges);
  const positions = new Map<string, PositionedNode>();
  for (const node of builder.nodes) {
    positions.set(node.id, {
      x: (node as BuildNode & Partial<PositionedNode>).x ?? 0,
      y: (node as BuildNode & Partial<PositionedNode>).y ?? 0,
    });
  }

  const minX = Math.min(...[...positions.values()].map((point) => point.x));
  const minY = Math.min(...[...positions.values()].map((point) => point.y));
  const shiftX = 100 - minX;
  const shiftY = 90 - minY;
  for (const point of positions.values()) {
    point.x = Math.round((point.x + shiftX) / 5) * 5;
    point.y = Math.round((point.y + shiftY) / 5) * 5;
  }

  routeEdges(builder.nodes, positions, builder.edges);

  const nodes: DiagramNode[] = builder.nodes.map((node) => {
    const position = positions.get(node.id)!;
    return {
      id: node.id,
      kind: node.kind,
      text: node.text,
      x: position.x,
      y: position.y,
      width: node.width,
      height: node.height,
      ...(node.code ? { code: node.code } : {}),
    };
  });
  const edges: DiagramEdge[] = builder.edges
    .filter((edge) => !edge.layoutOnly)
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      branch: edge.branch,
      back: edge.back,
      loopExit: edge.loopExit,
      fromSide: edge.fromSide,
      toSide: edge.toSide,
      waypoints: edge.waypoints,
    }));

  const warnings = [...program.warnings, ...builder.warnings];
  if (entry.kind === 'function') {
    warnings.push(
      `Схема построена по функции ${entry.name}(). Остальные функции не включены.`,
    );
  } else if (program.functions.length > 0) {
    warnings.push(
      'Схема построена по основному сценарию; объявления функций не включены.',
    );
  }

  const title = entry.name
    ? `Блок-схема: ${entry.name}()`
    : 'Блок-схема по коду';

  return {
    diagram: {
      title,
      nodes,
      edges,
      updatedAt: Date.now(),
      sourceLanguage: program.language,
    },
    warnings,
    entryName: entry.name,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      decisions: builder.decisions,
      loops: builder.loops,
    },
  };
}

