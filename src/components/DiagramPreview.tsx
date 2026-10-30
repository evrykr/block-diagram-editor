import type { Diagram } from '../types/diagram';
import { diagramContentBounds } from '../lib/geometry';
import { EdgeView } from './EdgeView';
import { NodeView } from './NodeView';

interface DiagramPreviewProps {
  diagram: Diagram;
  className?: string;
}

export function DiagramPreview({ diagram, className }: DiagramPreviewProps) {
  if (diagram.nodes.length === 0) {
    return (
      <div className={`diagram-preview-empty ${className ?? ''}`}>
        <span>Схема пока пуста</span>
      </div>
    );
  }
  const bounds = diagramContentBounds(diagram, 56);
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  return (
    <div className={`diagram-preview ${className ?? ''}`}>
      <svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="preview-svg"
        aria-label={diagram.title}
      >
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
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="#344052" />
          </marker>
        </defs>
        {diagram.edges.map((edge) => {
          const from = nodes.get(edge.from);
          const to = nodes.get(edge.to);
          if (!from || !to) return null;
          return (
            <g key={edge.id}>
              <EdgeView
                edge={edge}
                from={from}
                to={to}
                selected={false}
                zoom={1}
              />
            </g>
          );
        })}
        {diagram.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            selected={false}
            editing={false}
          />
        ))}
      </svg>
    </div>
  );
}
