import { useEffect, useState } from 'react';
import {
  Braces,
  Check,
  Download,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import type { Diagram } from '../types/diagram';
import {
  exportDiagram,
  safeFilename,
  type ExportFormat,
} from '../lib/export';
import { DiagramPreview } from './DiagramPreview';

interface ExportDialogProps {
  open: boolean;
  diagram: Diagram;
  onClose: () => void;
  onExported: (message: string) => void;
}

const FORMATS: {
  id: ExportFormat;
  title: string;
  description: string;
  extension: string;
  icon: typeof ImageIcon;
  accent: string;
}[] = [
  {
    id: 'png',
    title: 'PNG',
    description: 'Растровое изображение для вставки',
    extension: 'png',
    icon: ImageIcon,
    accent: 'blue',
  },
  {
    id: 'svg',
    title: 'SVG',
    description: 'Векторный формат без потерь',
    extension: 'svg',
    icon: FileCode2,
    accent: 'violet',
  },
  {
    id: 'pdf',
    title: 'PDF',
    description: 'Страница A4 для печати',
    extension: 'pdf',
    icon: FileText,
    accent: 'rose',
  },
  {
    id: 'json',
    title: 'JSON',
    description: 'Проект для повторного открытия',
    extension: 'json',
    icon: Braces,
    accent: 'amber',
  },
];

export function ExportDialog({
  open,
  diagram,
  onClose,
  onExported,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [filename, setFilename] = useState(safeFilename(diagram.title));
  const [background, setBackground] = useState(true);
  const [scale, setScale] = useState(2);
  const [padding, setPadding] = useState(48);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilename(safeFilename(diagram.title));
    setError(null);
    setDone(false);
  }, [diagram.title, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, onClose, open]);

  if (!open) return null;

  const meta = FORMATS.find((item) => item.id === format)!;
  const extension = meta.extension;

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await exportDiagram(diagram, {
        format,
        padding,
        scale,
        background,
        filename: filename.trim() || safeFilename(diagram.title),
      });
      setDone(true);
      onExported(`Файл ${safeFilename(filename || diagram.title)}.${extension} сохранён`);
      window.setTimeout(() => {
        setBusy(false);
        onClose();
      }, 520);
    } catch (reason) {
      setBusy(false);
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось выполнить экспорт.',
      );
    }
  };

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="export-dialog" role="dialog" aria-modal="true" aria-label="Экспорт схемы">
        <div className="export-header">
          <div className="export-title">
            <span className="export-icon">
              <Download size={20} />
            </span>
            <div>
              <strong>Экспорт блок-схемы</strong>
              <span>Готовый файл по ГОСТ 19.701-90</span>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="export-body">
          <div className="export-controls">
            <div className="export-section-label">Формат</div>
            <div className="format-grid">
              {FORMATS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`format-card${format === item.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setFormat(item.id);
                      setError(null);
                      setDone(false);
                    }}
                  >
                    <span className={`format-icon ${item.accent}`}>
                      <Icon size={19} />
                    </span>
                    <span className="format-copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="format-radio">
                      {format === item.id && <span />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="export-section-label">Параметры</div>
            <label className="export-field">
              <span>Имя файла</span>
              <div className="filename-input">
                <input
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  spellCheck={false}
                />
                <span>.{extension}</span>
              </div>
            </label>

            {(format === 'png' || format === 'svg') && (
              <label className="switch-row export-switch">
                <span>
                  <strong>Белая подложка</strong>
                  <small>Снимите галочку для прозрачного фона</small>
                </span>
                <input
                  type="checkbox"
                  checked={background}
                  onChange={(event) => setBackground(event.target.checked)}
                />
              </label>
            )}

            {(format === 'png' || format === 'pdf') && (
              <label className="export-field">
                <span>Качество</span>
                <select
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                >
                  <option value={1.5}>1,5× — быстрый</option>
                  <option value={2}>2× — рекомендуется</option>
                  <option value={3}>3× — высокое</option>
                  <option value={4}>4× — печать</option>
                </select>
              </label>
            )}

            <label className="export-field">
              <span>Отступы</span>
              <select
                value={padding}
                onChange={(event) => setPadding(Number(event.target.value))}
              >
                <option value={24}>Минимальные · 24 px</option>
                <option value={48}>Стандартные · 48 px</option>
                <option value={72}>Широкие · 72 px</option>
              </select>
            </label>
          </div>

          <div className="export-preview-column">
            <div className="export-preview-head">
              <span>Предпросмотр</span>
              <span className="preview-format-pill">{meta.title}</span>
            </div>
            <div className="export-preview">
              <DiagramPreview diagram={diagram} />
            </div>
            <div className="export-file-summary">
              <div>
                <span>Блоков</span>
                <strong>{diagram.nodes.length}</strong>
              </div>
              <div>
                <span>Связей</span>
                <strong>{diagram.edges.length}</strong>
              </div>
              <div>
                <span>Размер</span>
                <strong>
                  {format === 'pdf'
                    ? 'A4'
                    : format === 'json'
                      ? 'проект'
                      : format === 'svg'
                        ? 'вектор'
                        : `${scale}×`}
                </strong>
              </div>
            </div>
            <div className="export-note">
              <Check size={13} />
              {format === 'json'
                ? 'Файл можно открыть в редакторе через «Открыть JSON».'
                : 'Схема экспортируется без интерфейса и служебных элементов.'}
            </div>
          </div>
        </div>

        {error && <div className="export-error">{error}</div>}

        <div className="export-footer">
          <span className="export-footer-hint">
            {format === 'pdf'
              ? 'PDF будет вписан в страницу A4 с сохранением пропорций.'
              : format === 'svg'
                ? 'SVG остаётся редактируемым в векторных редакторах.'
                : format === 'json'
                  ? 'JSON хранит все блоки, связи и позиции.'
                  : `Изображение ${scale}× с четкими линиями.`}
          </span>
          <div className="footer-actions">
            <button className="button button-ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button
              className="button button-primary"
              onClick={handleExport}
              disabled={busy || diagram.nodes.length === 0}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : done ? (
                <Check size={16} />
              ) : (
                <Download size={16} />
              )}
              {busy
                ? 'Готовим файл…'
                : done
                  ? 'Готово'
                  : `Скачать ${meta.title}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
