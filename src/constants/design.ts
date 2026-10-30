import type { NodeDefinition, NodeKind } from '../types/diagram';

export const GRID = 20;
export const SNAP = 10;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    kind: 'start',
    label: 'Начало',
    gost: 'Терминатор',
    description: 'Точка входа в алгоритм',
    category: 'basic',
    width: 200,
    height: 60,
  },
  {
    kind: 'end',
    label: 'Конец',
    gost: 'Терминатор',
    description: 'Завершение алгоритма',
    category: 'basic',
    width: 200,
    height: 60,
  },
  {
    kind: 'process',
    label: 'Процесс',
    gost: 'Действие',
    description: 'Вычисление, присваивание, вызов',
    category: 'basic',
    width: 210,
    height: 74,
  },
  {
    kind: 'decision',
    label: 'Решение',
    gost: 'Условие',
    description: 'Ветвление или проверка условия',
    category: 'basic',
    width: 250,
    height: 120,
    maxLines: 3,
  },
  {
    kind: 'io',
    label: 'Ввод / вывод',
    gost: 'Данные',
    description: 'Ввод исходных данных или вывод результата',
    category: 'basic',
    width: 220,
    height: 78,
  },
  {
    kind: 'predefined',
    label: 'Предопределённый процесс',
    gost: 'Подпрограмма',
    description: 'Вызов подпрограммы или функции',
    category: 'gost',
    width: 230,
    height: 78,
  },
  {
    kind: 'document',
    label: 'Документ',
    gost: 'Данные',
    description: 'Ввод или вывод на бумажный носитель',
    category: 'gost',
    width: 220,
    height: 90,
  },
  {
    kind: 'preparation',
    label: 'Подготовка',
    gost: 'Цикл',
    description: 'Подготовка цикла, счётчик',
    category: 'gost',
    width: 220,
    height: 82,
  },
  {
    kind: 'manual',
    label: 'Ручная операция',
    gost: 'Операция',
    description: 'Действие, выполняемое человеком',
    category: 'gost',
    width: 220,
    height: 82,
  },
  {
    kind: 'delay',
    label: 'Задержка',
    gost: 'Ожидание',
    description: 'Пауза или ожидание события',
    category: 'gost',
    width: 190,
    height: 82,
  },
  {
    kind: 'connector',
    label: 'Соединитель',
    gost: 'Точка',
    description: 'Переход между частями схемы',
    category: 'links',
    width: 60,
    height: 60,
  },
  {
    kind: 'comment',
    label: 'Комментарий',
    gost: 'Пояснение',
    description: 'Пояснение к элементу схемы',
    category: 'links',
    width: 230,
    height: 88,
  },
];

export const NODE_MAP = Object.fromEntries(
  NODE_DEFINITIONS.map((definition) => [definition.kind, definition]),
) as Record<NodeKind, NodeDefinition>;

export const PALETTE_DEFINITIONS = NODE_DEFINITIONS.filter(
  (definition) => definition.palette !== false,
);

export const CATEGORIES: { id: 'basic' | 'gost' | 'links'; title: string }[] = [
  { id: 'basic', title: 'Базовые фигуры' },
  { id: 'gost', title: 'Специальные по ГОСТ' },
  { id: 'links', title: 'Связи и пояснения' },
];

export const KIND_BY_LEGACY: Record<string, NodeKind> = {
  terminator: 'start',
  process: 'process',
  decision: 'decision',
  io: 'io',
  data: 'io',
};

export const NODE_FILL = '#ffffff';
export const NODE_STROKE = '#273241';
export const EDGE_COLOR = '#344052';
export const ACCENT = '#2467e8';
export const FONT_FAMILY =
  "'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, -apple-system, sans-serif";
export const MONO_FAMILY =
  "'Cascadia Code', 'Cascadia Mono', Consolas, 'SFMono-Regular', monospace";
