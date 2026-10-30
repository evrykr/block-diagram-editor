import { useCallback, useEffect, useRef, useState } from 'react';
import type { Diagram } from '../types/diagram';
import { migrateLegacyDemo, STORAGE_KEY } from '../data/sample';

type Updater = Diagram | ((current: Diagram) => Diagram);

interface HistoryState {
  past: Diagram[];
  present: Diagram;
  future: Diagram[];
}

export interface HistoryApi {
  diagram: Diagram;
  update: (updater: Updater, options?: { history?: boolean }) => void;
  replace: (diagram: Diagram) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  beginTransaction: () => void;
  endTransaction: () => void;
  cancelTransaction: () => void;
}

const cloneDiagram = (diagram: Diagram): Diagram => ({
  ...diagram,
  nodes: diagram.nodes.map((node) => ({ ...node })),
  edges: diagram.edges.map((edge) => ({
    ...edge,
    waypoints: edge.waypoints?.map((point) => ({ ...point })),
  })),
});

const withTimestamp = (diagram: Diagram): Diagram => ({
  ...diagram,
  updatedAt: Date.now(),
});

export function useDiagramHistory(initial: Diagram): HistoryApi {
  const [state, setState] = useState<HistoryState>({
    past: [],
    present: initial,
    future: [],
  });
  const transactionBase = useRef<Diagram | null>(null);
  const transactionDirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const presentRef = useRef(state.present);
  presentRef.current = state.present;

  const update = useCallback(
    (updater: Updater, options?: { history?: boolean }) => {
      setState((previous) => {
        const base =
          typeof updater === 'function'
            ? (updater as (value: Diagram) => Diagram)(previous.present)
            : updater;
        if (base === previous.present) return previous;
        const next = withTimestamp(base);
        if (transactionBase.current) transactionDirty.current = true;
        const recordHistory =
          options?.history !== false && !transactionBase.current;
        return {
          past: recordHistory
            ? [...previous.past.slice(-79), previous.present]
            : previous.past,
          present: next,
          future: recordHistory ? [] : previous.future,
        };
      });
    },
    [],
  );

  const replace = useCallback((diagram: Diagram) => {
    setState((previous) => ({
      past: [...previous.past.slice(-79), previous.present],
      present: withTimestamp(diagram),
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((previous) => {
      if (previous.past.length === 0) return previous;
      const index = previous.past.length - 1;
      return {
        past: previous.past.slice(0, index),
        present: previous.past[index],
        future: [previous.present, ...previous.future].slice(0, 80),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((previous) => {
      if (previous.future.length === 0) return previous;
      return {
        past: [...previous.past.slice(-79), previous.present],
        present: previous.future[0],
        future: previous.future.slice(1),
      };
    });
  }, []);

  const beginTransaction = useCallback(() => {
    if (!transactionBase.current) {
      transactionBase.current = cloneDiagram(presentRef.current);
      transactionDirty.current = false;
    }
  }, []);

  const endTransaction = useCallback(() => {
    const base = transactionBase.current;
    const dirty = transactionDirty.current;
    transactionBase.current = null;
    transactionDirty.current = false;
    if (!base || !dirty) return;
    setState((previous) => ({
      past: [...previous.past.slice(-79), base],
      present: previous.present,
      future: [],
    }));
  }, []);

  const cancelTransaction = useCallback(() => {
    const base = transactionBase.current;
    transactionBase.current = null;
    transactionDirty.current = false;
    if (!base) return;
    setState((previous) => ({ ...previous, present: base, future: [] }));
  }, []);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.present));
      } catch {
        // Autosave can be unavailable in private or restricted contexts.
      }
    }, 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state.present]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (typing) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (
        event.key.toLowerCase() === 'y' ||
        (event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, undo]);

  return {
    diagram: state.present,
    update,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    beginTransaction,
    endTransaction,
    cancelTransaction,
  };
}

const VALID_KINDS = new Set([
  'start',
  'end',
  'process',
  'decision',
  'io',
  'predefined',
  'document',
  'preparation',
  'manual',
  'delay',
  'connector',
  'comment',
]);

export function loadInitialDiagram(fallback: Diagram): Diagram {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Diagram;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      typeof parsed.title !== 'string'
    ) {
      return fallback;
    }
    const nodesValid = parsed.nodes.every(
      (node) =>
        node &&
        typeof node.id === 'string' &&
        VALID_KINDS.has(node.kind) &&
        typeof node.text === 'string' &&
        Number.isFinite(node.x) &&
        Number.isFinite(node.y) &&
        Number.isFinite(node.width) &&
        Number.isFinite(node.height),
    );
    if (!nodesValid || parsed.nodes.length === 0) return fallback;
    const ids = new Set(parsed.nodes.map((node) => node.id));
    const edgesValid = parsed.edges.every(
      (edge) =>
        edge &&
        typeof edge.id === 'string' &&
        ids.has(edge.from) &&
        ids.has(edge.to),
    );
    if (!edgesValid) return fallback;
    return migrateLegacyDemo(parsed);
  } catch {
    return fallback;
  }
}
