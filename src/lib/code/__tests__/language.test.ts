import { describe, expect, it } from 'vitest';
import { parseSource } from '../index';
import { astToDiagram } from '../toDiagram';
import { diagramToCode } from '../../codegen';
import type { Statement } from '../types';

function findStatement(statements: Statement[], type: Statement['type']) {
  return statements.find((statement) => statement.type === type);
}

describe('control structures', () => {
  it('parses Python elif chains and while', () => {
    const program = parseSource(
      `x = int(input())\nif x > 0:\n    print("positive")\nelif x < 0:\n    print("negative")\nelse:\n    print("zero")\nwhile x < 10:\n    x += 1\n`,
      'python',
    );
    const conditional = findStatement(program.body, 'if');
    expect(conditional?.type).toBe('if');
    if (conditional?.type === 'if') {
      expect(conditional.else[0]?.type).toBe('if');
    }
    expect(program.body.some((statement) => statement.type === 'while')).toBe(
      true,
    );
    const diagram = astToDiagram(program).diagram;
    expect(diagram.nodes.filter((node) => node.kind === 'decision').length).toBeGreaterThan(1);
  });

  it('parses Pascal while and repeat loops', () => {
    const program = parseSource(
      `program Test;
var i: integer;
begin
  i := 1;
  while i <= 3 do begin
    writeln(i);
    i := i + 1;
  end;
  repeat
    i := i - 1;
  until i = 0;
end.`,
      'pascal',
    );
    const loops = program.body.filter((statement) => statement.type === 'while');
    expect(loops.length).toBe(2);
    expect(loops[0]?.type === 'while' && loops[0].mode).toBe('while');
    expect(loops[1]?.type === 'while' && loops[1].mode).toBe('do');
    const code = diagramToCode(astToDiagram(program).diagram, 'pascal').code;
    expect(code).toContain('while i <= 3 do');
    expect(code).toContain('program Flowchart;');
  });

  it('parses C++ do-while and switch', () => {
    const program = parseSource(
      `#include <iostream>
int main() {
  int x = 0;
  do { x++; } while (x < 5);
  switch (x) {
    case 1: x = 2; break;
    default: x = 3;
  }
  return 0;
}`,
      'cpp',
    );
    expect(program.functions[0]?.name).toBe('main');
    const diagram = astToDiagram(program).diagram;
    expect(diagram.nodes.some((node) => node.kind === 'decision')).toBe(true);
    const code = diagramToCode(diagram, 'cpp').code;
    expect(code).toContain('int main()');
    expect(code).toContain('if');
  });

  it('parses C# foreach and builds code', () => {
    const program = parseSource(
      `using System;
class Program {
  static void Main() {
    foreach (var item in items) {
      Console.WriteLine(item);
    }
  }
}`,
      'csharp',
    );
    expect(program.functions[0]?.name).toBe('Main');
    const diagram = astToDiagram(program).diagram;
    expect(
      diagram.nodes.some((node) => node.kind === 'preparation'),
    ).toBe(true);
    const code = diagramToCode(diagram, 'csharp').code;
    expect(code).toContain('using System;');
    expect(code).toContain('Console.WriteLine');
  });
});

describe('import validation helpers', () => {
  it('normalizes a diagram file', async () => {
    const { normalizeImportedDiagram } = await import('../../export');
    const program = parseSource(
      `print("hello")\n`,
      'python',
    );
    const diagram = astToDiagram(program).diagram;
    const copy = JSON.parse(JSON.stringify(diagram));
    const normalized = normalizeImportedDiagram({
      format: 'gost-flowchart',
      version: 1,
      diagram: copy,
    });
    expect(normalized.nodes.length).toBe(diagram.nodes.length);
    expect(normalized.title).toBe(diagram.title);
  });
});
