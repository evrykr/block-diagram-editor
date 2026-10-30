import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownUp,
  ArrowLeftRight,
  CheckCircle2,
  Code2,
  Copy,
  Grid3X3,
  Info,
  Layers,
  Link2,
  Maximize2,
  Move,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  Selection,
  Side,
} from '../types/diagram';
import { NODE_DEFINITIONS, NODE_MAP } from '../constants/design';
import { validateDiagram, type ValidationIssue } from '../lib/validation';
import { countLabel } from '../lib/plural';
import { ShapeGlyph } from './ShapeGlyph';

interface InspectorProps {
  diagram: Diagram;
  selection: Selection;
  update: (
    updater: Diagram | ((current: Diagram) => Diagram),
    options?: { history?: boolean },
  ) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  setSelection: (selection: Selection) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAlign: (
    alignment: 'left' | 'center-x' | 'right' | 'top' | 'middle-y' | 'bottom',
  ) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onUniformSize: () => void;
  onAutoLayout: () => void;
  onSaveJson: () => void;
  onOpenCode: () => void;
}

type Tab = 'properties' | 'validation';

function NumberField({
  label,
  value,
  onChange,
  min = 30,
  step = 10,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));

  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.round(value)));
      return;
    }
    onChange(Math.max(min, parsed));
  };

  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-input-wrap">
        <input
          type="number"
          value={draft}
          min={min}
          step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setDraft(String(Math.round(value)));
              event.currentTarget.blur();
            }
          }}
        />
        <span className="unit">px</span>
      </div>
    </label>
  );
}

function SideSelect({
  value,
  onChange,
  label,
}: {
  value: Side | undefined;
  onChange: (side: Side | undefined) => void;
  label: string;
}) {
  return (
    <label className="property-field">
      <span>{label}</span>
      <select
        value={value ?? 'auto'}
        onChange={(event) =>
          onChange(
            event.target.value === 'auto'
              ? undefined
              : (event.target.value as Side),
          )
        }
      >
        <option value="auto">Автоматически</option>
        <option value="top">Сверху</option>
        <option value="right">Справа</option>
        <option value="bottom">Снизу</option>
        <option value="left">Слева</option>
      </select>
    </label>
  );
}

function SeverityIcon({ issue }: { issue: ValidationIssue }) {
  if (issue.id === 'ok') return <CheckCircle2 size={17} className="ok" />;
  if (issue.severity === 'error') {
    return <AlertTriangle size={17} className="error" />;
  }
  if (issue.severity === 'warning') {
    return <AlertTriangle size={17} className="warning" />;
  }
  return <Info size={17} className="info" />;
}

