import {
  CodeParseError,
  conditionLabel,
  findMatchingParen,
  splitTopLevel,
  stripOuterParens,
  unquote,
  type FunctionDef,
  type ParsedProgram,
  type Statement,
} from './types';

interface LogicalLine {
  indent: number;
  text: string;
  line: number;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#') return line.slice(0, index);
  }
  return line;
}

function bracketDelta(text: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (const char of text) {
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
  }
  return depth;
}

function dedentLines(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const minimum = indents.length ? Math.min(...indents) : 0;
  if (minimum === 0) return lines;
  return lines.map((line) => line.slice(Math.min(minimum, line.length)));
}

export function logicalPythonLines(source: string): LogicalLine[] {
  const normalized = source
    .replace(/\r\n?/g, '\n')
    .replace(/"""[\s\S]*?"""/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/'''[\s\S]*?'''/g, (match) => match.replace(/[^\n]/g, ' '));
  const physical = dedentLines(normalized.split('\n'));
  const result: LogicalLine[] = [];
  let buffer = '';
  let startLine = 1;
  let indent = 0;
  let depth = 0;
  let continuation = false;

  for (let index = 0; index < physical.length; index += 1) {
    const raw = physical[index];
    const withoutComment = stripComment(raw);
    if (!buffer) {
      if (!withoutComment.trim()) continue;
      startLine = index + 1;
      indent = withoutComment.match(/^[ \t]*/)?.[0].replace(/\t/g, '    ').length ?? 0;
    }
    let piece = withoutComment.trim();
    const backslash = piece.endsWith('\\');
    if (backslash) piece = piece.slice(0, -1).trimEnd();
    if (piece) buffer += `${buffer ? ' ' : ''}${piece}`;
    depth += bracketDelta(piece);
    continuation = backslash;
    if (depth <= 0 && !continuation) {
      const text = buffer.trim();
      if (text) {
        result.push({
          indent: buffer === text ? indent : indent,
          text,
          line: startLine,
        });
      }
      buffer = '';
      depth = 0;
    }
  }
  if (buffer.trim()) {
    result.push({ indent, text: buffer.trim(), line: startLine });
  }
  return result;
}

function splitHeader(text: string): { head: string; inline: string } {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === ':' && depth === 0) {
      return {
        head: text.slice(0, index).trim(),
        inline: text.slice(index + 1).trim(),
      };
    }
  }
  return { head: text.trim(), inline: '' };
}

function sanitizeExpression(expression: string): string {
  return expression
    .replace(/\bTrue\b/g, 'истина')
    .replace(/\bFalse\b/g, 'ложь')
    .replace(/\bNone\b/g, 'null')
    .replace(/\band\b/g, 'и')
    .replace(/\bor\b/g, 'или')
    .replace(/\bnot\b/g, 'не');
}

function outputLabel(args: string): string {
  const parts = splitTopLevel(args);
  const hasString = parts.some(
    (part) =>
      (part.trim().startsWith('"') && part.trim().endsWith('"')) ||
      (part.trim().startsWith("'") && part.trim().endsWith("'")),
  );
  const clean = parts.map((part) => {
    const value = part.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return unquote(value).trim();
    }
    return value.trim();
  });
  return `Вывод: ${clean.filter(Boolean).join(hasString ? ' ' : ', ')}`;
}

class PythonParser {
  private index = 0;
  private readonly lines: LogicalLine[];
  private readonly functions: FunctionDef[] = [];
  private readonly warnings: string[] = [];

  constructor(lines: LogicalLine[]) {
    this.lines = lines;
  }

