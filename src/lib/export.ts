import type { Diagram, DiagramFile } from '../types/diagram';
import {
  EDGE_COLOR,
  FONT_FAMILY,
  NODE_FILL,
  NODE_STROKE,
} from '../constants/design';
import {
  diagramContentBounds,
  edgePoints,
  nodePath,
  pointOnPolyline,
  roundedPath,
} from './geometry';
import { layoutNodeText, measureLabel } from './text';

export type ExportFormat = 'svg' | 'png' | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  padding: number;
  scale: number;
  background: boolean;
  filename: string;
}

export function safeFilename(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'block-scheme'
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildExportSvg(
  diagram: Diagram,
  options: Pick<ExportOptions, 'padding' | 'background'>,
): { svg: string; width: number; height: number } {
  const bounds = diagramContentBounds(diagram, options.padding);
  const width = Math.max(320, Math.ceil(bounds.width));
  const height = Math.max(220, Math.ceil(bounds.height));
  const offsetX = -bounds.x;
  const offsetY = -bounds.y;
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const edgeMarkup: string[] = [];
  const nodeMarkup: string[] = [];

  for (const edge of diagram.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const geometry = edgePoints(edge, from, to);
    const path = roundedPath(geometry.points, 10);
    if (!path) continue;
    edgeMarkup.push(
      `<path d="${path}" fill="none" stroke="${EDGE_COLOR}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${
        edge.dashed ? ' stroke-dasharray="7 5"' : ''
      } marker-end="url(#arrow)"/>`,
    );
    if (edge.label) {
      const point = pointOnPolyline(
        geometry.points,
        edge.branch ? 0.24 : 0.5,
      );
      const labelWidth = measureLabel(edge.label, 11.5, 600) + 14;
      edgeMarkup.push(
        `<g><rect x="${(point.x - labelWidth / 2).toFixed(1)}" y="${(point.y - 20).toFixed(1)}" width="${labelWidth.toFixed(1)}" height="19" rx="5" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/><text x="${point.x.toFixed(1)}" y="${(point.y - 7).toFixed(1)}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="11.5" font-weight="600" fill="#475569">${escapeXml(edge.label)}</text></g>`,
      );
    }
  }

  for (const node of diagram.nodes) {
    const layout = layoutNodeText(node);
    const path = nodePath(node);
    nodeMarkup.push(
      `<g><path d="${path}" fill="${NODE_FILL}" stroke="${NODE_STROKE}" stroke-width="1.7" stroke-linejoin="round"/>`,
    );
    if (node.kind === 'predefined') {
      nodeMarkup.push(
        `<path d="M ${node.x + 16} ${node.y + 1.2} V ${node.y + node.height - 1.2} M ${node.x + node.width - 16} ${node.y + 1.2} V ${node.y + node.height - 1.2}" stroke="${NODE_STROKE}" stroke-width="1.4"/>`,
      );
    }
    if (node.kind === 'connector' && !node.text.trim()) {
      nodeMarkup.push(
        `<text x="${node.x + node.width / 2}" y="${node.y + node.height / 2 + 4}" text-anchor="middle" font-size="11" fill="#94a3b8">A</text>`,
      );
    }
    const anchor = layout.align === 'center' ? 'middle' : 'start';
    const weight = node.kind === 'decision' ? 500 : 450;
    nodeMarkup.push(
      `<text x="${layout.textX.toFixed(1)}" text-anchor="${anchor}" font-family="${FONT_FAMILY}" font-size="${layout.fontSize}" font-weight="${weight}" fill="#1b2531" dominant-baseline="central">`,
    );
    for (let index = 0; index < layout.lines.length; index += 1) {
      nodeMarkup.push(
        `<tspan x="${layout.textX.toFixed(1)}" y="${(layout.firstLineY + index * layout.lineHeight).toFixed(1)}">${escapeXml(layout.lines[index] || ' ')}</tspan>`,
      );
    }
    nodeMarkup.push('</text></g>');
  }

  const background = options.background
    ? `<rect width="${width}" height="${height}" fill="#ffffff"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(diagram.title)}">
<title>${escapeXml(diagram.title)}</title>
<desc>Блок-схема по ГОСТ 19.701-90. Создано в СхемоГОСТ.</desc>
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 Z" fill="${EDGE_COLOR}"/>
  </marker>
</defs>
${background}
<g transform="translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)})">
${edgeMarkup.join('\n')}
${nodeMarkup.join('\n')}
</g>
</svg>`;
  return { svg, width, height };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(
  content: string,
  filename: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

export function diagramToJsonFile(diagram: Diagram): string {
  const payload: DiagramFile = {
    format: 'gost-flowchart',
    version: 1,
    diagram,
  };
  return JSON.stringify(payload, null, 2);
}

export function normalizeImportedDiagram(value: unknown): Diagram {
  if (!value || typeof value !== 'object') {
    throw new Error('Файл не содержит схемы.');
  }
  const record = value as Record<string, unknown>;
  const candidate =
    record.format === 'gost-flowchart' && record.diagram
      ? (record.diagram as Record<string, unknown>)
      : record;
  if (
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges) ||
    typeof candidate.title !== 'string'
  ) {
    throw new Error('Некорректный формат схемы.');
  }
  const allowedKinds = new Set([
    'start',
    'end',
    'process',
    'decision',
    'io',
    'predefined',
    'document',
    'preparation',
    'manual',
    'delay',
    'connector',
    'comment',
  ]);
  const nodes = candidate.nodes
    .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === 'object'))
    .map((node, index) => {
      const kind = String(node.kind);
      if (!allowedKinds.has(kind)) {
        throw new Error(`Неизвестный тип блока в файле: ${kind}`);
      }
      return {
        id: String(node.id || `imported_${index}`),
        kind: kind as Diagram['nodes'][number]['kind'],
        text: String(node.text ?? ''),
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        width: Math.max(40, Number(node.width) || 180),
        height: Math.max(30, Number(node.height) || 70),
        ...(typeof node.code === 'string' ? { code: node.code } : {}),
      };
    });
  if (nodes.length === 0) throw new Error('В файле нет блоков.');
  const ids = new Set(nodes.map((node) => node.id));
  const edges = candidate.edges
    .filter((edge): edge is Record<string, unknown> => Boolean(edge && typeof edge === 'object'))
    .filter((edge) => ids.has(String(edge.from)) && ids.has(String(edge.to)))
    .map((edge, index) => ({
      id: String(edge.id || `edge_${index}`),
      from: String(edge.from),
      to: String(edge.to),
      ...(edge.label ? { label: String(edge.label) } : {}),
      ...(edge.dashed ? { dashed: true } : {}),
      ...(edge.back ? { back: true } : {}),
      ...(edge.loopExit ? { loopExit: true } : {}),
      ...(edge.branch === 'yes' || edge.branch === 'no'
        ? { branch: edge.branch as 'yes' | 'no' }
        : {}),
      ...(['top', 'right', 'bottom', 'left'].includes(String(edge.fromSide))
        ? { fromSide: edge.fromSide as 'top' | 'right' | 'bottom' | 'left' }
        : {}),
      ...(['top', 'right', 'bottom', 'left'].includes(String(edge.toSide))
        ? { toSide: edge.toSide as 'top' | 'right' | 'bottom' | 'left' }
        : {}),
      ...(Array.isArray(edge.waypoints)
        ? {
            waypoints: edge.waypoints
              .filter(
                (point): point is { x: number; y: number } =>
                  Boolean(point) &&
                  typeof point === 'object' &&
                  Number.isFinite(Number((point as { x?: number }).x)) &&
                  Number.isFinite(Number((point as { y?: number }).y)),
              )
              .map((point) => ({ x: Number(point.x), y: Number(point.y) })),
          }
        : {}),
    }));
  return {
    title: String(candidate.title || 'Импортированная схема'),
    nodes,
    edges,
    updatedAt: Date.now(),
    ...(candidate.sourceLanguage === 'python' ||
    candidate.sourceLanguage === 'pascal' ||
    candidate.sourceLanguage === 'cpp' ||
    candidate.sourceLanguage === 'csharp'
      ? { sourceLanguage: candidate.sourceLanguage }
      : {}),
  };
}

