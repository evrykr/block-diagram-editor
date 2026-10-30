import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DiagramNode } from '../types/diagram';
import { ACCENT, FONT_FAMILY, NODE_FILL, NODE_STROKE } from '../constants/design';
import { nodePath } from '../lib/geometry';
import { layoutNodeText } from '../lib/text';

interface NodeViewProps {
  node: DiagramNode;
  selected: boolean;
  editing: boolean;
  dimmed?: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
  onDoubleClick?: () => void;
}

export function NodeView({
  node,
  selected,
  editing,
  dimmed,
  onPointerDown,
  onDoubleClick,
}: NodeViewProps) {
  const layout = layoutNodeText(node);
  const path = nodePath(node);
  const isConnector = node.kind === 'connector';
  const font = `${node.kind === 'decision' ? 500 : 450} ${layout.fontSize}px ${FONT_FAMILY}`;

  return (
    <g
      className={`node${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      data-node-id={node.id}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.();
      }}
      role="button"
      aria-label={node.text}
    >
      <title>{node.text}</title>
      {selected && (
        <path
          d={path}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.14}
          strokeWidth={8}
          strokeLinejoin="round"
        />
      )}
      <path
        d={path}
        fill={NODE_FILL}
        stroke={selected ? ACCENT : NODE_STROKE}
        strokeWidth={selected ? 2.1 : 1.7}
        strokeLinejoin="round"
        className="node-shape"
      />
      {node.kind === 'predefined' && (
        <>
          <path
            d={`M ${node.x + 16} ${node.y + 1.2} V ${node.y + node.height - 1.2}`}
            stroke={NODE_STROKE}
            strokeWidth={1.4}
          />
          <path
            d={`M ${node.x + node.width - 16} ${node.y + 1.2} V ${node.y + node.height - 1.2}`}
            stroke={NODE_STROKE}
            strokeWidth={1.4}
          />
        </>
      )}
      {!editing && (
        <text
          x={layout.textX}
          textAnchor={layout.align === 'center' ? 'middle' : 'start'}
          fontFamily={FONT_FAMILY}
          fontSize={layout.fontSize}
          fontWeight={node.kind === 'decision' ? 500 : 450}
          fill="#1b2531"
          className="node-label"
          dominantBaseline="central"
          style={{ font }}
        >
          {layout.lines.map((line, index) => (
            <tspan
              key={`${node.id}-line-${index}`}
              x={layout.textX}
              y={layout.firstLineY + index * layout.lineHeight}
            >
              {line || ' '}
            </tspan>
          ))}
        </text>
      )}
      {isConnector && !node.text.trim() && (
        <text
          x={node.x + node.width / 2}
          y={node.y + node.height / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fill="#94a3b8"
        >
          A
        </text>
      )}
    </g>
  );
}
