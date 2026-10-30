import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  NodeKind,
  Selection,
  Side,
  Tool,
} from './types/diagram';
import { NODE_MAP } from './constants/design';
import { createBlankDiagram, createDemoDiagram } from './data/sample';
import { useDiagramHistory, loadInitialDiagram } from './hooks/useDiagramHistory';
import {
  createId,
  nodeBounds,
  rectsOverlap,
  snap,
} from './lib/geometry';
import { autoLayoutDiagram } from './lib/autoLayout';
import {
  diagramToJsonFile,
  downloadText,
  normalizeImportedDiagram,
  safeFilename,
} from './lib/export';
import { Header } from './components/Header';
import { Palette } from './components/Palette';
import { Canvas, type CanvasHandle } from './components/Canvas';
import { CanvasToolbar } from './components/CanvasToolbar';
import { Inspector } from './components/Inspector';
import { CodeStudio } from './components/CodeStudio';
import { ExportDialog } from './components/ExportDialog';
import { HelpDialog } from './components/HelpDialog';
import { ToastViewport, type ToastItem } from './components/Toast';

const DEFAULT_TEXT: Record<NodeKind, string> = {
  start: 'Начало',
  end: 'Конец',
  process: 'Действие',
  decision: 'Условие?',
  io: 'Ввод / вывод',
  predefined: 'Подпрограмма',
  document: 'Документ',
  manual: 'Ручная операция',
  preparation: 'Подготовка',
  delay: 'Задержка',
  connector: 'A',
  comment: 'Пояснение',
};

const NODE_OFFSETS: [number, number][] = [
  [0, 0],
  [0, 90],
  [120, 0],
  [-120, 0],
  [120, 90],
  [-120, 90],
  [0, -90],
  [220, 0],
  [-220, 0],
  [220, 90],
  [-220, 90],
  [0, 180],
];

function initialDiagram(): Diagram {
  return loadInitialDiagram(createDemoDiagram());
}