async function svgToPngDataUrl(
  svg: string,
  width: number,
  height: number,
  scale: number,
  background: boolean,
): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось подготовить изображение.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas недоступен.');
    if (background) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportDiagram(
  diagram: Diagram,
  options: ExportOptions,
): Promise<void> {
  const base = safeFilename(options.filename || diagram.title);
  if (options.format === 'json') {
    downloadText(diagramToJsonFile(diagram), `${base}.json`, 'application/json;charset=utf-8');
    return;
  }
  const { svg, width, height } = buildExportSvg(diagram, options);
  if (options.format === 'svg') {
    downloadText(svg, `${base}.svg`, 'image/svg+xml;charset=utf-8');
    return;
  }
  if (options.format === 'png') {
    const data = await svgToPngDataUrl(
      svg,
      width,
      height,
      options.scale,
      options.background,
    );
    const anchor = document.createElement('a');
    anchor.href = data;
    anchor.download = `${base}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  const data = await svgToPngDataUrl(svg, width, height, options.scale, true);
  const { jsPDF } = await import('jspdf');
  const landscape = width >= height;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 34;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const ratio = Math.min(availableWidth / width, availableHeight / height);
  const renderWidth = width * ratio;
  const renderHeight = height * ratio;
  const x = (pageWidth - renderWidth) / 2;
  const y = (pageHeight - renderHeight) / 2;
  pdf.addImage(data, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');
  pdf.save(`${base}.pdf`);
}