  parse(): ParsedProgram {
    const body: Statement[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent > 0) {
        throw new CodeParseError('Неожиданный отступ в начале программы', line.line);
      }
      if (/^@/.test(line.text)) {
        this.index += 1;
        continue;
      }
      if (/^(async\s+)?def\s+/.test(line.text)) {
        this.parseFunction();
        continue;
      }
      if (/^class\s+/.test(line.text)) {
        this.warnings.push(
          `Строка ${line.line}: класс пропущен — схема строится по функции или основному сценарию.`,
        );
        this.index += 1;
        this.skipIndentedBlock(line.indent);
        continue;
      }
      const statement = this.parseStatement(line.indent);
      if (statement) body.push(statement);
    }
    if (!body.length && !this.functions.length) {
      throw new CodeParseError('В коде не найдено ни одного оператора', 1);
    }
    return {
      language: 'python',
      functions: this.functions,
      body,
      warnings: this.warnings,
    };
  }

  private skipIndentedBlock(parentIndent: number): void {
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent <= parentIndent) break;
      this.index += 1;
    }
  }

  private parseFunction(): void {
    const line = this.lines[this.index];
    this.index += 1;
    const { head, inline } = splitHeader(line.text);
    const match = head.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)\)/s);
    if (!match) {
      throw new CodeParseError('Не удалось разобрать объявление функции', line.line);
    }
    const body = this.parseBody(line.indent, inline, line.line);
    this.functions.push({
      name: match[1],
      params: match[2].replace(/\s+/g, ' ').trim(),
      body,
      returns: false,
      line: line.line,
    });
  }

  private parseBody(
    parentIndent: number,
    inline: string,
    line: number,
  ): Statement[] {
    if (inline) {
      return this.parseInline(inline, line);
    }
    if (this.index >= this.lines.length) return [];
    const next = this.lines[this.index];
    if (next.indent <= parentIndent) return [];
    return this.parseBlock(next.indent);
  }

  private parseInline(text: string, line: number): Statement[] {
    return splitTopLevel(text, ';')
      .map((part) => this.parseSimple(part.trim(), line))
      .filter((statement): statement is Statement => Boolean(statement));
  }

  private parseBlock(indent: number): Statement[] {
    const statements: Statement[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        throw new CodeParseError('Нарушен отступ блока', line.line);
      }
      if (/^(elif\b|else\s*:|except\b|finally\s*:)/.test(line.text)) break;
      const statement = this.parseStatement(indent);
      if (statement) statements.push(statement);
    }
    return statements;
  }

  private parseStatement(indent: number): Statement | null {
    const line = this.lines[this.index];
    const text = line.text;
    if (/^if\b/.test(text)) {
      return this.parseIf(indent);
    }
    if (/^while\b/.test(text)) {
      return this.parseWhile(indent);
    }
    if (/^for\b/.test(text)) {
      return this.parseFor(indent);
    }
    if (/^(def|async\s+def)\b/.test(text)) {
      throw new CodeParseError(
        'Вложенные функции не поддерживаются при построении схемы',
        line.line,
      );
    }
    if (/^(try|with)\b/.test(text)) {
      throw new CodeParseError(
        `Конструкция «${text.split(/\s/)[0]}» пока не поддерживается`,
        line.line,
      );
    }
    this.index += 1;
    if (/^class\s+/.test(text)) {
      this.skipIndentedBlock(indent);
      return null;
    }
    return this.parseSimple(text, line.line);
  }

  private parseIf(indent: number): Statement {
    return this.parseIfLine(this.lines[this.index], indent, 'if');
  }

  private parseIfLine(
    line: LogicalLine,
    indent: number,
    keyword: 'if' | 'elif',
  ): Statement {
    this.index += 1;
    const { head, inline } = splitHeader(line.text);
    const condition = head.replace(new RegExp(`^${keyword}\\s+`), '').trim();
    if (!condition) {
      throw new CodeParseError('Пустое условие в if', line.line);
    }
    const then = this.parseBody(indent, inline, line.line);
    let elseBody: Statement[] = [];
    const next = this.lines[this.index];
    if (next && next.indent === indent) {
      if (/^elif\b/.test(next.text)) {
        elseBody = [this.parseIfLine(next, indent, 'elif')];
      } else if (/^else\s*:/.test(next.text)) {
        this.index += 1;
        const nestedHead = splitHeader(next.text);
        elseBody = this.parseBody(indent, nestedHead.inline, next.line);
      }
    }
    return {
      type: 'if',
      condition: conditionLabel(sanitizeExpression(condition)),
      sourceCondition: condition,
      then,
      else: elseBody,
    };
  }

  private parseWhile(indent: number): Statement {
    const line = this.lines[this.index];
    this.index += 1;
    const { head, inline } = splitHeader(line.text);
    const condition = head.replace(/^while\s+/, '').trim();
    if (!condition) {
      throw new CodeParseError('Пустое условие в while', line.line);
    }
    const body = this.parseBody(indent, inline, line.line);
    if (
      this.index < this.lines.length &&
      this.lines[this.index].indent === indent &&
      /^else\s*:/.test(this.lines[this.index].text)
    ) {
      this.warnings.push(
        `Строка ${this.lines[this.index].line}: блок else у while не отображается отдельно.`,
      );
      const elseLine = this.lines[this.index];
      this.index += 1;
      const nested = splitHeader(elseLine.text);
      this.parseBody(indent, nested.inline, elseLine.line);
    }
    return {
      type: 'while',
      condition: conditionLabel(sanitizeExpression(condition)),
      sourceCondition: condition,
      body,
      mode: 'while',
    };
  }

  private parseFor(indent: number): Statement {
    const line = this.lines[this.index];
    this.index += 1;
    const { head, inline } = splitHeader(line.text);
    const body = this.parseBody(indent, inline, line.line);
    const match = head.match(
      /^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/s,
    );
    if (!match) {
      throw new CodeParseError('Не удалось разобрать цикл for', line.line);
    }
    const variable = match[1];
    const iterable = match[2].trim();
    const rangeMatch = iterable.match(/^range\s*\(([\s\S]*)\)$/);
    if (rangeMatch) {
      const args = splitTopLevel(rangeMatch[1]).map((part) => part.trim());
      let start = '0';
      let stop = args[0] ?? '0';
      let step = '1';
      if (args.length === 2) {
        start = args[0];
        stop = args[1];
      } else if (args.length >= 3) {
        start = args[0];
        stop = args[1];
        step = args[2];
      }
      const descending = step.trim().startsWith('-');
      const absoluteStep = step.trim().replace(/^-/, '');
      const stepValue = descending ? `-${absoluteStep}` : step.trim();
      const update =
        absoluteStep === '1'
          ? `${variable} ${descending ? '-=' : '+='} 1`
          : `${variable} += ${stepValue}`;
      return {
        type: 'for',
        header: `для ${variable} от ${start} до ${stop}${
          step !== '1' ? ` с шагом ${step}` : ''
        }`,
        init: `${variable} = ${start}`,
        condition: conditionLabel(
          `${variable} ${descending ? '>' : '<'} ${stop}`,
        ),
        sourceCondition: `${variable} ${descending ? '>' : '<'} ${stop}`,
        update,
        body,
      };
    }
    return {
      type: 'foreach',
      variable,
      iterable,
      body,
      header: `для каждого ${variable} из ${iterable}`,
    };
  }

  private parseSimple(text: string, _line: number): Statement | null {
    let value = text.trim().replace(/;$/, '');
    if (!value) return null;
    if (/^(pass|import\b|from\b|global\b|nonlocal\b|del\b)\b/.test(value)) {
      return null;
    }
    if (/^break$/.test(value)) return { type: 'break' };
    if (/^continue$/.test(value)) return { type: 'continue' };
    if (/^return\b/.test(value)) {
      return {
        type: 'return',
        value: value.replace(/^return\b/, '').trim(),
      };
    }
    if (/^raise\b|^assert\b/.test(value)) {
      return {
        type: 'simple',
        kind: 'process',
        text: value,
        code: value,
      };
    }
    const printMatch = value.match(/^(?:print|pprint)\s*\(([\s\S]*)\)$/);
    if (printMatch) {
      return {
        type: 'simple',
        kind: 'io',
        text: outputLabel(printMatch[1]),
        code: value,
      };
    }
    const stdoutMatch = value.match(
      /^(?:sys\.stdout\.write|stdout\.write)\s*\(([\s\S]*)\)$/,
    );
    if (stdoutMatch) {
      return {
        type: 'simple',
        kind: 'io',
        text: outputLabel(stdoutMatch[1]),
        code: value,
      };
    }

    const assignment = value.match(
      /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=\s*([\s\S]+)$/,
    );
    if (assignment) {
      const target = assignment[1].replace(/\s+/g, ' ').trim();
      const expression = assignment[2].trim();
      if (/\binput\s*\(/.test(expression)) {
        return {
          type: 'simple',
          kind: 'io',
          text: `Ввод: ${target}`,
          code: value,
        };
      }
      return {
        type: 'simple',
        kind: 'process',
        text: value,
        code: value,
      };
    }
    if (/\binput\s*\(/.test(value)) {
      return {
        type: 'simple',
        kind: 'io',
        text: `Ввод: ${stripOuterParens(value)}`,
        code: value,
      };
    }
    return {
      type: 'simple',
      kind: 'process',
      text: value,
      code: value,
    };
  }
}

export function parsePython(source: string): ParsedProgram {
  const lines = logicalPythonLines(source);
  if (!lines.length) {
    throw new CodeParseError('Введите код на Python', 1);
  }
  return new PythonParser(lines).parse();
}

export function extractPythonCallArguments(value: string): string {
  const open = value.indexOf('(');
  if (open < 0) return '';
  const close = findMatchingParen(value, open);
  if (close < 0) return '';
  const args = value.slice(open + 1, close);
  return splitTopLevel(args).join(', ');
}
