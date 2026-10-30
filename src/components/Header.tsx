import { useEffect, useRef, useState } from 'react';
import { countLabel } from '../lib/plural';
import {
  Code2,
  Download,
  FileJson2,
  FilePlus2,
  FolderOpen,
  Info,
  Keyboard,
  MoreHorizontal,
  Redo2,
  Undo2,
} from 'lucide-react';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenCode: () => void;
  onExport: () => void;
  onNew: () => void;
  onImport: () => void;
  onSaveJson: () => void;
  onOpenHelp: () => void;
  nodeCount: number;
}

export function Header({
  title,
  onTitleChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenCode,
  onExport,
  onNew,
  onImport,
  onSaveJson,
  onOpenHelp,
  nodeCount,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [menuOpen]);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="25" height="25">
            <rect x="9" y="4.5" width="14" height="6" rx="3" fill="#fff" />
            <rect x="4" y="14" width="10" height="6" rx="1.2" fill="#fff" opacity=".92" />
            <rect x="18" y="14" width="10" height="6" rx="1.2" fill="#fff" opacity=".92" />
            <rect x="12" y="22.5" width="8" height="5" rx="2.5" fill="#fff" />
            <path
              d="M16 11v3M9 17h14M16 20v2.5"
              stroke="#fff"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity=".75"
            />
          </svg>
        </div>
        <div className="brand-copy">
          <div className="brand-title">СхемоГОСТ</div>
          <div className="brand-subtitle">редактор блок-схем</div>
        </div>
      </div>

      <div className="header-separator" />

      <div className="document-block">
        <div className="document-title-row">
          <input
            className="document-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            spellCheck={false}
            aria-label="Название схемы"
          />
          <span className="gost-badge">ГОСТ 19.701-90</span>
        </div>
        <div className="document-meta">
          <span className="save-state">
            <span className="save-dot" />
            Автосохранение
          </span>
          <span className="meta-dot">·</span>
          <span>{countLabel(nodeCount, ['блок', 'блока', 'блоков'])}</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="history-group">
          <button
            className="icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить"
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Вернуть (Ctrl+Y)"
            aria-label="Вернуть"
          >
            <Redo2 size={18} />
          </button>
        </div>
        <button className="button button-ghost code-button" onClick={onOpenCode}>
          <Code2 size={17} />
          <span>Код</span>
        </button>
        <button className="button button-primary" onClick={onExport}>
          <Download size={17} />
          <span>Экспорт</span>
        </button>
        <div className="more-wrap" ref={menuRef}>
          <button
            className="icon-button more-button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Дополнительно"
            title="Файл и справка"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="popover-menu">
              <div className="popover-heading">Файл</div>
              <button
                className="menu-item"
                onClick={() => {
                  onNew();
                  setMenuOpen(false);
                }}
              >
                <FilePlus2 size={16} />
                <span>Новая схема</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  onImport();
                  setMenuOpen(false);
                }}
              >
                <FolderOpen size={16} />
                <span>Открыть JSON</span>
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  onSaveJson();
                  setMenuOpen(false);
                }}
              >
                <FileJson2 size={16} />
                <span>Сохранить JSON</span>
              </button>
              <div className="menu-divider" />
              <div className="popover-heading">Справка</div>
              <button
                className="menu-item"
                onClick={() => {
                  onOpenHelp();
                  setMenuOpen(false);
                }}
              >
                <Keyboard size={16} />
                <span>Горячие клавиши</span>
              </button>
              <button
                className="menu-item menu-item-muted"
                onClick={() => {
                  onOpenHelp();
                  setMenuOpen(false);
                }}
              >
                <Info size={16} />
                <span>О редакторе</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