export function Inspector({
  diagram,
  selection,
  update,
  beginTransaction,
  endTransaction,
  setSelection,
  onDelete,
  onDuplicate,
  onAlign,
  onDistribute,
  onUniformSize,
  onAutoLayout,
  onSaveJson,
  onOpenCode,
}: InspectorProps) {
  const [tab, setTab] = useState<Tab>('properties');
  const issues = useMemo(() => validateDiagram(diagram), [diagram]);
  const realIssues = issues.filter((issue) => issue.id !== 'ok');
  const selectedNodes = diagram.nodes.filter((node) =>
    selection.nodes.includes(node.id),
  );
  const selectedEdges = diagram.edges.filter((edge) =>
    selection.edges.includes(edge.id),
  );
  const singleNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const singleEdge = selectedEdges.length === 1 ? selectedEdges[0] : null;

  useEffect(() => {
    if (selection.nodes.length || selection.edges.length) {
      setTab('properties');
    }
  }, [selection.edges.join('|'), selection.nodes.join('|')]);

  const patchNode = (patch: Partial<DiagramNode>, history = true) => {
    if (!singleNode) return;
    update(
      (current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === singleNode.id ? { ...node, ...patch } : node,
        ),
      }),
      { history },
    );
  };

  const patchText = (text: string) => {
    if (!singleNode) return;
    update(
      (current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === singleNode.id
            ? { ...node, text, code: undefined }
            : node,
        ),
      }),
      { history: false },
    );
  };

  const patchEdge = (patch: Partial<DiagramEdge>) => {
    if (!singleEdge) return;
    update((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === singleEdge.id ? { ...edge, ...patch } : edge,
      ),
    }));
  };

  const contextLabel = singleNode
    ? NODE_MAP[singleNode.kind].label
    : singleEdge
      ? 'Связь'
      : selectedNodes.length > 1
        ? 'Группа блоков'
        : 'Документ';

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className="inspector-title-row">
          <div>
            <div className="eyebrow">Инспектор</div>
            <div className="inspector-context">{contextLabel}</div>
          </div>
          <div className="inspector-badge">GOST</div>
        </div>
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'properties'}
            className={tab === 'properties' ? 'is-active' : ''}
            onClick={() => setTab('properties')}
          >
            Свойства
          </button>
          <button
            role="tab"
            aria-selected={tab === 'validation'}
            className={tab === 'validation' ? 'is-active' : ''}
            onClick={() => setTab('validation')}
          >
            Проверка
            {realIssues.length > 0 && (
              <span className="tab-count">{realIssues.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="inspector-scroll">
        {tab === 'validation' ? (
          <ValidationPanel
            issues={issues}
            onSelect={(nodeIds, edgeIds) => {
              setSelection({ nodes: nodeIds ?? [], edges: edgeIds ?? [] });
              setTab('properties');
            }}
          />
        ) : singleNode ? (
          <NodePanel
            node={singleNode}
            onPatch={patchNode}
            onText={patchText}
            onBegin={beginTransaction}
            onEnd={endTransaction}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ) : singleEdge ? (
          <EdgePanel
            edge={singleEdge}
            nodes={diagram.nodes}
            onPatch={patchEdge}
            onDelete={onDelete}
            onBegin={beginTransaction}
            onEnd={endTransaction}
            onSelectNode={(nodeId) =>
              setSelection({ nodes: [nodeId], edges: [] })
            }
          />
        ) : selectedNodes.length > 1 ? (
          <MultiPanel
            count={selectedNodes.length}
            onAlign={onAlign}
            onDistribute={onDistribute}
            onUniformSize={onUniformSize}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ) : (
          <DocumentPanel
            diagram={diagram}
            issues={realIssues}
            onAutoLayout={onAutoLayout}
            onSaveJson={onSaveJson}
            onOpenCode={onOpenCode}
            onShowIssues={() => setTab('validation')}
          />
        )}
      </div>

      <div className="inspector-footer">
        <Grid3X3 size={14} />
        <span>Сетка 20 px · привязка к узлам</span>
      </div>
    </aside>
  );
}

function NodePanel({
  node,
  onPatch,
  onText,
  onBegin,
  onEnd,
  onDuplicate,
  onDelete,
}: {
  node: DiagramNode;
  onPatch: (patch: Partial<DiagramNode>) => void;
  onText: (text: string) => void;
  onBegin: () => void;
  onEnd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const definition = NODE_MAP[node.kind];
  return (
    <>
      <div className="node-summary">
        <div className="node-summary-icon">
          <ShapeGlyph kind={node.kind} size={42} />
        </div>
        <div>
          <strong>{definition.label}</strong>
          <span>{definition.description}</span>
        </div>
      </div>

      <section className="property-section">
        <div className="property-section-title">Содержимое</div>
        <label className="property-field">
          <span>Текст блока</span>
          <textarea
            value={node.text}
            onChange={(event) => onText(event.target.value)}
            onFocus={onBegin}
            onBlur={onEnd}
            rows={3}
            placeholder="Введите текст"
          />
        </label>
        {node.code && (
          <div className="code-note">
            <Code2 size={13} />
            <span>Сохранён исходный фрагмент кода</span>
          </div>
        )}
      </section>

      <section className="property-section">
        <div className="property-section-title">Тип фигуры</div>
        <select
          className="type-select"
          value={node.kind}
          onChange={(event) =>
            onPatch({ kind: event.target.value as DiagramNode['kind'] })
          }
        >
          {NODE_DEFINITIONS.map((item) => (
            <option value={item.kind} key={item.kind}>
              {item.label}
            </option>
          ))}
        </select>
      </section>

      <section className="property-section">
        <div className="property-section-title">
          Геометрия
          <span className="section-hint">10 px</span>
        </div>
        <div className="number-grid">
          <NumberField
            label="X"
            value={node.x}
            onChange={(x) => onPatch({ x: Math.round(x) })}
            min={-2000}
          />
          <NumberField
            label="Y"
            value={node.y}
            onChange={(y) => onPatch({ y: Math.round(y) })}
            min={-2000}
          />
          <NumberField
            label="Ширина"
            value={node.width}
            onChange={(width) => onPatch({ width: Math.round(width) })}
            min={60}
          />
          <NumberField
            label="Высота"
            value={node.height}
            onChange={(height) => onPatch({ height: Math.round(height) })}
            min={40}
          />
        </div>
        <button
          className="subtle-button"
          onClick={() =>
            onPatch({
              width: definition.width,
              height: definition.height,
            })
          }
        >
          <ScanLine size={14} />
          Стандартный размер ГОСТ
        </button>
      </section>

      <div className="inspector-actions">
        <button className="button button-soft" onClick={onDuplicate}>
          <Copy size={15} />
          Дублировать
        </button>
        <button className="button button-danger-soft" onClick={onDelete}>
          <Trash2 size={15} />
          Удалить
        </button>
      </div>
    </>
  );
}

function EdgePanel({
  edge,
  nodes,
  onPatch,
  onDelete,
  onSelectNode,
  onBegin,
  onEnd,
}: {
  edge: DiagramEdge;
  nodes: DiagramNode[];
  onPatch: (patch: Partial<DiagramEdge>) => void;
  onDelete: () => void;
  onSelectNode: (nodeId: string) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);
  return (
    <>
      <div className="edge-summary">
        <div className="edge-summary-icon">
          <Route size={22} />
        </div>
        <div>
          <strong>Ортогональная связь</strong>
          <span>Скругление 10 px · линия 1,7</span>
        </div>
      </div>

      <section className="property-section">
        <div className="property-section-title">Подпись</div>
        <label className="property-field">
          <span>Текст на линии</span>
          <input
            value={edge.label ?? ''}
            onChange={(event) => onPatch({ label: event.target.value })}
            onFocus={onBegin}
            onBlur={onEnd}
            placeholder="Например, Да"
          />
        </label>
        <div className="quick-chips">
          <button onClick={() => onPatch({ label: 'Да', branch: 'yes' })}>
            Да
          </button>
          <button onClick={() => onPatch({ label: 'Нет', branch: 'no' })}>
            Нет
          </button>
          <button onClick={() => onPatch({ label: undefined, branch: undefined })}>
            Без подписи
          </button>
        </div>
      </section>

      <section className="property-section">
        <div className="property-section-title">Маршрут</div>
        <SideSelect
          label="Выход из блока"
          value={edge.fromSide}
          onChange={(fromSide) => onPatch({ fromSide })}
        />
        <SideSelect
          label="Вход в блок"
          value={edge.toSide}
          onChange={(toSide) => onPatch({ toSide })}
        />
        <label className="switch-row">
          <span>
            <strong>Пунктирная линия</strong>
            <small>Для вспомогательных связей</small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(edge.dashed)}
            onChange={(event) => onPatch({ dashed: event.target.checked })}
          />
        </label>
        <button
          className="subtle-button"
          onClick={() =>
            onPatch({
              from: edge.to,
              to: edge.from,
              fromSide: edge.toSide,
              toSide: edge.fromSide,
              waypoints: undefined,
            })
          }
        >
          <ArrowLeftRight size={14} />
          Развернуть направление
        </button>
      </section>

      <section className="property-section">
        <div className="property-section-title">Соединяет</div>
        <button
          className="connected-node"
          onClick={() => from && onSelectNode(from.id)}
        >
          <span className="connected-label">От</span>
          <span>{from?.text || '—'}</span>
          <ArrowDownUp size={13} />
        </button>
        <button
          className="connected-node"
          onClick={() => to && onSelectNode(to.id)}
        >
          <span className="connected-label">До</span>
          <span>{to?.text || '—'}</span>
          <ArrowDownUp size={13} />
        </button>
      </section>

      <div className="inspector-actions">
        <button className="button button-danger-soft full" onClick={onDelete}>
          <Trash2 size={15} />
          Удалить связь
        </button>
      </div>
    </>
  );
}

function MultiPanel({
  count,
  onAlign,
  onDistribute,
  onUniformSize,
  onDuplicate,
  onDelete,
}: {
  count: number;
  onAlign: InspectorProps['onAlign'];
  onDistribute: InspectorProps['onDistribute'];
  onUniformSize: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="multi-summary">
        <Layers size={22} />
        <div>
          <strong>{countLabel(count, ['блок', 'блока', 'блоков'])} выделено</strong>
          <span>Выравнивание и распределение</span>
        </div>
      </div>
      <section className="property-section">
        <div className="property-section-title">Выравнивание</div>
        <div className="align-grid">
          <button onClick={() => onAlign('left')} title="По левому краю">
            <AlignStartVertical size={18} />
            <span>Лево</span>
          </button>
          <button onClick={() => onAlign('center-x')} title="По центру">
            <AlignCenterVertical size={18} />
            <span>Центр</span>
          </button>
          <button onClick={() => onAlign('right')} title="По правому краю">
            <AlignEndVertical size={18} />
            <span>Право</span>
          </button>
          <button onClick={() => onAlign('top')} title="По верху">
            <AlignStartHorizontal size={18} />
            <span>Верх</span>
          </button>
          <button onClick={() => onAlign('middle-y')} title="По середине">
            <AlignCenterHorizontal size={18} />
            <span>Середина</span>
          </button>
          <button onClick={() => onAlign('bottom')} title="По низу">
            <AlignEndHorizontal size={18} />
            <span>Низ</span>
          </button>
        </div>
      </section>
      <section className="property-section">
        <div className="property-section-title">Распределение</div>
        <button className="subtle-button" onClick={() => onDistribute('horizontal')}>
          <Move size={14} />
          Равные промежутки по горизонтали
        </button>
        <button className="subtle-button" onClick={() => onDistribute('vertical')}>
          <Move size={14} />
          Равные промежутки по вертикали
        </button>
        <button className="subtle-button" onClick={onUniformSize}>
          <Maximize2 size={14} />
          Одинаковый размер блоков
        </button>
      </section>
      <div className="inspector-actions">
        <button className="button button-soft" onClick={onDuplicate}>
          <Copy size={15} />
          Дублировать
        </button>
        <button className="button button-danger-soft" onClick={onDelete}>
          <Trash2 size={15} />
          Удалить
        </button>
      </div>
    </>
  );
}

function DocumentPanel({
  diagram,
  issues,
  onAutoLayout,
  onSaveJson,
  onOpenCode,
  onShowIssues,
}: {
  diagram: Diagram;
  issues: ValidationIssue[];
  onAutoLayout: () => void;
  onSaveJson: () => void;
  onOpenCode: () => void;
  onShowIssues: () => void;
}) {
  const starts = diagram.nodes.filter((node) => node.kind === 'start').length;
  const decisions = diagram.nodes.filter(
    (node) => node.kind === 'decision',
  ).length;
  return (
    <>
      <div className="document-card">
        <div className="document-card-top">
          <div className="document-card-icon">
            <ShieldCheck size={22} />
          </div>
          <span className="document-card-badge">ГОСТ 19.701-90</span>
        </div>
        <strong>{diagram.title}</strong>
        <span>
          Схема алгоритма ·{' '}
          {countLabel(diagram.nodes.length, ['блок', 'блока', 'блоков'])} ·{' '}
          {countLabel(diagram.edges.length, ['связь', 'связи', 'связей'])}
        </span>
        <div className="document-stats">
          <div>
            <strong>{diagram.nodes.length}</strong>
            <span>блоков</span>
          </div>
          <div>
            <strong>{diagram.edges.length}</strong>
            <span>связей</span>
          </div>
          <div>
            <strong>{decisions}</strong>
            <span>условий</span>
          </div>
          <div>
            <strong>{starts}</strong>
            <span>вход</span>
          </div>
        </div>
      </div>

      <section className="property-section">
        <div className="property-section-title">Быстрые действия</div>
        <button className="quick-action" onClick={onAutoLayout}>
          <span className="quick-action-icon">
            <Sparkles size={17} />
          </span>
          <span>
            <strong>Упорядочить схему</strong>
            <small>Автоматически расставить блоки</small>
          </span>
        </button>
        <button className="quick-action" onClick={onOpenCode}>
          <span className="quick-action-icon">
            <Code2 size={17} />
          </span>
          <span>
            <strong>Код и схема</strong>
            <small>Генерация в обе стороны</small>
          </span>
        </button>
        <button className="quick-action" onClick={onSaveJson}>
          <span className="quick-action-icon">
            <Link2 size={17} />
          </span>
          <span>
            <strong>Сохранить проект</strong>
            <small>Файл .json для повторного открытия</small>
          </span>
        </button>
      </section>

      <section className="property-section">
        <div className="property-section-title">Соответствие</div>
        <button
          className={`validation-summary ${issues.length ? 'has-issues' : 'is-ok'}`}
          onClick={onShowIssues}
        >
          {issues.length ? (
            <AlertTriangle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>
            <strong>
              {issues.length
                ? countLabel(issues.length, [
                    'замечание',
                    'замечания',
                    'замечаний',
                  ])
                : 'Замечаний нет'}
            </strong>
            <small>
              {issues.length
                ? 'Откройте проверку и исправьте'
                : 'Схема готова к экспорту'}
            </small>
          </span>
        </button>
        <div className="gost-checks">
          <div>
            <CheckCircle2 size={14} />
            Толщина линий 1,7 px
          </div>
          <div>
            <CheckCircle2 size={14} />
            Скругления связей 10 px
          </div>
          <div>
            <CheckCircle2 size={14} />
            Сетка 20 px, шаг 10 px
          </div>
        </div>
      </section>

      <section className="property-section">
        <div className="property-section-title">Горячие клавиши</div>
        <div className="shortcut-list">
          <span>
            <kbd>V</kbd> выбор
          </span>
          <span>
            <kbd>C</kbd> связь
          </span>
          <span>
            <kbd>H</kbd> холст
          </span>
          <span>
            <kbd>Del</kbd> удалить
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> отменить
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>D</kbd> дублировать
          </span>
        </div>
      </section>
    </>
  );
}

function ValidationPanel({
  issues,
  onSelect,
}: {
  issues: ValidationIssue[];
  onSelect: (nodeIds?: string[], edgeIds?: string[]) => void;
}) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter(
    (issue) => issue.severity === 'warning',
  ).length;
  return (
    <>
      <div className="validation-head">
        <div className="validation-score">
          {errors === 0 && warnings === 0 ? (
            <CheckCircle2 size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
          <div>
            <strong>
              {errors === 0 && warnings === 0
                ? 'Всё в порядке'
                : 'Есть замечания'}
            </strong>
            <span>
              {countLabel(errors, ['ошибка', 'ошибки', 'ошибок'])} ·{' '}
              {countLabel(warnings, [
                'предупреждение',
                'предупреждения',
                'предупреждений',
              ])}
            </span>
          </div>
        </div>
      </div>
      <div className="issue-list">
        {issues.map((issue) => (
          <button
            key={issue.id}
            className={`issue-card severity-${issue.severity}`}
            onClick={() => onSelect(issue.nodeIds, issue.edgeIds)}
          >
            <SeverityIcon issue={issue} />
            <span>
              <strong>{issue.title}</strong>
              <small>{issue.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
