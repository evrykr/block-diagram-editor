import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Play,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { Diagram, Language } from '../types/diagram';
import { CODE_EXAMPLES, CODE_LANGUAGE_META } from '../data/examples';
import { parseSource } from '../lib/code';
import { astToDiagram, type ConversionResult } from '../lib/code/toDiagram';
import { CodeParseError } from '../lib/code/types';
import { diagramToCode, type GeneratedCode } from '../lib/codegen';
import { downloadText } from '../lib/export';
import { countLabel } from '../lib/plural';
import { DiagramPreview } from './DiagramPreview';

interface CodeStudioProps {
  open: boolean;
  diagram: Diagram;
  onClose: () => void;
  onApplyDiagram: (diagram: Diagram) => void;
}

type StudioMode = 'code-to-diagram' | 'diagram-to-code';

const LANGUAGES: Language[] = ['python', 'pascal', 'cpp', 'csharp'];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const KEYWORDS: Record<Language, string[]> = {
  python: [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from',
    'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
    'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
    'print', 'input', 'range', 'len', 'int', 'float', 'str', 'bool', 'sum',
  ],
  pascal: [
    'and', 'array', 'begin', 'case', 'const', 'do', 'downto', 'else', 'end',
    'for', 'function', 'if', 'in', 'of', 'or', 'procedure', 'program',
    'read', 'readln', 'repeat', 'then', 'to', 'type', 'until', 'var', 'while',
    'write', 'writeln', 'div', 'mod', 'not', 'nil', 'true', 'false',
  ],
  cpp: [
    'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const',
    'continue', 'cout', 'cin', 'default', 'delete', 'do', 'double', 'else',
    'endl', 'false', 'float', 'for', 'if', 'include', 'int', 'long',
    'namespace', 'new', 'nullptr', 'private', 'protected', 'public',
    'return', 'short', 'static', 'std', 'string', 'struct', 'switch', 'throw',
    'true', 'try', 'using', 'void', 'while',
  ],
  csharp: [
    'bool', 'break', 'case', 'catch', 'class', 'Console', 'const', 'continue',
    'default', 'do', 'double', 'else', 'false', 'finally', 'for', 'foreach',
    'if', 'in', 'int', 'long', 'namespace', 'new', 'null', 'private',
    'protected', 'public', 'readonly', 'return', 'static', 'string', 'switch',
    'throw', 'true', 'try', 'using', 'var', 'void', 'while',
  ],
};

function highlightCode(code: string, language: Language): string {
  const keywords = [...KEYWORDS[language]]
    .sort((a, b) => b.length - a.length)
    .join('|');
  const comment =
    language === 'python'
      ? '#[^\\n]*'
      : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  const string = `"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'`;
  const regex = new RegExp(
    `(${comment})|(${string})|\\b(${keywords})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`,
    'g',
  );
  let result = '';
  let lastIndex = 0;
  for (const match of code.matchAll(regex)) {
    const index = match.index ?? 0;
    result += escapeHtml(code.slice(lastIndex, index));
    const value = match[0];
    if (match[1]) {
      result += `<span class="tok-comment">${escapeHtml(value)}</span>`;
    } else if (match[2]) {
      result += `<span class="tok-string">${escapeHtml(value)}</span>`;
    } else if (match[3]) {
      result += `<span class="tok-keyword">${escapeHtml(value)}</span>`;
    } else {
      result += `<span class="tok-number">${escapeHtml(value)}</span>`;
    }
    lastIndex = index + value.length;
  }
  result += escapeHtml(code.slice(lastIndex));
  return result;
}

function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  language: Language;
  readOnly?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lineCount = Math.max(1, value.split('\n').length);
  const highlighted = highlightCode(value, language);

  const syncScroll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (preRef.current) {
      preRef.current.scrollTop = textarea.scrollTop;
      preRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = textarea.scrollTop;
    }
  };

  return (
    <div className={`code-editor${readOnly ? ' is-readonly' : ''}`}>
      <div className="code-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      <div className="code-body">
        {readOnly ? (
          <pre
            className="code-readonly-surface"
            onScroll={(event) => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }
            }}
            aria-label="Сгенерированный код"
          >
            <code dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
          </pre>
        ) : (
          <>
            <pre
              className="code-highlight"
              ref={preRef}
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: `${highlighted}\n`,
              }}
            />
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              onScroll={syncScroll}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Исходный код"
            />
          </>
        )}
      </div>
    </div>
  );
}

