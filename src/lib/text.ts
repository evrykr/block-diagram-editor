import type { DiagramNode } from '../types/diagram';

let measureContext: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

function measure(text: string, font: string): number {
  const ctx = context();
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  align: 'center' | 'left';
  textX: number;
  firstLineY: number;
}

function nodeTypography(node: DiagramNode): {
  fontSize: number;
  lineHeight: number;
  padding: number;
  maxLines: number;
  align: 'center' | 'left';
} {
  switch (node.kind) {
    case 'decision':
      return { fontSize: 14, lineHeight: 18, padding: 34, maxLines: 3, align: 'center' };
    case 'connector':
      return { fontSize: 13, lineHeight: 16, padding: 12, maxLines: 2, align: 'center' };
    case 'comment':
      return { fontSize: 13.5, lineHeight: 18, padding: 24, maxLines: 4, align: 'left' };
    case 'start':
    case 'end':
      return { fontSize: 15, lineHeight: 19, padding: 24, maxLines: 2, align: 'center' };
    case 'predefined':
      return { fontSize: 14, lineHeight: 18, padding: 30, maxLines: 3, align: 'center' };
    case 'document':
      return { fontSize: 14, lineHeight: 18, padding: 22, maxLines: 3, align: 'center' };
    default:
      return { fontSize: 14, lineHeight: 18, padding: 20, maxLines: 3, align: 'center' };
  }
}

function ellipsize(text: string, maxWidth: number, font: string): string {
  if (measure(text, font) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && measure(`${result}…`, font) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}…`;
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  font: string,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, font) <= maxWidth || !current) {
      if (!current && measure(word, font) > maxWidth) {
        let chunk = '';
        for (const character of word) {
          if (measure(chunk + character, font) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = character;
          } else {
            chunk += character;
          }
        }
        current = chunk;
      } else {
        current = candidate;
      }
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function layoutNodeText(node: DiagramNode): TextLayout {
  const typography = nodeTypography(node);
  const font = `${node.kind === 'decision' ? 500 : 450} ${typography.fontSize}px 'Segoe UI Variable Text', 'Segoe UI', Inter, sans-serif`;
  const isDecision = node.kind === 'decision';
  const widthFactor = isDecision ? 0.62 : 1;
  const maxWidth = Math.max(
    24,
    (node.width - typography.padding * 2) * widthFactor,
  );
  const rawLines = node.text
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((paragraph) =>
      paragraph.trim() === ''
        ? ['']
        : wrapParagraph(paragraph.trim(), maxWidth, font),
    );

  const limited = rawLines.slice(0, typography.maxLines);
  if (rawLines.length > typography.maxLines) {
    limited[limited.length - 1] = ellipsize(
      `${limited[limited.length - 1]} …`,
      maxWidth,
      font,
    );
  }
  const lines = limited.length > 0 ? limited : [''];

  const lineHeight = typography.lineHeight;
  const totalHeight = (lines.length - 1) * lineHeight;
  return {
    lines,
    fontSize: typography.fontSize,
    lineHeight,
    maxWidth,
    align: typography.align,
    textX:
      typography.align === 'left'
        ? node.x + typography.padding
        : node.x + node.width / 2,
    firstLineY: node.y + node.height / 2 - totalHeight / 2,
  };
}

export function measureLabel(
  text: string,
  fontSize = 12,
  weight = 600,
): number {
  return Math.max(
    18,
    measure(
      text,
      `${weight} ${fontSize}px 'Segoe UI Variable Text', 'Segoe UI', Inter, sans-serif`,
    ),
  );
}

export function textFontSize(node: DiagramNode): number {
  return nodeTypography(node).fontSize;
}

export function nodeTextPadding(node: DiagramNode): number {
  return nodeTypography(node).padding;
}
