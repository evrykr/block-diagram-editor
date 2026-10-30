import { useMemo, useState } from 'react';
import { Search, Shapes, X } from 'lucide-react';
import { CATEGORIES, PALETTE_DEFINITIONS } from '../constants/design';
import type { NodeKind } from '../types/diagram';
import { ShapeGlyph } from './ShapeGlyph';

interface PaletteProps {
  onAdd: (kind: NodeKind) => void;
}

export function Palette({ onAdd }: PaletteProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return PALETTE_DEFINITIONS;
    return PALETTE_DEFINITIONS.filter(
      (definition) =>
        definition.label.toLowerCase().includes(normalized) ||
        definition.description.toLowerCase().includes(normalized) ||
        definition.gost.toLowerCase().includes(normalized),
    );
  }, [query]);

  return (
    <aside className="palette">
      <div className="palette-head">
        <div className="palette-title-row">
          <div className="palette-title">
            <Shapes size={17} />
            <span>Фигуры</span>
          </div>
          <span className="palette-count">{PALETTE_DEFINITIONS.length}</span>
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти фигуру"
            aria-label="Поиск фигуры"
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="palette-scroll">
        {CATEGORIES.map((category) => {
          const items = filtered.filter(
            (definition) => definition.category === category.id,
          );
          if (items.length === 0) return null;
          return (
            <section className="palette-section" key={category.id}>
              <div className="section-label">
                <span>{category.title}</span>
                <span className="section-line" />
              </div>
              <div className="shape-grid">
                {items.map((definition) => (
                  <button
                    key={definition.kind}
                    className="shape-card"
                    onClick={() => onAdd(definition.kind)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        'application/x-schemogost-kind',
                        definition.kind,
                      );
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={`${definition.label} — ${definition.description}`}
                  >
                    <span className="shape-icon">
                      <ShapeGlyph kind={definition.kind} size={38} />
                    </span>
                    <span className="shape-name">{definition.label}</span>
                    <span className="shape-gost">{definition.gost}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="palette-empty">
            <Search size={22} />
            <div>Ничего не найдено</div>
            <span>Попробуйте другое название</span>
          </div>
        )}
      </div>

      <div className="palette-footer">
        <div className="gost-card">
          <div className="gost-card-mark">ГОСТ</div>
          <div>
            <strong>Единый стандарт</strong>
            <span>Формы и линии по ГОСТ 19.701-90</span>
          </div>
        </div>
        <div className="palette-hint">
          Кликните фигуру или перетащите её на холст
        </div>
      </div>
    </aside>
  );
}
