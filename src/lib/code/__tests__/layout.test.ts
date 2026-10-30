import { describe, expect, it } from 'vitest';
import { CODE_EXAMPLES } from '../../../data/examples';
import { parseSource } from '../index';
import { astToDiagram } from '../toDiagram';
import { autoLayoutDiagram } from '../../autoLayout';
import { diagramContentBounds } from '../../geometry';

describe('layout', () => {
  it('keeps all nodes finite when auto-laying out a loop diagram', () => {
    const source = parseSource(CODE_EXAMPLES.python.code, 'python');
    const diagram = astToDiagram(source).diagram;
    const laidOut = autoLayoutDiagram(diagram);
    expect(laidOut.nodes.length).toBe(diagram.nodes.length);
    expect(laidOut.edges.length).toBe(diagram.edges.length);
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    const bounds = diagramContentBounds(laidOut, 24);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });
});
