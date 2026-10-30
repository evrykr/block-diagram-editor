import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Hand,
  Maximize,
  Minus,
  MousePointerClick,
  Plus,
  Sparkles,
} from 'lucide-react';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  Point,
  Selection,
  Side,
  Tool,
  Viewport,
} from '../types/diagram';
import {
  ACCENT,
  EDGE_COLOR,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_MAP,
} from '../constants/design';
import { countLabel } from '../lib/plural';
import {
  anchorPoint,
  boundsIntersect,
  diagramContentBounds,
  edgePoints,
  fitViewport,
  nearestSide,
  nodeBounds,
  nodePath,
  roundedPath,
  screenToWorld,
  snap,
  worldToScreen,
} from '../lib/geometry';
import { EdgeView } from './EdgeView';
import { NodeView } from './NodeView';

export interface CanvasHandle {
  addAtCenter: (kind: DiagramNode['kind']) => void;
  fit: () => void;
}

interface CanvasProps {
  diagram: Diagram;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  tool: Tool;
  snapEnabled: boolean;
  update: (
    updater: Diagram | ((current: Diagram) => Diagram),
    options?: { history?: boolean },
  ) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  addNodeAt: (kind: DiagramNode['kind'], x: number, y: number) => void;
  createEdge: (
    from: string,
    to: string,
    fromSide: Side,
    toSide: Side,
  ) => void;
  fitNonce: number;
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';

type Session =
  | {
      kind: 'pan';
      startClient: Point;
      startViewport: Viewport;
    }
  | {
      kind: 'marquee';
      startWorld: Point;
      additive: boolean;
    }
  | {
      kind: 'drag';
      startWorld: Point;
      anchor: DiagramNode;
      originals: Map<string, Point>;
    }
  | {
      kind: 'resize';
      startWorld: Point;
      original: DiagramNode;
      corner: Corner;
    }
  | {
      kind: 'connect';
      fromId: string;
      fromSide: Side;
      startWorld: Point;
    };

interface ConnectPreview {
  fromId: string;
  fromSide: Side;
  current: Point;
  targetId?: string;
  targetSide?: Side;
}

interface MarqueeState {
  start: Point;
  current: Point;
}

function useLatest<T>(value: T) {
  const reference = useRef(value);
  reference.current = value;
  return reference;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    diagram,
    selection,
    setSelection,
    tool,
    snapEnabled,
    update,
    beginTransaction,
    endTransaction,
    addNodeAt,
    createEdge,
    fitNonce,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [sessionKind, setSessionKind] = useState<Session['kind'] | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(
    null,
  );
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(
    null,
  );
  const [spacePressed, setSpacePressed] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const cancelEditingRef = useRef(false);

  const diagramRef = useLatest(diagram);
  const selectionRef = useLatest(selection);
  const viewportRef = useLatest(viewport);
  const snapRef = useLatest(snapEnabled);
  const createEdgeRef = useLatest(createEdge);
  const sessionRef = useRef<Session | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastFitNonceRef = useRef(fitNonce);

  const effectiveTool: Tool =
    spacePressed || tool === 'hand' ? 'hand' : tool;

  const nodeMap = useMemo(
    () => new Map(diagram.nodes.map((node) => [node.id, node])),
    [diagram.nodes],
  );

  const getLocalPoint = (event: PointerEvent | ReactPointerEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const toWorld = (event: PointerEvent | ReactPointerEvent): Point =>
    screenToWorld(getLocalPoint(event), viewportRef.current);

  const fitToContent = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (diagramRef.current.nodes.length === 0) {
      setViewport({ x: rect.width / 2, y: rect.height / 2, zoom: 1 });
      return;
    }
    const bounds = diagramContentBounds(diagramRef.current, 30);
    setViewport(fitViewport(bounds, rect.width, rect.height, 64, 1.05));
  };

  useEffect(() => {
    const frame = requestAnimationFrame(fitToContent);
    return () => cancelAnimationFrame(frame);
    // Fit only on initialization. Structural changes use fitNonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fitNonce === lastFitNonceRef.current) return;
    lastFitNonceRef.current = fitNonce;
    const frame = requestAnimationFrame(fitToContent);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (typing) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePressed(true);
      }
      if (event.key === 'Escape') {
        setEditing(null);
        setMarquee(null);
        setConnectPreview(null);
      }
    };
    const upHandler = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', upHandler);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const screen = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (event.ctrlKey || event.metaKey) {
        const current = viewportRef.current;
        const world = screenToWorld(screen, current);
        const factor = Math.exp(-event.deltaY * 0.0018);
        const nextZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, current.zoom * factor),
        );
        setViewport({
          zoom: nextZoom,
          x: screen.x - world.x * nextZoom,
          y: screen.y - world.y * nextZoom,
        });
      } else {
        setViewport((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (editing) {
      const frame = requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [editing]);

  const attachSession = (session: Session) => {
    sessionRef.current = session;
    setSessionKind(session.kind);
    const handleMove = (event: PointerEvent) => {
      const active = sessionRef.current;
      if (!active) return;
      const world = toWorld(event);
      if (active.kind === 'pan') {
        setViewport({
          ...active.startViewport,
          x: active.startViewport.x + (event.clientX - active.startClient.x),
          y: active.startViewport.y + (event.clientY - active.startClient.y),
        });
        return;
      }
      if (active.kind === 'marquee') {
        setMarquee({ start: active.startWorld, current: world });
        return;
      }
      if (active.kind === 'drag') {
        let deltaX = world.x - active.startWorld.x;
        let deltaY = world.y - active.startWorld.y;
        if (snapRef.current) {
          const snappedX = snap(active.anchor.x + deltaX, 10);
          const snappedY = snap(active.anchor.y + deltaY, 10);
          deltaX = snappedX - active.anchor.x;
          deltaY = snappedY - active.anchor.y;
        }
        update(
          (current) => ({
            ...current,
            nodes: current.nodes.map((node) => {
              const original = active.originals.get(node.id);
              return original
                ? {
                    ...node,
                    x: Math.round(original.x + deltaX),
                    y: Math.round(original.y + deltaY),
                  }
                : node;
            }),
          }),
          { history: false },
        );
        return;
      }
      if (active.kind === 'resize') {
        const node = active.original;
        const dx = world.x - active.startWorld.x;
        const dy = world.y - active.startWorld.y;
        let x = node.x;
        let y = node.y;
        let width = node.width;
        let height = node.height;
        const minWidth = 58;
        const minHeight = 42;
        if (active.corner.includes('w')) {
          const right = node.x + node.width;
          const nextX = snapRef.current ? snap(node.x + dx, 10) : node.x + dx;
          x = Math.min(nextX, right - minWidth);
          width = right - x;
        }
        if (active.corner.includes('e')) {
          const right = snapRef.current
            ? snap(node.x + node.width + dx, 10)
            : node.x + node.width + dx;
          width = Math.max(minWidth, right - node.x);
        }
        if (active.corner.includes('n')) {
          const bottom = node.y + node.height;
          const nextY = snapRef.current ? snap(node.y + dy, 10) : node.y + dy;
          y = Math.min(nextY, bottom - minHeight);
          height = bottom - y;
        }
        if (active.corner.includes('s')) {
          const bottom = snapRef.current
            ? snap(node.y + node.height + dy, 10)
            : node.y + node.height + dy;
          height = Math.max(minHeight, bottom - node.y);
        }
        update(
          (current) => ({
            ...current,
            nodes: current.nodes.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(width),
                    height: Math.round(height),
                  }
                : item,
            ),
          }),
          { history: false },
        );
        return;
      }
      if (active.kind === 'connect') {
        const target = findConnectTarget(world, active.fromId);
        const targetSide = target
          ? nearestSide(target, world)
          : undefined;
        setConnectPreview({
          fromId: active.fromId,
          fromSide: active.fromSide,
          current: target
            ? anchorPoint(target, targetSide ?? nearestSide(target, world))
            : world,
          targetId: target?.id,
          targetSide,
        });
      }
    };

    const findConnectTarget = (
      world: Point,
      fromId: string,
    ): DiagramNode | undefined => {
      const nodes = diagramRef.current.nodes;
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        if (node.id === fromId) continue;
        if (
          world.x >= node.x &&
          world.x <= node.x + node.width &&
          world.y >= node.y &&
          world.y <= node.y + node.height
        ) {
          return node;
        }
      }
      return undefined;
    };

    const handleUp = (event: PointerEvent) => {
      const active = sessionRef.current;
      cleanupRef.current?.();
      cleanupRef.current = null;
      sessionRef.current = null;
      setSessionKind(null);
      if (!active) return;
      const world = toWorld(event);
      if (active.kind === 'marquee') {
        const start = active.startWorld;
        const box = {
          x: Math.min(start.x, world.x),
          y: Math.min(start.y, world.y),
          width: Math.abs(world.x - start.x),
          height: Math.abs(world.y - start.y),
        };
        if (box.width < 4 && box.height < 4) {
          if (!active.additive) setSelection({ nodes: [], edges: [] });
        } else {
          const hits = diagramRef.current.nodes
            .filter((node) => boundsIntersect(box, nodeBounds(node)))
            .map((node) => node.id);
          const previous = active.additive
            ? selectionRef.current.nodes
            : [];
          setSelection({
            nodes: [...new Set([...previous, ...hits])],
            edges: [],
          });
        }
        setMarquee(null);
        return;
      }
      if (active.kind === 'drag' || active.kind === 'resize') {
        endTransaction();
        return;
      }
      if (active.kind === 'connect') {
        const target = findConnectTarget(world, active.fromId);
        if (target) {
          createEdgeRef.current(
            active.fromId,
            target.id,
            active.fromSide,
            nearestSide(target, world),
          );
        }
        setConnectPreview(null);
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleBackgroundPointerDown = (
    event: ReactPointerEvent<SVGRectElement>,
  ) => {
    if (event.button !== 0 && event.button !== 1) return;
    const world = toWorld(event);
    if (
      effectiveTool === 'hand' ||
      event.button === 1 ||
      spacePressed
    ) {
      event.preventDefault();
      attachSession({
        kind: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewportRef.current,
      });
      return;
    }
    if (effectiveTool === 'connect') {
      setConnectPreview(null);
      setSelection({ nodes: [], edges: [] });
      return;
    }
    const additive = event.shiftKey;
    if (!additive) setSelection({ nodes: [], edges: [] });
    attachSession({ kind: 'marquee', startWorld: world, additive });
    setMarquee({ start: world, current: world });
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent,
    node: DiagramNode,
  ) => {
    event.stopPropagation();
    if (event.button !== 0 && event.button !== 1) return;
    if (effectiveTool === 'hand' || event.button === 1 || spacePressed) {
      event.preventDefault();
      attachSession({
        kind: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewportRef.current,
      });
      return;
    }
    if (effectiveTool === 'connect') {
      const world = toWorld(event);
      const side = nearestSide(node, world);
      attachSession({
        kind: 'connect',
        fromId: node.id,
        fromSide: side,
        startWorld: world,
      });
      setConnectPreview({
        fromId: node.id,
        fromSide: side,
        current: anchorPoint(node, side),
      });
      return;
    }
    const wasSelected = selectionRef.current.nodes.includes(node.id);
    let nextNodes = selectionRef.current.nodes;
    if (event.shiftKey) {
      nextNodes = wasSelected
        ? nextNodes.filter((id) => id !== node.id)
        : [...nextNodes, node.id];
      setSelection({ nodes: nextNodes, edges: [] });
      if (wasSelected) return;
    } else if (!wasSelected) {
      nextNodes = [node.id];
      setSelection({ nodes: nextNodes, edges: [] });
    } else {
      setSelection({ nodes: nextNodes, edges: [] });
    }
    const nodes = diagramRef.current.nodes.filter((item) =>
      nextNodes.includes(item.id),
    );
    if (nodes.length === 0) return;
    beginTransaction();
    attachSession({
      kind: 'drag',
      startWorld: toWorld(event),
      anchor: node,
      originals: new Map(nodes.map((item) => [item.id, { x: item.x, y: item.y }])),
    });
  };

  const handleEdgePointerDown = (
    event: ReactPointerEvent,
    edge: DiagramEdge,
  ) => {
    event.stopPropagation();
    if (event.shiftKey) {
      const exists = selectionRef.current.edges.includes(edge.id);
      setSelection({
        nodes: [],
        edges: exists
          ? selectionRef.current.edges.filter((id) => id !== edge.id)
          : [...selectionRef.current.edges, edge.id],
      });
    } else {
      setSelection({ nodes: [], edges: [edge.id] });
    }
  };

  const handlePortPointerDown = (
    event: ReactPointerEvent,
    node: DiagramNode,
    side: Side,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const world = toWorld(event);
    attachSession({
      kind: 'connect',
      fromId: node.id,
      fromSide: side,
      startWorld: world,
    });
    setConnectPreview({
      fromId: node.id,
      fromSide: side,
      current: anchorPoint(node, side),
    });
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent,
    node: DiagramNode,
    corner: Corner,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    beginTransaction();
    attachSession({
      kind: 'resize',
      startWorld: toWorld(event),
      original: { ...node },
      corner,
    });
  };

  const commitEditing = () => {
    if (!editing) return;
    if (cancelEditingRef.current) {
      cancelEditingRef.current = false;
      setEditing(null);
      return;
    }
    const value = editing.value;
    if (value !== editingNode?.text) {
      update((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === editing.id
            ? { ...node, text: value, code: undefined }
            : node,
        ),
      }));
    }
    setEditing(null);
  };

  const addAtViewportCenter = (kind: DiagramNode['kind']) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const world = screenToWorld(
      { x: rect.width / 2, y: rect.height / 2 },
      viewportRef.current,
    );
    addNodeAt(kind, world.x, world.y);
  };

  const zoomAt = (factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const screen = { x: rect.width / 2, y: rect.height / 2 };
    const current = viewportRef.current;
    const world = screenToWorld(screen, current);
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, current.zoom * factor),
    );
    setViewport({
      zoom,
      x: screen.x - world.x * zoom,
      y: screen.y - world.y * zoom,
    });
  };

  const selectedNode =
    selection.nodes.length === 1 ? nodeMap.get(selection.nodes[0]) : undefined;
  const editingNode = editing ? nodeMap.get(editing.id) : undefined;
  const editingScreen = editingNode
    ? worldToScreen({ x: editingNode.x, y: editingNode.y }, viewport)
    : null;
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.start.x, marquee.current.x),
        y: Math.min(marquee.start.y, marquee.current.y),
        width: Math.abs(marquee.current.x - marquee.start.x),
        height: Math.abs(marquee.current.y - marquee.start.y),
      }
    : null;

  const connectPath = (() => {
    if (!connectPreview) return null;
    const from = nodeMap.get(connectPreview.fromId);
    if (!from) return null;
    if (connectPreview.targetId) {
      const target = nodeMap.get(connectPreview.targetId);
      if (target && connectPreview.targetSide) {
        return roundedPath(
          edgePoints(
            {
              id: 'preview',
              from: from.id,
              to: target.id,
              fromSide: connectPreview.fromSide,
              toSide: connectPreview.targetSide,
            },
            from,
            target,
          ).points,
          10,
        );
      }
    }
    const start = anchorPoint(from, connectPreview.fromSide);
    const direction = {
      top: { x: 0, y: -1 },
      right: { x: 1, y: 0 },
      bottom: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
    }[connectPreview.fromSide];
    const stub = {
      x: start.x + direction.x * 24,
      y: start.y + direction.y * 24,
    };
    const vertical =
      connectPreview.fromSide === 'top' ||
      connectPreview.fromSide === 'bottom';
    const elbow = vertical
      ? { x: connectPreview.current.x, y: stub.y }
      : { x: stub.x, y: connectPreview.current.y };
    return roundedPath(
      [start, stub, elbow, connectPreview.current],
      10,
    );
  })();

  const selectedCount =
    selection.nodes.length > 0
      ? selection.nodes.length
      : selection.edges.length > 0
        ? 1
        : 0;

  useImperativeHandle(ref, () => ({
    addAtCenter: addAtViewportCenter,
    fit: fitToContent,
  }));

  return (
    <div
      ref={containerRef}
      className={`canvas-viewport tool-${effectiveTool}${
        sessionKind === 'pan' ? ' is-panning' : ''
      }${dropActive ? ' is-drop-active' : ''}`}
      style={{
        backgroundSize: `${Math.max(10, 20 * viewport.zoom)}px ${Math.max(
          10,
          20 * viewport.zoom,
        )}px, ${Math.max(40, 100 * viewport.zoom)}px ${Math.max(
          40,
          100 * viewport.zoom,
        )}px, ${Math.max(40, 100 * viewport.zoom)}px ${Math.max(
          40,
          100 * viewport.zoom,
        )}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-schemogost-kind')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const kind = event.dataTransfer.getData(
          'application/x-schemogost-kind',
        ) as DiagramNode['kind'];
        if (!kind || !NODE_MAP[kind]) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const world = screenToWorld(
          {
            x: event.clientX - (rect?.left ?? 0),
            y: event.clientY - (rect?.top ?? 0),
          },
          viewportRef.current,
        );
        addNodeAt(kind, world.x, world.y);
      }}
    >
      <svg className="canvas-svg" role="application" aria-label="Холст блок-схемы">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9.2"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={EDGE_COLOR} />
          </marker>
          <marker
            id="arrow-selected"
            viewBox="0 0 10 10"
            refX="9.2"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={ACCENT} />
          </marker>
        </defs>
        <rect
          className="canvas-hit"
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          onPointerDown={handleBackgroundPointerDown}
        />
        <g
          className="diagram-layer"
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
        >
          <g className="edges-layer">
            {diagram.edges.map((edge) => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;
              return (
                <g
                  key={edge.id}
                  onPointerEnter={() => setHoveredEdgeId(edge.id)}
                  onPointerLeave={() =>
                    setHoveredEdgeId((current) =>
                      current === edge.id ? null : current,
                    )
                  }
                >
                  <EdgeView
                    edge={edge}
                    from={from}
                    to={to}
                    selected={selection.edges.includes(edge.id)}
                    zoom={viewport.zoom}
                    onPointerDown={(event) =>
                      handleEdgePointerDown(event, edge)
                    }
                  />
                </g>
              );
            })}
          </g>

          <g className="nodes-layer">
            {diagram.nodes.map((node) => (
              <NodeView
                key={node.id}
                node={node}
                selected={selection.nodes.includes(node.id)}
                editing={editing?.id === node.id}
                dimmed={
                  Boolean(hoveredEdgeId) &&
                  selection.nodes.length === 0 &&
                  selection.edges.length === 0
                }
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onDoubleClick={() => {
                  if (effectiveTool !== 'select') return;
                  cancelEditingRef.current = false;
                  setEditing({ id: node.id, value: node.text });
                }}
              />
            ))}
          </g>

          <g className="overlay-layer">
            {connectPreview?.targetId && nodeMap.get(connectPreview.targetId) && (
              <path
                d={nodePath(nodeMap.get(connectPreview.targetId)!)}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2.5 / viewport.zoom}
                strokeDasharray={`${7 / viewport.zoom} ${5 / viewport.zoom}`}
                pointerEvents="none"
              />
            )}

            {diagram.nodes.map((node) => {
              const showPorts =
                (effectiveTool === 'connect' || selectedNode?.id === node.id) &&
                effectiveTool !== 'hand';
              if (!showPorts) return null;
              return (
                <g key={`ports-${node.id}`} className="ports">
                  {(['top', 'right', 'bottom', 'left'] as Side[]).map((side) => {
                    const point = anchorPoint(node, side);
                    return (
                      <circle
                        key={side}
                        cx={point.x}
                        cy={point.y}
                        r={5 / viewport.zoom}
                        fill="#ffffff"
                        stroke={ACCENT}
                        strokeWidth={1.8 / viewport.zoom}
                        className="port"
                        onPointerDown={(event) =>
                          handlePortPointerDown(event, node, side)
                        }
                      >
                        <title>Начать связь</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}

            {selectedNode && (
              <g className="resize-handles">
                {(
                  [
                    ['nw', selectedNode.x, selectedNode.y],
                    [
                      'ne',
                      selectedNode.x + selectedNode.width,
                      selectedNode.y,
                    ],
                    [
                      'se',
                      selectedNode.x + selectedNode.width,
                      selectedNode.y + selectedNode.height,
                    ],
                    [
                      'sw',
                      selectedNode.x,
                      selectedNode.y + selectedNode.height,
                    ],
                  ] as [Corner, number, number][]
                ).map(([corner, x, y]) => (
                  <rect
                    key={corner}
                    x={x - 4 / viewport.zoom}
                    y={y - 4 / viewport.zoom}
                    width={8 / viewport.zoom}
                    height={8 / viewport.zoom}
                    rx={1.5 / viewport.zoom}
                    fill="#ffffff"
                    stroke={ACCENT}
                    strokeWidth={1.6 / viewport.zoom}
                    className={`resize-handle ${corner}`}
                    onPointerDown={(event) =>
                      handleResizePointerDown(event, selectedNode, corner)
                    }
                  />
                ))}
              </g>
            )}

            {marqueeRect && (
              <rect
                x={marqueeRect.x}
                y={marqueeRect.y}
                width={marqueeRect.width}
                height={marqueeRect.height}
                fill="rgba(36, 103, 232, 0.08)"
                stroke={ACCENT}
                strokeWidth={1.2 / viewport.zoom}
                strokeDasharray={`${5 / viewport.zoom} ${4 / viewport.zoom}`}
                pointerEvents="none"
              />
            )}

            {connectPath && (
              <>
                <path
                  d={connectPath}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={2 / viewport.zoom}
                  strokeDasharray={`${7 / viewport.zoom} ${5 / viewport.zoom}`}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {connectPreview && (
                  <circle
                    cx={connectPreview.current.x}
                    cy={connectPreview.current.y}
                    r={4 / viewport.zoom}
                    fill={ACCENT}
                    pointerEvents="none"
                  />
                )}
              </>
            )}
          </g>
        </g>
      </svg>

      {diagram.nodes.length === 0 && (
        <div className="canvas-empty">
          <div className="canvas-empty-art">
            <div className="empty-node top" />
            <div className="empty-arrow" />
            <div className="empty-node diamond" />
            <div className="empty-branch left" />
            <div className="empty-branch right" />
          </div>
          <strong>Создайте первую блок-схему</strong>
          <span>Начните с терминатора или выберите фигуру слева</span>
          <button
            className="button button-primary"
            onClick={() => addAtViewportCenter('start')}
          >
            <Sparkles size={15} />
            Добавить «Начало»
          </button>
        </div>
      )}

      {editing && editingNode && editingScreen && (
        <textarea
          ref={textareaRef}
          className={`node-editor node-editor-${editingNode.kind}`}
          style={{
            left: editingScreen.x,
            top: editingScreen.y,
            width: Math.max(80, editingNode.width * viewport.zoom),
            height: Math.max(40, editingNode.height * viewport.zoom),
            fontSize: Math.max(11, Math.min(20, 14 * viewport.zoom)),
          }}
          value={editing.value}
          onChange={(event) =>
            setEditing((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={commitEditing}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              cancelEditingRef.current = true;
              setEditing(null);
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.currentTarget.blur();
            }
          }}
          spellCheck={false}
        />
      )}

      <div className="canvas-status">
        <span className="status-chip">
          <span className="status-dot" />
          {countLabel(diagram.nodes.length, ['блок', 'блока', 'блоков'])} ·{' '}
          {countLabel(diagram.edges.length, ['связь', 'связи', 'связей'])}
        </span>
        {selectedCount > 0 && (
          <span className="status-chip selection-chip">
            <MousePointerClick size={13} />
            {selection.nodes.length > 0
              ? `${selection.nodes.length} выбрано`
              : 'связь'}
          </span>
        )}
        {effectiveTool === 'connect' && (
          <span className="status-chip hint-chip">
            Потяните от блока или точки к другому блоку
          </span>
        )}
        {effectiveTool === 'hand' && (
          <span className="status-chip hint-chip">
            <Hand size={13} />
            Перетащите холст
          </span>
        )}
      </div>

      <div className="zoom-controls">
        <button onClick={() => zoomAt(1 / 1.2)} title="Уменьшить" aria-label="Уменьшить">
          <Minus size={15} />
        </button>
        <button
          className="zoom-value"
          onClick={() => zoomAt(1 / viewport.zoom)}
          title="Сбросить масштаб"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button onClick={() => zoomAt(1.2)} title="Увеличить" aria-label="Увеличить">
          <Plus size={15} />
        </button>
        <span className="zoom-divider" />
        <button onClick={fitToContent} title="Вписать схему" aria-label="Вписать схему">
          <Maximize size={15} />
        </button>
      </div>

      {dropActive && (
        <div className="drop-overlay">
          <span>Отпустите, чтобы добавить фигуру</span>
        </div>
      )}
    </div>
  );
});
