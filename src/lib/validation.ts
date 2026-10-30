import type { Diagram } from '../types/diagram';
import { rectsOverlap } from './geometry';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

export function validateDiagram(diagram: Diagram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of diagram.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
  }

  const starts = diagram.nodes.filter(
    (node) => node.kind === 'start' || /^начало$/i.test(node.text.trim()),
  );
  const ends = diagram.nodes.filter(
    (node) => node.kind === 'end' || /^конец$/i.test(node.text.trim()),
  );
  if (starts.length === 0) {
    issues.push({
      id: 'no-start',
      severity: 'error',
      title: 'Нет блока «Начало»',
      detail: 'Добавьте терминатор «Начало», чтобы задать точку входа.',
    });
  }
  if (starts.length > 1) {
    issues.push({
      id: 'many-start',
      severity: 'warning',
      title: 'Несколько блоков «Начало»',
      detail: 'Обычно у схемы одна точка входа. Проверьте лишние терминаторы.',
      nodeIds: starts.map((node) => node.id),
    });
  }
  if (ends.length === 0) {
    issues.push({
      id: 'no-end',
      severity: 'warning',
      title: 'Нет блока «Конец»',
      detail: 'Добавьте терминатор «Конец», чтобы завершить алгоритм.',
    });
  }

  for (const node of diagram.nodes) {
    const isTerminal = node.kind === 'start' || node.kind === 'end';
    const isAnnotation = node.kind === 'comment' || node.kind === 'connector';
    if (!isTerminal && !isAnnotation && !incoming.get(node.id)) {
      issues.push({
        id: `no-in-${node.id}`,
        severity: 'warning',
        title: 'Блок без входа',
        detail: `К блоку «${shortText(node.text)}» не подходит ни одна связь.`,
        nodeIds: [node.id],
      });
    }
    if (
      node.kind !== 'end' &&
      node.kind !== 'comment' &&
      !outgoing.get(node.id)
    ) {
      issues.push({
        id: `no-out-${node.id}`,
        severity: 'warning',
        title: 'Блок без выхода',
        detail: `Из блока «${shortText(node.text)}» не выходит ни одна связь.`,
        nodeIds: [node.id],
      });
    }
    if (node.kind === 'decision') {
      const exits = diagram.edges.filter((edge) => edge.from === node.id);
      if (exits.length < 2) {
        issues.push({
          id: `decision-${node.id}`,
          severity: 'warning',
          title: 'У решения меньше двух выходов',
          detail: `Условие «${shortText(node.text)}» должно иметь ветви «Да» и «Нет».`,
          nodeIds: [node.id],
        });
      } else {
        const unlabeled = exits.filter((edge) => !edge.label?.trim());
        if (unlabeled.length > 0) {
          issues.push({
            id: `branch-labels-${node.id}`,
            severity: 'info',
            title: 'Ветви без подписи',
            detail: `Подпишите выходы условия «${shortText(node.text)}» как «Да» и «Нет».`,
            nodeIds: [node.id],
            edgeIds: unlabeled.map((edge) => edge.id),
          });
        }
      }
    }
  }

  for (const edge of diagram.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      issues.push({
        id: `broken-${edge.id}`,
        severity: 'error',
        title: 'Связь ведёт в несуществующий блок',
        detail: 'Удалите повреждённую связь или восстановите блок.',
        edgeIds: [edge.id],
      });
    }
  }

  for (let first = 0; first < diagram.nodes.length; first += 1) {
    for (let second = first + 1; second < diagram.nodes.length; second += 1) {
      const a = diagram.nodes[first];
      const b = diagram.nodes[second];
      if (
        rectsOverlap(
          { x: a.x, y: a.y, width: a.width, height: a.height },
          { x: b.x, y: b.y, width: b.width, height: b.height },
          -4,
        )
      ) {
        issues.push({
          id: `overlap-${a.id}-${b.id}`,
          severity: 'warning',
          title: 'Блоки пересекаются',
          detail: `«${shortText(a.text)}» и «${shortText(b.text)}» накладываются друг на друга.`,
          nodeIds: [a.id, b.id],
        });
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: 'ok',
      severity: 'info',
      title: 'Схема оформлена корректно',
      detail:
        'Начало и конец на месте, блоки связаны, у условий есть ветви.',
    });
  }
  return issues;
}

function shortText(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 34 ? `${text.slice(0, 33)}…` : text || 'без названия';
}
