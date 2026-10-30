import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Hand,
  Magnet,
  MousePointer2,
  Sparkles,
  Spline,
} from 'lucide-react';
import type { Tool } from '../types/diagram';

interface CanvasToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  snap: boolean;
  onSnapChange: (value: boolean) => void;
  selectionCount: number;
  onAlign: (
    alignment:
      | 'left'
      | 'center-x'
      | 'right'
      | 'top'
      | 'middle-y'
      | 'bottom',
  ) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onAutoLayout: () => void;
}

function TipButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`tool-button${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-tip={label}
    >
      {children}
    </button>
  );
}

export function CanvasToolbar({
  tool,
  onToolChange,
  snap,
  onSnapChange,
  selectionCount,
  onAlign,
  onDistribute,
  onAutoLayout,
}: CanvasToolbarProps) {
  const multi = selectionCount > 1;
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Инструменты схемы">
      <div className="tool-group">
        <TipButton
          label="Выбор и перемещение (V)"
          onClick={() => onToolChange('select')}
          active={tool === 'select'}
        >
          <MousePointer2 size={18} />
        </TipButton>
        <TipButton
          label="Соединить блоки (C)"
          onClick={() => onToolChange('connect')}
          active={tool === 'connect'}
        >
          <Spline size={18} />
        </TipButton>
        <TipButton
          label="Перемещение холста (H)"
          onClick={() => onToolChange('hand')}
          active={tool === 'hand'}
        >
          <Hand size={18} />
        </TipButton>
      </div>

      <div className="tool-separator" />

      <button
        className="tool-button tool-button-wide"
        onClick={onAutoLayout}
        title="Упорядочить схему"
        data-tip="Упорядочить схему"
      >
        <Sparkles size={17} />
        <span>Упорядочить</span>
      </button>

      {multi && (
        <>
          <div className="tool-separator" />
          <div className="tool-group">
            <TipButton
              label="Выровнять по левому краю"
              onClick={() => onAlign('left')}
            >
              <AlignStartVertical size={17} />
            </TipButton>
            <TipButton
              label="Выровнять по центру"
              onClick={() => onAlign('center-x')}
            >
              <AlignCenterVertical size={17} />
            </TipButton>
            <TipButton
              label="Выровнять по правому краю"
              onClick={() => onAlign('right')}
            >
              <AlignEndVertical size={17} />
            </TipButton>
            <TipButton
              label="Выровнять по верху"
              onClick={() => onAlign('top')}
            >
              <AlignStartHorizontal size={17} />
            </TipButton>
            <TipButton
              label="Выровнять по середине"
              onClick={() => onAlign('middle-y')}
            >
              <AlignCenterHorizontal size={17} />
            </TipButton>
            <TipButton
              label="Выровнять по низу"
              onClick={() => onAlign('bottom')}
            >
              <AlignEndHorizontal size={17} />
            </TipButton>
            <div className="mini-divider" />
            <TipButton
              label="Распределить по горизонтали"
              onClick={() => onDistribute('horizontal')}
              disabled={selectionCount < 3}
            >
              <AlignHorizontalSpaceAround size={17} />
            </TipButton>
            <TipButton
              label="Распределить по вертикали"
              onClick={() => onDistribute('vertical')}
              disabled={selectionCount < 3}
            >
              <AlignVerticalSpaceAround size={17} />
            </TipButton>
          </div>
        </>
      )}

      <div className="tool-separator" />

      <TipButton
        label={snap ? 'Привязка к сетке включена' : 'Привязка к сетке выключена'}
        onClick={() => onSnapChange(!snap)}
        active={snap}
      >
        <Magnet size={18} />
      </TipButton>
      {multi && <span className="selection-pill">{selectionCount}</span>}
    </div>
  );
}
