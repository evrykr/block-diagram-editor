import type { NodeKind } from '../types/diagram';

interface ShapeGlyphProps {
  kind: NodeKind;
  size?: number;
}

export function ShapeGlyph({ kind, size = 38 }: ShapeGlyphProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  const body = () => {
    switch (kind) {
      case 'start':
      case 'end':
        return <rect x="5" y="8" width="38" height="16" rx="8" {...common} />;
      case 'process':
        return <rect x="6" y="7" width="36" height="18" rx="1.5" {...common} />;
      case 'decision':
        return <path d="M24 3.5 44 16 24 28.5 4 16Z" {...common} />;
      case 'io':
        return <path d="M11 7h33L37 25H4Z" {...common} />;
      case 'predefined':
        return (
          <g>
            <rect x="5" y="7" width="38" height="18" rx="1.5" {...common} />
            <path d="M12 7v18M36 7v18" {...common} />
          </g>
        );
      case 'document':
        return (
          <path
            d="M6 6h36v15c-5-3-7 4-12 1-5-3-7 3-12 0-4-2-8 2-12 0Z"
            {...common}
          />
        );
      case 'preparation':
        return <path d="M12 6h24l8 10-8 10H12L4 16Z" {...common} />;
      case 'manual':
        return <path d="M4 7h40l-5 18H9Z" {...common} />;
      case 'delay':
        return <path d="M5 7h27a9 9 0 0 1 0 18H5Z" {...common} />;
      case 'connector':
        return <circle cx="24" cy="16" r="11" {...common} />;
      case 'comment':
        return (
          <path
            d="M13 6h31v20H13v-5H5V11h8Z"
            {...common}
          />
        );
    }
  };
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 48 32"
      aria-hidden="true"
      className="shape-glyph"
    >
      {body()}
    </svg>
  );
}
