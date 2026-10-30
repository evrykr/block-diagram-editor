import type { DiagramEdge, DiagramNode } from '../types/diagram';
import { ACCENT, EDGE_COLOR, FONT_FAMILY } from '../constants/design';
import { edgePoints, pointOnPolyline, roundedPath } from '../lib/geometry';
import { measureLabel } from '../lib/text';

interface EdgeViewProps {
  edge: DiagramEdge;
  from: DiagramNode;
  to: DiagramNode;
  selected: boolean;
  zoom: number;
  onPointerDown?: (event: React.PointerEvent) => void;
}

export function EdgeView({
  edge,
  from,
  to,
  selected,
  zoom,
  onPointerDown,
}: EdgeViewProps) {
  const geometry = edgePoints(edge, from, to);
  const path = roundedPath(geometry.points, 10);
  if (!path) return null;
  const ratio = edge.label ? (edge.branch ? 0.24 : 0.5) : 0.5;
  const labelPoint = pointOnPolyline(geometry.points, ratio);
  const labelWidth = edge.label ? measureLabel(edge.label, 11.5, 600) + 14 : 0;
  const color = selected ? ACCENT : EDGE_COLOR;

  return (
    <g className={`edge${selected ? ' is-selected' : ''}`}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={edge.dashed ? '7 5' : undefined}
        markerEnd={`url(#arrow${selected ? '-selected' : ''})`}
        pointerEvents="none"
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(12, 18 / zoom)}
        pointerEvents="stroke"
        onPointerDown={onPointerDown}
        style={{ cursor: 'pointer' }}
      >
        <title>{edge.label ? `Связь: ${edge.label}` : 'Связь'}</title>
      </path>
      {edge.label && (
        <g pointerEvents="none" className="edge-label">
          <rect
            x={labelPoint.x - labelWidth / 2}
            y={labelPoint.y - 20}
            width={labelWidth}
            height={19}
            rx={5}
            fill="#ffffff"
            stroke={selected ? '#bcd2fb' : '#e2e8f0'}
            strokeWidth={1}
          />
          <text
            x={labelPoint.x}
            y={labelPoint.y - 7}
            textAnchor="middle"
            fontFamily={FONT_FAMILY}
            fontSize={11.5}
            fontWeight={600}
            fill={selected ? '#174ea6' : '#475569'}
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}
