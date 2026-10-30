import { describe, expect, it } from 'vitest';
import { CODE_EXAMPLES } from '../../../data/examples';
import type { Language } from '../../../types/diagram';
import { parseSource } from '../index';
import { astToDiagram } from '../toDiagram';
import { diagramToCode } from '../../codegen';

const languages: Language[] = ['python', 'pascal', 'cpp', 'csharp'];

describe('code → flowchart', () => {
  for (const language of languages) {
    it(`parses ${language} and builds a diagram`, () => {
      const program = parseSource(CODE_EXAMPLES[language].code, language);
      const result = astToDiagram(program);
      expect(result.diagram.nodes.length).toBeGreaterThan(4);
      expect(result.diagram.edges.length).toBeGreaterThan(3);
      expect(result.diagram.sourceLanguage).toBe(language);
      const kinds = new Set(result.diagram.nodes.map((node) => node.kind));
      expect(kinds.has('start')).toBe(true);
      expect(kinds.has('end')).toBe(true);
      expect(kinds.has('decision')).toBe(true);
      expect(kinds.has('io')).toBe(true);

      const generated = diagramToCode(result.diagram, language);
      expect(generated.code.length).toBeGreaterThan(20);
      expect(generated.warnings.length).toBeLessThan(4);
    });
  }
});

describe('reverse code generation', () => {
  it('keeps Python control flow', () => {
    const diagram = astToDiagram(
      parseSource(CODE_EXAMPLES.python.code, 'python'),
    ).diagram;
    const code = diagramToCode(diagram, 'python').code;
    expect(code).toContain('while');
    expect(code).toContain('if');
    expect(code).toContain('print');
  });

  it('produces C++ syntax', () => {
    const diagram = astToDiagram(
      parseSource(CODE_EXAMPLES.python.code, 'python'),
    ).diagram;
    const code = diagramToCode(diagram, 'cpp').code;
    expect(code).toContain('#include <iostream>');
    expect(code).toContain('int main()');
    expect(code).toContain('cout');
    expect(code).toContain('while');
  });
});
