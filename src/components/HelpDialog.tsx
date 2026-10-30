import { useEffect } from 'react';
import {
  CheckCircle2,
  Code2,
  Download,
  Grid3X3,
  Keyboard,
  ShieldCheck,
  X,
} from 'lucide-react';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['V'], label: 'Инструмент выбора' },
  { keys: ['C'], label: 'Инструмент связи' },
  { keys: ['H'], label: 'Перемещение холста' },
  { keys: ['Space'], label: 'Временное перемещение холста' },
  { keys: ['Del', 'Backspace'], label: 'Удалить выделенное' },
  { keys: ['Ctrl', 'D'], label: 'Дублировать блоки' },
  { keys: ['Ctrl', 'Z'], label: 'Отменить действие' },
  { keys: ['Ctrl', 'Y'], label: 'Вернуть действие' },
  { keys: ['Ctrl', 'S'], label: 'Сохранить JSON' },
  { keys: ['Ctrl', 'E'], label: 'Открыть экспорт' },
  { keys: ['Ctrl', 'G'], label: 'Код и схема' },
  { keys: ['Двойной клик'], label: 'Редактировать текст блока' },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="help-dialog" role="dialog" aria-modal="true" aria-label="Справка">
        <div className="help-header">
          <div className="help-brand">
            <div className="brand-mark help-mark">
              <svg viewBox="0 0 32 32" width="26" height="26">
                <rect x="9" y="4.5" width="14" height="6" rx="3" fill="#fff" />
                <rect x="4" y="14" width="10" height="6" rx="1.2" fill="#fff" opacity=".92" />
                <rect x="18" y="14" width="10" height="6" rx="1.2" fill="#fff" opacity=".92" />
                <rect x="12" y="22.5" width="8" height="5" rx="2.5" fill="#fff" />
              </svg>
            </div>
            <div>
              <strong>СхемоГОСТ</strong>
              <span>Редактор блок-схем · версия 1.0</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="help-body">
          <div className="help-intro">
            <h2>Блок-схемы, которые не стыдно сдать</h2>
            <p>
              Фигуры, пропорции и правила оформления соответствуют
              ГОСТ 19.701-90. Схема строится по сетке, связи остаются
              ортогональными, а блоки выравниваются в один клик.
            </p>
            <div className="help-badges">
              <span>
                <ShieldCheck size={14} /> ГОСТ 19.701-90
              </span>
              <span>
                <Grid3X3 size={14} /> Сетка 20 px
              </span>
              <span>
                <Download size={14} /> PNG · SVG · PDF
              </span>
            </div>
          </div>

          <div className="help-columns">
            <section>
              <div className="help-section-title">
                <Keyboard size={16} />
                Горячие клавиши
              </div>
              <div className="shortcut-table">
                {SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.label} className="shortcut-row">
                    <span>{shortcut.label}</span>
                    <span className="keys">
                      {shortcut.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="help-section-title">
                <Code2 size={16} />
                Генерация кода
              </div>
              <p className="help-text">
                Вставьте алгоритм на Python, Pascal, C++ или C# — редактор
                распознает условия, циклы, ввод и вывод и соберёт аккуратную
                блок-схему. Обратная генерация восстанавливает структуру
                программы по связям схемы.
              </p>
              <ul className="help-list">
                <li>
                  <CheckCircle2 size={15} />
                  Поддержка if / else, while, for, do…while
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  Распознавание ввода-вывода и функций
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  Автоматическая раскладка без пересечений
                </li>
              </ul>
              <div className="help-note">
                Сложные конструкции (try/catch, классы) показываются
                упрощённо. Для точной схемы используйте основные
                управляющие конструкции.
              </div>
            </section>
          </div>
        </div>
        <div className="help-footer">
          <span>Все вычисления выполняются в браузере — данные не отправляются на сервер.</span>
          <button className="button button-primary" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