export default function App() {
  const initial = useRef<Diagram>(initialDiagram());
  const {
    diagram,
    update,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    beginTransaction,
    endTransaction,
  } = useDiagramHistory(initial.current);
  const [selection, setSelection] = useState<Selection>({
    nodes: [],
    edges: [],
  });
  const [tool, setTool] = useState<Tool>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [codeOpen, setCodeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const canvasRef = useRef<CanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimers = useRef<number[]>([]);

  const pushToast = useCallback(
    (message: string, tone: ToastItem['tone'] = 'success') => {
      const id = createId('toast');
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, 3400);
      toastTimers.current.push(timer);
    },
    [],
  );

  useEffect(() => {
    return () => {
      for (const timer of toastTimers.current) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    document.title = `${diagram.title || 'Блок-схема'} — СхемоГОСТ`;
  }, [diagram.title]);

  useEffect(() => {
    const nodeIds = new Set(diagram.nodes.map((node) => node.id));
    const edgeIds = new Set(diagram.edges.map((edge) => edge.id));
    setSelection((current) => {
      const nodes = current.nodes.filter((id) => nodeIds.has(id));
      const edges = current.edges.filter((id) => edgeIds.has(id));
      if (
        nodes.length === current.nodes.length &&
        edges.length === current.edges.length
      ) {
        return current;
      }
      return { nodes, edges };
    });
  }, [diagram.edges, diagram.nodes]);

  const requestFit = useCallback(() => {
    setFitNonce((value) => value + 1);
  }, []);

  const addNodeAt = useCallback(
    (kind: NodeKind, worldX: number, worldY: number) => {
      const definition = NODE_MAP[kind];
      const width = definition.width;
      const height = definition.height;
      const baseX = snap(worldX - width / 2, 10);
      const baseY = snap(worldY - height / 2, 10);
      const existing = diagram.nodes;
      let x = baseX;
      let y = baseY;
      for (const [offsetX, offsetY] of NODE_OFFSETS) {
        const candidate = {
          x: baseX + offsetX,
          y: baseY + offsetY,
          width,
          height,
        };
        const collision = existing.some((node) =>
          rectsOverlap(nodeBounds(node), candidate, 14),
        );
        if (!collision) {
          x = candidate.x;
          y = candidate.y;
          break;
        }
      }
      let text = DEFAULT_TEXT[kind];
      if (kind === 'connector') {
        const count = existing.filter((node) => node.kind === 'connector').length;
        text = String.fromCharCode(65 + (count % 26));
      }
      const node: DiagramNode = {
        id: createId('n'),
        kind,
        text,
        x,
        y,
        width,
        height,
      };
      update((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelection({ nodes: [node.id], edges: [] });
    },
    [diagram.nodes, update],
  );

  const createEdge = useCallback(
    (from: string, to: string, fromSide: Side, toSide: Side) => {
      if (from === to) return;
      const exists = diagram.edges.find(
        (edge) =>
          edge.from === from &&
          edge.to === to &&
          edge.fromSide === fromSide &&
          edge.toSide === toSide,
      );
      if (exists) {
        setSelection({ nodes: [], edges: [exists.id] });
        pushToast('Такая связь уже есть', 'info');
        return;
      }
      const source = diagram.nodes.find((node) => node.id === from);
      let label: string | undefined;
      let branch: 'yes' | 'no' | undefined;
      if (source?.kind === 'decision') {
        const outgoing = diagram.edges.filter((edge) => edge.from === from);
        if (outgoing.length === 0) {
          label = 'Да';
          branch = 'yes';
        } else if (!outgoing.some((edge) => edge.branch === 'no')) {
          label = 'Нет';
          branch = 'no';
        }
      }
      const edge: DiagramEdge = {
        id: createId('e'),
        from,
        to,
        fromSide,
        toSide,
        ...(label ? { label } : {}),
        ...(branch ? { branch } : {}),
      };
      update((current) => ({ ...current, edges: [...current.edges, edge] }));
      setSelection({ nodes: [], edges: [edge.id] });
    },
    [diagram.edges, diagram.nodes, pushToast, update],
  );

  const deleteSelection = useCallback(() => {
    if (selection.nodes.length === 0 && selection.edges.length === 0) return;
    const nodes = new Set(selection.nodes);
    const edges = new Set(selection.edges);
    update((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !nodes.has(node.id)),
      edges: current.edges.filter(
        (edge) =>
          !edges.has(edge.id) &&
          !nodes.has(edge.from) &&
          !nodes.has(edge.to),
      ),
    }));
    setSelection({ nodes: [], edges: [] });
    pushToast('Удалено', 'info');
  }, [pushToast, selection, update]);

  const duplicateSelection = useCallback(() => {
    if (selection.nodes.length === 0) {
      pushToast('Выберите блоки для дублирования', 'info');
      return;
    }
    const idMap = new Map<string, string>();
    const selected = diagram.nodes.filter((node) =>
      selection.nodes.includes(node.id),
    );
    const newNodes = selected.map((node) => {
      const id = createId('n');
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        x: snap(node.x + 32, 10),
        y: snap(node.y + 32, 10),
      };
    });
    const newEdges = diagram.edges
      .filter(
        (edge) => idMap.has(edge.from) && idMap.has(edge.to),
      )
      .map((edge) => ({
        ...edge,
        id: createId('e'),
        from: idMap.get(edge.from)!,
        to: idMap.get(edge.to)!,
        waypoints: edge.waypoints?.map((point) => ({
          x: point.x + 32,
          y: point.y + 32,
        })),
      }));
    update((current) => ({
      ...current,
      nodes: [...current.nodes, ...newNodes],
      edges: [...current.edges, ...newEdges],
    }));
    setSelection({ nodes: newNodes.map((node) => node.id), edges: [] });
    pushToast(
      newNodes.length === 1 ? 'Блок продублирован' : 'Блоки продублированы',
    );
  }, [diagram.edges, diagram.nodes, pushToast, selection.nodes, update]);

  const alignSelection = useCallback(
    (
      alignment:
        | 'left'
        | 'center-x'
        | 'right'
        | 'top'
        | 'middle-y'
        | 'bottom',
    ) => {
      if (selection.nodes.length < 2) return;
      const nodes = diagram.nodes.filter((node) =>
        selection.nodes.includes(node.id),
      );
      const left = Math.min(...nodes.map((node) => node.x));
      const right = Math.max(...nodes.map((node) => node.x + node.width));
      const top = Math.min(...nodes.map((node) => node.y));
      const bottom = Math.max(...nodes.map((node) => node.y + node.height));
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      update((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          if (!selection.nodes.includes(node.id)) return node;
          switch (alignment) {
            case 'left':
              return { ...node, x: snap(left, 5) };
            case 'center-x':
              return { ...node, x: snap(centerX - node.width / 2, 5) };
            case 'right':
              return { ...node, x: snap(right - node.width, 5) };
            case 'top':
              return { ...node, y: snap(top, 5) };
            case 'middle-y':
              return { ...node, y: snap(centerY - node.height / 2, 5) };
            case 'bottom':
              return { ...node, y: snap(bottom - node.height, 5) };
          }
        }),
      }));
    },
    [diagram.nodes, selection.nodes, update],
  );

  const distributeSelection = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      if (selection.nodes.length < 3) return;
      const nodes = diagram.nodes
        .filter((node) => selection.nodes.includes(node.id))
        .sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));
      if (axis === 'horizontal') {
        const start = Math.min(...nodes.map((node) => node.x));
        const end = Math.max(...nodes.map((node) => node.x + node.width));
        const totalWidth = nodes.reduce((sum, node) => sum + node.width, 0);
        const gap = (end - start - totalWidth) / (nodes.length - 1);
        const positions = new Map<string, number>();
        let cursor = start;
        for (const node of nodes) {
          positions.set(node.id, snap(cursor, 5));
          cursor += node.width + gap;
        }
        update((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            positions.has(node.id)
              ? { ...node, x: positions.get(node.id)! }
              : node,
          ),
        }));
      } else {
        const start = Math.min(...nodes.map((node) => node.y));
        const end = Math.max(...nodes.map((node) => node.y + node.height));
        const totalHeight = nodes.reduce((sum, node) => sum + node.height, 0);
        const gap = (end - start - totalHeight) / (nodes.length - 1);
        const positions = new Map<string, number>();
        let cursor = start;
        for (const node of nodes) {
          positions.set(node.id, snap(cursor, 5));
          cursor += node.height + gap;
        }
        update((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            positions.has(node.id)
              ? { ...node, y: positions.get(node.id)! }
              : node,
          ),
        }));
      }
    },
    [diagram.nodes, selection.nodes, update],
  );

  const uniformSize = useCallback(() => {
    if (selection.nodes.length < 2) return;
    const nodes = diagram.nodes.filter((node) =>
      selection.nodes.includes(node.id),
    );
    const width = snap(
      nodes.reduce((sum, node) => sum + node.width, 0) / nodes.length,
      5,
    );
    const height = snap(
      nodes.reduce((sum, node) => sum + node.height, 0) / nodes.length,
      5,
    );
    update((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (!selection.nodes.includes(node.id)) return node;
        return {
          ...node,
          width,
          height,
          x: snap(node.x + node.width / 2 - width / 2, 5),
          y: snap(node.y + node.height / 2 - height / 2, 5),
        };
      }),
    }));
    pushToast('Размер блоков выровнен');
  }, [diagram.nodes, pushToast, selection.nodes, update]);

  const handleAutoLayout = useCallback(() => {
    if (diagram.nodes.length < 2) return;
    const next = autoLayoutDiagram(diagram);
    update(() => next);
    requestFit();
    pushToast('Схема упорядочена');
  }, [diagram, pushToast, requestFit, update]);

  const saveJson = useCallback(() => {
    downloadText(
      diagramToJsonFile(diagram),
      `${safeFilename(diagram.title)}.json`,
      'application/json;charset=utf-8',
    );
    pushToast('Проект сохранён в JSON');
  }, [diagram, pushToast]);

  const newDiagram = useCallback(() => {
    const blank = createBlankDiagram('Новая блок-схема');
    replace(blank);
    setSelection({ nodes: [], edges: [] });
    requestFit();
    pushToast('Создана новая схема. Отмена — Ctrl+Z', 'info');
  }, [pushToast, replace, requestFit]);

  const importJson = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const imported = normalizeImportedDiagram(JSON.parse(text));
        replace(imported);
        setSelection({ nodes: [], edges: [] });
        requestFit();
        pushToast('Схема загружена из файла');
      } catch (error) {
        pushToast(
          error instanceof Error
            ? error.message
            : 'Не удалось открыть файл',
          'error',
        );
      }
    },
    [pushToast, replace, requestFit],
  );

  const applyGeneratedDiagram = useCallback(
    (next: Diagram) => {
      replace(next);
      setSelection({ nodes: [], edges: [] });
      setCodeOpen(false);
      requestFit();
      pushToast('Схема построена по коду');
    },
    [pushToast, replace, requestFit],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (typing) return;
      if (codeOpen || exportOpen || helpOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier) {
        const code = event.code;
        if (code === 'KeyS') {
          event.preventDefault();
          saveJson();
        } else if (code === 'KeyE') {
          event.preventDefault();
          setExportOpen(true);
        } else if (code === 'KeyG') {
          event.preventDefault();
          setCodeOpen(true);
        } else if (code === 'KeyD') {
          event.preventDefault();
          duplicateSelection();
        } else if (code === 'KeyA') {
          event.preventDefault();
          setSelection({
            nodes: diagram.nodes.map((node) => node.id),
            edges: [],
          });
        }
        return;
      }
      if (event.code === 'KeyV') setTool('select');
      if (event.code === 'KeyC') setTool('connect');
      if (event.code === 'KeyH') setTool('hand');
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if (event.key === 'Escape') {
        setSelection({ nodes: [], edges: [] });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    codeOpen,
    deleteSelection,
    diagram.nodes,
    duplicateSelection,
    exportOpen,
    helpOpen,
    saveJson,
  ]);

  const updateTitle = (title: string) => {
    update((current) => ({ ...current, title }), { history: false });
  };

  return (
    <div className="app-shell">
      <Header
        title={diagram.title}
        onTitleChange={updateTitle}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenCode={() => setCodeOpen(true)}
        onExport={() => setExportOpen(true)}
        onNew={newDiagram}
        onImport={importJson}
        onSaveJson={saveJson}
        onOpenHelp={() => setHelpOpen(true)}
        nodeCount={diagram.nodes.length}
      />

      <div className="workspace">
        <Palette
          onAdd={(kind) => {
            if (canvasRef.current) canvasRef.current.addAtCenter(kind);
            else addNodeAt(kind, 600, 300);
          }}
        />
        <main className="canvas-column">
          <Canvas
            ref={canvasRef}
            diagram={diagram}
            selection={selection}
            setSelection={setSelection}
            tool={tool}
            snapEnabled={snapEnabled}
            update={update}
            beginTransaction={beginTransaction}
            endTransaction={endTransaction}
            addNodeAt={addNodeAt}
            createEdge={createEdge}
            fitNonce={fitNonce}
          />
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            snap={snapEnabled}
            onSnapChange={setSnapEnabled}
            selectionCount={selection.nodes.length}
            onAlign={alignSelection}
            onDistribute={distributeSelection}
            onAutoLayout={handleAutoLayout}
          />
        </main>
        <Inspector
          diagram={diagram}
          selection={selection}
          update={update}
          beginTransaction={beginTransaction}
          endTransaction={endTransaction}
          setSelection={setSelection}
          onDelete={deleteSelection}
          onDuplicate={duplicateSelection}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
          onUniformSize={uniformSize}
          onAutoLayout={handleAutoLayout}
          onSaveJson={saveJson}
          onOpenCode={() => setCodeOpen(true)}
        />
      </div>

      <CodeStudio
        open={codeOpen}
        diagram={diagram}
        onClose={() => setCodeOpen(false)}
        onApplyDiagram={applyGeneratedDiagram}
      />
      <ExportDialog
        open={exportOpen}
        diagram={diagram}
        onClose={() => setExportOpen(false)}
        onExported={(message) => pushToast(message)}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((item) => item.id !== id))
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleFileSelected}
      />
    </div>
  );
}