export function CodeStudio({
  open,
  diagram,
  onClose,
  onApplyDiagram,
}: CodeStudioProps) {
  const [mode, setMode] = useState<StudioMode>('code-to-diagram');
  const [language, setLanguage] = useState<Language>('python');
  const [sources, setSources] = useState<Record<Language, string>>({
    python: CODE_EXAMPLES.python.code,
    pascal: CODE_EXAMPLES.pascal.code,
    cpp: CODE_EXAMPLES.cpp.code,
    csharp: CODE_EXAMPLES.csharp.code,
  });
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [parseError, setParseError] = useState<{
    message: string;
    line?: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const source = sources[language];

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || mode !== 'code-to-diagram') return;
    const timer = window.setTimeout(() => {
      try {
        const program = parseSource(source, language);
        const converted = astToDiagram(program);
        setResult(converted);
        setParseError(null);
      } catch (error) {
        setResult(null);
        if (error instanceof CodeParseError) {
          setParseError({ message: error.message, line: error.line });
        } else if (error instanceof Error) {
          setParseError({ message: error.message });
        } else {
          setParseError({ message: 'Не удалось разобрать код.' });
        }
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [language, mode, open, source]);

  const generated = useMemo<GeneratedCode | null>(() => {
    if (mode !== 'diagram-to-code') return null;
    try {
      return diagramToCode(diagram, language);
    } catch (error) {
      return {
        code:
          error instanceof Error
            ? `// ${error.message}`
            : '// Не удалось сгенерировать код',
        language,
        warnings: [],
        statements: 0,
        decisions: 0,
        loops: 0,
      };
    }
  }, [diagram, language, mode]);

  const previewDiagram =
    mode === 'code-to-diagram' ? result?.diagram ?? null : diagram;
  const stats =
    mode === 'code-to-diagram'
      ? result?.stats
      : {
          nodes: diagram.nodes.length,
          edges: diagram.edges.length,
          decisions: generated?.decisions ?? 0,
          loops: generated?.loops ?? 0,
        };
  const warnings =
    mode === 'code-to-diagram'
      ? result?.warnings ?? []
      : generated?.warnings ?? [];

  if (!open) return null;

  const updateSource = (value: string) => {
    setSources((previous) => ({ ...previous, [language]: value }));
  };

  const copyGenerated = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      downloadText(generated.code, 'flowchart.txt');
    }
  };

  return (
    <div
      className="modal-backdrop studio-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="studio" role="dialog" aria-modal="true" aria-label="Код и схема">
        <div className="studio-header">
          <div className="studio-brand">
            <span className="studio-brand-icon">
              <FileCode2 size={20} />
            </span>
            <div>
              <strong>Код и схема</strong>
              <span>Двусторонняя генерация</span>
            </div>
          </div>

          <div className="mode-switch" role="tablist">
            <button
              className={mode === 'code-to-diagram' ? 'is-active' : ''}
              onClick={() => setMode('code-to-diagram')}
            >
              <Wand2 size={15} />
              Код → схема
            </button>
            <button
              className={mode === 'diagram-to-code' ? 'is-active' : ''}
              onClick={() => setMode('diagram-to-code')}
            >
              <Code2 size={15} />
              Схема → код
            </button>
          </div>

          <button className="icon-button studio-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="language-bar">
          <div className="language-tabs">
            {LANGUAGES.map((item) => {
              const meta = CODE_LANGUAGE_META[item];
              return (
                <button
                  key={item}
                  className={`language-tab${language === item ? ' is-active' : ''}`}
                  onClick={() => setLanguage(item)}
                >
                  <span
                    className="language-dot"
                    style={{ background: meta.color }}
                  />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <div className="language-meta">
            {mode === 'code-to-diagram' ? (
              <>
                <span className="language-hint">
                  Разбор структуры и построение схемы
                </span>
                <button
                  className="button button-ghost button-compact"
                  onClick={() => {
                    updateSource(CODE_EXAMPLES[language].code);
                    setParseError(null);
                  }}
                >
                  <Sparkles size={14} />
                  Пример
                </button>
              </>
            ) : (
              <>
                <span className="language-hint">
                  Язык генерации из текущей схемы
                </span>
                <button
                  className="button button-ghost button-compact"
                  onClick={copyGenerated}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
                <button
                  className="button button-ghost button-compact"
                  onClick={() =>
                    generated &&
                    downloadText(
                      generated.code,
                      `flowchart.${CODE_LANGUAGE_META[language].extension}`,
                    )
                  }
                >
                  <Download size={14} />
                  Скачать
                </button>
              </>
            )}
          </div>
        </div>

        <div className="studio-body">
          <div className={`studio-pane code-pane${mode === 'diagram-to-code' ? ' generated-pane' : ''}`}>
            <div className="pane-heading">
              <div className="pane-title">
                <span className={`pane-icon ${mode === 'code-to-diagram' ? 'blue' : 'green'}`}>
                  {mode === 'code-to-diagram' ? (
                    <Code2 size={16} />
                  ) : (
                    <FileCode2 size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {mode === 'code-to-diagram'
                      ? 'Исходный код'
                      : 'Сгенерированный код'}
                  </strong>
                  <span>
                    {CODE_LANGUAGE_META[language].label} ·{' '}
                    {mode === 'code-to-diagram'
                      ? countLabel(source.split('\n').length, [
                          'строка',
                          'строки',
                          'строк',
                        ])
                      : countLabel(generated?.statements ?? 0, [
                          'оператор',
                          'оператора',
                          'операторов',
                        ])}
                  </span>
                </div>
              </div>
              {mode === 'code-to-diagram' ? (
                <div className="pane-status">
                  {parseError ? (
                    <span className="status-badge status-error">
                      <AlertTriangle size={13} />
                      Ошибка
                    </span>
                  ) : (
                    <span className="status-badge status-ok">
                      <Check size={13} />
                      Разобрано
                    </span>
                  )}
                </div>
              ) : (
                <span className="pane-status meta-pill">готово</span>
              )}
            </div>
            <div className="editor-shell">
              <CodeEditor
                value={
                  mode === 'code-to-diagram'
                    ? source
                    : generated?.code ?? ''
                }
                onChange={
                  mode === 'code-to-diagram' ? updateSource : undefined
                }
                language={language}
                readOnly={mode === 'diagram-to-code'}
              />
            </div>
            {parseError && mode === 'code-to-diagram' && (
              <div className="parse-error">
                <AlertTriangle size={17} />
                <div>
                  <strong>Не удалось построить схему</strong>
                  <span>
                    {parseError.line ? `Строка ${parseError.line}. ` : ''}
                    {parseError.message}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="studio-pane preview-pane">
            <div className="pane-heading">
              <div className="pane-title">
                <span className="pane-icon violet">
                  {mode === 'code-to-diagram' ? (
                    <Wand2 size={16} />
                  ) : (
                    <ArrowLeft size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {mode === 'code-to-diagram'
                      ? 'Предпросмотр схемы'
                      : 'Текущая схема'}
                  </strong>
                  <span>
                    {stats
                      ? `${countLabel(stats.nodes, ['блок', 'блока', 'блоков'])} · ${countLabel(stats.edges, ['связь', 'связи', 'связей'])}`
                      : 'Ожидание кода'}
                  </span>
                </div>
              </div>
              {stats && (
                <div className="preview-stats">
                  <span>
                    {countLabel(stats.decisions, [
                      'условие',
                      'условия',
                      'условий',
                    ])}
                  </span>
                  <span>
                    {countLabel(stats.loops, ['цикл', 'цикла', 'циклов'])}
                  </span>
                </div>
              )}
            </div>
            <div className="preview-canvas">
              {previewDiagram ? (
                <DiagramPreview diagram={previewDiagram} />
              ) : (
                <div className="preview-empty">
                  <div className="preview-empty-icon">
                    <Play size={22} />
                  </div>
                  <strong>
                    {parseError ? 'Нужно исправить код' : 'Здесь появится схема'}
                  </strong>
                  <span>
                    {parseError
                      ? 'Проверьте подсвеченную ошибку и попробуйте снова.'
                      : 'Введите алгоритм слева — схема соберётся автоматически.'}
                  </span>
                </div>
              )}
              {previewDiagram && (
                <div className="preview-legend">
                  <span>
                    <i className="legend-dot blue" />
                    ГОСТ 19.701-90
                  </span>
                  <span>Автоматическая раскладка</span>
                </div>
              )}
            </div>
            {warnings.length > 0 && (
              <div className="warnings-strip">
                <AlertTriangle size={14} />
                <span>
                  {warnings.length === 1
                    ? warnings[0]
                    : `${warnings[0]} Ещё ${warnings.length - 1}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="studio-footer">
          <div className="footer-note">
            <span className="secure-dot" />
            Код обрабатывается локально в браузере
          </div>
          <div className="footer-actions">
            <button className="button button-ghost" onClick={onClose}>
              Отмена
            </button>
            {mode === 'code-to-diagram' ? (
              <button
                className="button button-primary"
                disabled={!result}
                onClick={() => {
                  if (result) onApplyDiagram(result.diagram);
                }}
              >
                Открыть в редакторе
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="button button-primary" onClick={copyGenerated}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Скопировано' : 'Скопировать код'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
