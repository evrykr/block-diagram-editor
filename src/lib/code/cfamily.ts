import {
  CodeParseError,
  conditionLabel,
  splitTopLevel,
  unquote,
  type FunctionDef,
  type ParsedProgram,
  type Statement,
} from './types';

interface Token {
  type: 'id' | 'num' | 'str' | 'sym' | 'eof';
  value: string;
  lower: string;
  raw?: string;
  line: number;
}

const CONTROL_NAMES = new Set([
  'if',
  'else',
  'for',
  'foreach',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'return',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'delete',
  'sizeof',
  'using',
  'lock',
  'checked',
  'unchecked',
  'unsafe',
  'fixed',
  'namespace',
  'class',
  'struct',
  'interface',
  'enum',
  'record',
  'union',
]);

const MULTI_SYMBOLS = [
  '>>=',
  '<<=',
  '->*',
  '...',
  '::',
  '->',
  '++',
  '--',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
  '=>',
  '??',
  '?.',
];

function tokenizeCFamily(source: string): Token[] {
  const tokens: Token[] = [];
  const text = source.replace(/\r\n?/g, '\n');
  let index = 0;
  let line = 1;
  let lineStart = true;

  const push = (type: Token['type'], value: string, raw?: string) => {
    tokens.push({ type, value, lower: value.toLowerCase(), raw, line });
  };

  const readString = (prefixLength: number, quote: string, verbatim = false) => {
    let indexStart = index;
    index += prefixLength + 1;
    let value = '';
    while (index < text.length) {
      const char = text[index];
      if (char === quote) {
        if (verbatim && text[index + 1] === quote) {
          value += quote;
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      if (!verbatim && char === '\\') {
        value += char;
        if (index + 1 < text.length) {
          value += text[index + 1];
          index += 2;
          continue;
        }
      }
      if (char === '\n') line += 1;
      value += char;
      index += 1;
    }
    const raw = text.slice(indexStart, index);
    push('str', value, raw || `${quote}${value}${quote}`);
  };

  while (index < text.length) {
    const char = text[index];
    if (char === '\n') {
      line += 1;
      index += 1;
      lineStart = true;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      continue;
    }
    if (lineStart && char === '#') {
      while (index < text.length && text[index] !== '\n') {
        if (text[index] === '\\' && text[index + 1] === '\n') {
          index += 2;
          line += 1;
          continue;
        }
        index += 1;
      }
      continue;
    }
    lineStart = false;
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === '*' && text[index + 1] === '/')
      ) {
        if (text[index] === '\n') line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === '"') {
      readString(0, '"');
      continue;
    }
    if (char === "'") {
      readString(0, "'");
      continue;
    }
    if (
      (char === '$' || char === '@') &&
      (text[index + 1] === '"' || text[index + 1] === "'")
    ) {
      const quote = text[index + 1];
      readString(1, quote, char === '@');
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = '';
      while (index < text.length && /[A-Za-z0-9_]/.test(text[index])) {
        value += text[index];
        index += 1;
      }
      push('id', value);
      continue;
    }
    if (/\d/.test(char)) {
      let value = '';
      if (char === '0' && /[xXbB]/.test(text[index + 1])) {
        value += text[index] + text[index + 1];
        index += 2;
        while (index < text.length && /[0-9a-fA-F_]/.test(text[index])) {
          value += text[index];
          index += 1;
        }
      } else {
        while (index < text.length && /[0-9_]/.test(text[index])) {
          value += text[index];
          index += 1;
        }
        if (text[index] === '.' && text[index + 1] !== '.') {
          value += '.';
          index += 1;
          while (index < text.length && /[0-9_]/.test(text[index])) {
            value += text[index];
            index += 1;
          }
        }
        if (text[index] === 'e' || text[index] === 'E') {
          value += text[index];
          index += 1;
          if (text[index] === '+' || text[index] === '-') {
            value += text[index];
            index += 1;
          }
          while (index < text.length && /[0-9]/.test(text[index])) {
            value += text[index];
            index += 1;
          }
        }
      }
      while (index < text.length && /[uUlLfFmM]/.test(text[index])) {
        value += text[index];
        index += 1;
      }
      push('num', value);
      continue;
    }
    const multi = MULTI_SYMBOLS.find((symbol) =>
      text.startsWith(symbol, index),
    );
    if (multi) {
      push('sym', multi);
      index += multi.length;
      continue;
    }
    if ('{}()[];,.:?+-*/%=<>!&|^~#@'.includes(char)) {
      push('sym', char);
      index += 1;
      continue;
    }
    push('sym', char);
    index += 1;
  }
  tokens.push({ type: 'eof', value: '', lower: '', line });
  return tokens;
}

function formatTokens(tokens: Token[]): string {
  const noSpaceBefore = new Set([
    ')',
    ']',
    '}',
    ',',
    ';',
    '.',
    '::',
    '->',
    '++',
    '--',
    '?',
    '!',
  ]);
  const noSpaceAfter = new Set(['(', '[', '{', '.', '::', '->', '!', '~', '@']);
  let result = '';
  let previous = '';
  for (const token of tokens) {
    const value =
      token.type === 'str'
        ? (token.raw ?? `"${token.value.replace(/"/g, '\\"')}"`)
        : token.value;
    if (!result) {
      result = value;
    } else if (noSpaceBefore.has(value) || noSpaceAfter.has(previous)) {
      result += value;
    } else if (
      value === '(' &&
      /^[A-Za-z_]\w*$/.test(previous)
    ) {
      result += value;
    } else if (
      value === '[' &&
      (/^[A-Za-z_]\w*$/.test(previous) || previous === ']')
    ) {
      result += value;
    } else if (value === ':' && previous === ':') {
      result += value;
    } else {
      result += ` ${value}`;
    }
    previous = value;
  }
  return result.trim();
}

function sanitizeCondition(expression: string): string {
  return expression
    .replace(/&&/g, ' и ')
    .replace(/\|\|/g, ' или ')
    .replace(/!(?!=)/g, 'не ')
    .replace(/\btrue\b/gi, 'истина')
    .replace(/\bfalse\b/gi, 'ложь')
    .replace(/\bnullptr\b/gi, 'null')
    .replace(/\bnull\b/gi, 'null')
    .replace(/\s+/g, ' ')
    .trim();
}

function unescapeString(value: string): string {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

function stringValue(token: Token): string {
  return unescapeString(token.value);
}

function formatPrintf(args: string): string {
  const parts = splitTopLevel(args);
  if (parts.length === 0) return 'Вывод:';
  const format = unescapeString(unquote(parts[0]));
  let argumentIndex = 1;
  const result = format.replace(/%[-+ 0#]*\d*(?:\.\d+)?[diufegsxXocp%]/g, (match) => {
    if (match === '%%') return '%';
    const value = parts[argumentIndex]?.trim() ?? '…';
    argumentIndex += 1;
    return unquote(value);
  });
  return `Вывод: ${result}`.trim();
}

function streamSegment(tokens: Token[]): string {
  const clean = tokens.filter(
    (token) => token.lower !== 'endl' && token.lower !== 'std::endl',
  );
  return clean
    .map((token) => (token.type === 'str' ? stringValue(token) : token.value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitByToken(tokens: Token[], separator: string): Token[][] {
  const groups: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.value === '(' || token.value === '[' || token.value === '{') depth += 1;
    if (token.value === ')' || token.value === ']' || token.value === '}') depth -= 1;
    if (token.value === separator && depth === 0) {
      groups.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  groups.push(current);
  return groups;
}

function outputFromStream(tokens: Token[], separator: string): string {
  const groups = splitByToken(tokens, separator)
    .slice(1)
    .map((group) => streamSegment(group))
    .filter(Boolean);
  return `Вывод: ${groups.join(' ')}`;
}

function inputFromStream(tokens: Token[], separator: string): string {
  const groups = splitByToken(tokens, separator)
    .slice(1)
    .map((group) => formatTokens(group))
    .filter(Boolean);
  return `Ввод: ${groups.join(', ')}`;
}

function lastIdentifier(value: string): string {
  const matches = value.match(/[A-Za-z_]\w*/g);
  return matches?.[matches.length - 1] ?? 'значение';
}

function isOnlyDeclaration(text: string): boolean {
  if (/[=(){}[\]]/.test(text) || /\+{1,2}|-{2}/.test(text)) return false;
  const clean = text.trim();
  if (/^(?:const\s+|static\s+|volatile\s+|readonly\s+|final\s+|unsigned\s+|signed\s+|long\s+|short\s+)*[A-Za-z_][\w:<>,\s]*\s+[*&]*[A-Za-z_]\w*$/.test(clean)) {
    return true;
  }
  return /^(?:int|float|double|char|bool|boolean|string|var|auto|long|short|byte|decimal|object|dynamic|void|size_t)\b/.test(
    clean,
  ) && !/\(/.test(clean);
}

class CFamilyParser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly functions: FunctionDef[] = [];
  private readonly warnings: string[] = [];
  private readonly language: 'cpp' | 'csharp';

  constructor(tokens: Token[], language: 'cpp' | 'csharp') {
    this.tokens = tokens;
    this.language = language;
  }

  parse(): ParsedProgram {
    this.scanTopLevel(0);
    if (this.functions.length === 0) {
      this.index = 0;
      const body = this.parseStatementList();
      if (!body.length) {
        throw new CodeParseError(
          'Не найдено ни одной функции или оператора для построения схемы',
          1,
        );
      }
      return {
        language: this.language,
        functions: [],
        body,
        warnings: this.warnings,
      };
    }
    return {
      language: this.language,
      functions: this.functions,
      body: [],
      warnings: this.warnings,
    };
  }

  private scanTopLevel(depth: number): void {
    while (!this.isEof()) {
      const token = this.current();
      if (token.value === '}') {
        if (depth > 0) return;
        this.index += 1;
        continue;
      }
      if (token.value === '{') {
        this.skipBalanced('{', '}');
        continue;
      }
      if (this.isAggregateKeyword(token)) {
        this.parseAggregate(depth);
        continue;
      }
      if (this.tryParseFunction()) {
        continue;
      }
      this.index += 1;
    }
  }

  private isAggregateKeyword(token: Token): boolean {
    return [
      'namespace',
      'class',
      'struct',
      'interface',
      'enum',
      'record',
      'union',
    ].includes(token.lower);
  }

  private parseAggregate(depth: number): void {
    const start = this.current();
    const keyword = start.lower;
    let cursor = this.index + 1;
    let brace = -1;
    while (cursor < this.tokens.length) {
      const value = this.tokens[cursor].value;
      if (value === ';') break;
      if (value === '{') {
        brace = cursor;
        break;
      }
      cursor += 1;
    }
    if (brace < 0) {
      this.index += 1;
      return;
    }
    if (keyword === 'enum') {
      this.index = brace;
      this.skipBalanced('{', '}');
      if (this.current().value === ';') this.index += 1;
      return;
    }
    this.index = brace + 1;
    while (!this.isEof() && this.current().value !== '}') {
      if (this.current().value === '{') {
        this.skipBalanced('{', '}');
        continue;
      }
      if (this.isAggregateKeyword(this.current())) {
        this.parseAggregate(depth + 1);
        continue;
      }
      if (this.tryParseFunction()) continue;
      this.index += 1;
    }
    if (this.current().value === '}') this.index += 1;
    if (this.current().value === ';') this.index += 1;
  }

  private tryParseFunction(): boolean {
    const start = this.index;
    let cursor = start;
    while (cursor < this.tokens.length) {
      const token = this.tokens[cursor];
      if (token.type === 'eof') return false;
      if (token.value === '{' || token.value === ';') return false;
      if (token.value === '=' || token.value === 'return') return false;
      if (token.value === '(') {
        const nameToken = this.tokens[cursor - 1];
        if (!nameToken || nameToken.type !== 'id') return false;
        if (CONTROL_NAMES.has(nameToken.lower)) return false;
        if (this.tokens[cursor - 2]?.value === '~') {
          // Destructors are valid functions.
        }
        const close = this.findMatching(cursor, '(', ')');
        if (close < 0) return false;
        let after = close + 1;
        while (after < this.tokens.length) {
          const next = this.tokens[after];
          if (next.value === '{') {
            const params = formatTokens(this.tokens.slice(cursor + 1, close));
            const bodyStart = after;
            const body = this.parseBlockAt(bodyStart);
            this.functions.push({
              name: nameToken.value,
              params,
              body,
              returns: true,
              line: nameToken.line,
            });
            this.index = this.indexAfterBlock(bodyStart);
            return true;
          }
          if (next.value === ';' || next.value === '=' || next.value === '=>') {
            return false;
          }
          after += 1;
        }
        return false;
      }
      cursor += 1;
    }
    return false;
  }

  private findMatching(
    start: number,
    open: string,
    close: string,
  ): number {
    let depth = 0;
    for (let cursor = start; cursor < this.tokens.length; cursor += 1) {
      if (this.tokens[cursor].value === open) depth += 1;
      if (this.tokens[cursor].value === close) {
        depth -= 1;
        if (depth === 0) return cursor;
      }
    }
    return -1;
  }

  private parseBlockAt(braceIndex: number): Statement[] {
    const token = this.tokens[braceIndex];
    if (!token || token.value !== '{') {
      throw new CodeParseError('Ожидалась открывающая фигурная скобка', token?.line ?? 1);
    }
    const saved = this.index;
    this.index = braceIndex + 1;
    const body = this.parseStatementList();
    if (this.current().value !== '}') {
      throw new CodeParseError('Не найдена закрывающая фигурная скобка', token.line);
    }
    this.index += 1;
    this.index = saved;
    return body;
  }

  private indexAfterBlock(braceIndex: number): number {
    let depth = 0;
    for (let cursor = braceIndex; cursor < this.tokens.length; cursor += 1) {
      if (this.tokens[cursor].value === '{') depth += 1;
      if (this.tokens[cursor].value === '}') {
        depth -= 1;
        if (depth === 0) return cursor + 1;
      }
    }
    return this.tokens.length - 1;
  }

  private parseStatementList(): Statement[] {
    const statements: Statement[] = [];
    while (!this.isEof()) {
      if (this.current().value === '}') break;
      if (this.current().value === ';') {
        this.index += 1;
        continue;
      }
      if (['case', 'default'].includes(this.current().lower)) {
        break;
      }
      const statement = this.parseStatement();
      if (statement) statements.push(statement);
    }
    return statements;
  }

  private parseStatement(): Statement | null {
    const token = this.current();
    if (!token || token.type === 'eof') return null;
    if (token.value === '}') return null;
    if (token.value === ';') {
      this.index += 1;
      return null;
    }
    if (token.value === '{') {
      return { type: 'block', body: this.parseBlock() };
    }
    if (token.lower === 'if') return this.parseIf();
    if (token.lower === 'while') return this.parseWhile();
    if (token.lower === 'do') return this.parseDo();
    if (token.lower === 'for') return this.parseFor();
    if (token.lower === 'foreach') return this.parseForEach();
    if (token.lower === 'switch') return this.parseSwitch();
    if (token.lower === 'return') return this.parseReturn();
    if (token.lower === 'break') {
      this.index += 1;
      if (this.current().value === ';') this.index += 1;
      return { type: 'break' };
    }
    if (token.lower === 'continue') {
      this.index += 1;
      if (this.current().value === ';') this.index += 1;
      return { type: 'continue' };
    }
    if (token.lower === 'try') return this.parseTry();
    if (
      ['using', 'lock', 'checked', 'unchecked', 'unsafe', 'fixed'].includes(
        token.lower,
      ) &&
      this.tokens[this.index + 1]?.value === '('
    ) {
      this.index += 1;
      const args = this.readParenContent();
      void args;
      const statement = this.parseStatement();
      return { type: 'block', body: statement ? [statement] : [] };
    }
    if (token.lower === 'using') {
      this.skipToSemicolon();
      return null;
    }
    if (token.lower === 'throw') {
      const tokens = this.readSimpleTokens();
      const text = formatTokens(tokens);
      return { type: 'simple', kind: 'process', text, code: text };
    }
    if (token.lower === 'case' || token.lower === 'default') return null;
    return this.parseSimple();
  }

  private parseBlock(): Statement[] {
    this.expect('{');
    const body = this.parseStatementList();
    this.expect('}');
    return body;
  }

  private parseIf(): Statement {
    this.index += 1;
    const conditionTokens = this.readParenContent();
    const sourceCondition = formatTokens(conditionTokens);
    const condition = conditionLabel(sanitizeCondition(sourceCondition));
    const thenStatement = this.parseStatement();
    const then = thenStatement ? [thenStatement] : [];
    let otherwise: Statement[] = [];
    if (this.current().lower === 'else') {
      this.index += 1;
      const elseStatement = this.parseStatement();
      otherwise = elseStatement ? [elseStatement] : [];
    }
    return {
      type: 'if',
      condition,
      sourceCondition,
      then,
      else: otherwise,
    };
  }

  private parseWhile(): Statement {
    this.index += 1;
    const conditionTokens = this.readParenContent();
    const sourceCondition = formatTokens(conditionTokens);
    const condition = conditionLabel(sanitizeCondition(sourceCondition));
    const bodyStatement = this.parseStatement();
    return {
      type: 'while',
      condition,
      sourceCondition,
      body: bodyStatement ? [bodyStatement] : [],
      mode: 'while',
    };
  }

  private parseDo(): Statement {
    this.index += 1;
    const bodyStatement = this.parseStatement();
    if (this.current().lower === 'while') this.index += 1;
    else throw new CodeParseError('После do ожидалось while', this.current().line);
    const conditionTokens = this.readParenContent();
    if (this.current().value === ';') this.index += 1;
    const sourceCondition = formatTokens(conditionTokens);
    return {
      type: 'while',
      condition: conditionLabel(sanitizeCondition(sourceCondition)),
      sourceCondition,
      body: bodyStatement ? [bodyStatement] : [],
      mode: 'do',
    };
  }

  private parseFor(): Statement {
    this.index += 1;
    const headerTokens = this.readParenContent();
    const halves: Token[][] = [[]];
    let depth = 0;
    for (const token of headerTokens) {
      if (token.value === '(' || token.value === '[') depth += 1;
      if (token.value === ')' || token.value === ']') depth -= 1;
      if (token.value === ';' && depth === 0) {
        halves.push([]);
      } else {
        halves[halves.length - 1].push(token);
      }
    }
    const init = formatTokens(halves[0] ?? []);
    const condition = formatTokens(halves[1] ?? []);
    const update = formatTokens(halves[2] ?? []);
    const bodyStatement = this.parseStatement();
    return {
      type: 'for',
      header: `для ${init || '…'}; ${condition || '…'}; ${update || '…'}`,
      init,
      condition: conditionLabel(sanitizeCondition(condition || 'истина')),
      sourceCondition: condition || 'true',
      update,
      body: bodyStatement ? [bodyStatement] : [],
    };
  }

  private parseForEach(): Statement {
    this.index += 1;
    const inside = this.readParenContent();
    let inIndex = -1;
    let depth = 0;
    inside.forEach((token, index) => {
      if (token.value === '(' || token.value === '[') depth += 1;
      if (token.value === ')' || token.value === ']') depth -= 1;
      if (token.lower === 'in' && depth === 0 && inIndex < 0) inIndex = index;
    });
    if (inIndex < 0) {
      throw new CodeParseError('Не удалось разобрать foreach', this.current().line);
    }
    const declaration = formatTokens(inside.slice(0, inIndex));
    const iterable = formatTokens(inside.slice(inIndex + 1));
    const variable = lastIdentifier(declaration);
    const bodyStatement = this.parseStatement();
    return {
      type: 'foreach',
      variable,
      iterable,
      header: `для каждого ${variable} из ${iterable}`,
      body: bodyStatement ? [bodyStatement] : [],
    };
  }

  private parseSwitch(): Statement {
    const start = this.current();
    this.index += 1;
    const subject = formatTokens(this.readParenContent());
    this.expect('{');
    const cases: { labels: string[]; body: Statement[] }[] = [];
    let defaultBody: Statement[] = [];
    while (!this.isEof() && this.current().value !== '}') {
      if (this.current().lower === 'case') {
        this.index += 1;
        const labels: string[] = [];
        let currentLabel: Token[] = [];
        while (!this.isEof() && this.current().value !== ':') {
          if (this.current().value === ',') {
            labels.push(formatTokens(currentLabel));
            currentLabel = [];
          } else {
            currentLabel.push(this.current());
          }
          this.index += 1;
        }
        if (currentLabel.length) labels.push(formatTokens(currentLabel));
        this.expect(':');
        const body = this.parseCaseBody();
        cases.push({ labels, body });
        continue;
      }
      if (this.current().lower === 'default') {
        this.index += 1;
        if (this.current().value === ':') this.index += 1;
        defaultBody = this.parseCaseBody();
        continue;
      }
      this.index += 1;
    }
    this.expect('}');
    this.warnings.push(
      `Строка ${start.line}: switch преобразован в цепочку условий.`,
    );
    let nested: Statement[] = defaultBody;
    for (let index = cases.length - 1; index >= 0; index -= 1) {
      const branch = cases[index];
      const condition = branch.labels
        .map((label) => `${subject} == ${label}`)
        .join(' или ');
      nested = [
        {
          type: 'if',
          condition: conditionLabel(condition),
          then: branch.body,
          else: nested,
        },
      ];
    }
    return { type: 'block', body: nested };
  }

  private parseCaseBody(): Statement[] {
    const body: Statement[] = [];
    while (!this.isEof()) {
      if (
        this.current().value === '}' ||
        this.current().lower === 'case' ||
        this.current().lower === 'default'
      ) {
        break;
      }
      if (this.current().value === ';') {
        this.index += 1;
        continue;
      }
      const statement = this.parseStatement();
      if (statement) body.push(statement);
    }
    if (body.length && body[body.length - 1].type === 'break') body.pop();
    return body;
  }

  private parseReturn(): Statement {
    this.index += 1;
    const tokens: Token[] = [];
    let depth = 0;
    while (!this.isEof()) {
      const token = this.current();
      if (depth === 0 && (token.value === ';' || token.value === '}')) break;
      if (token.value === '(' || token.value === '[') depth += 1;
      if (token.value === ')' || token.value === ']') depth -= 1;
      tokens.push(token);
      this.index += 1;
    }
    if (this.current().value === ';') this.index += 1;
    return { type: 'return', value: formatTokens(tokens) };
  }

  private parseTry(): Statement {
    const start = this.current();
    this.index += 1;
    this.warnings.push(
      `Строка ${start.line}: try/catch показан как обычный блок без ветвей исключений.`,
    );
    const body = this.parseBlock();
    while (
      this.current().lower === 'catch' ||
      this.current().lower === 'finally'
    ) {
      const keyword = this.current().lower;
      this.index += 1;
      if (keyword === 'catch' && this.current().value === '(') {
        this.readParenContent();
      }
      if (this.current().value === '{') {
        this.skipBalanced('{', '}');
      }
    }
    return { type: 'block', body };
  }

  private parseSimple(): Statement | null {
    const tokens = this.readSimpleTokens();
    if (this.current().value === ';') this.index += 1;
    const text = formatTokens(tokens);
    if (!text) return null;
    if (/^using\s+namespace\b/.test(text) || /^using\s+[\w:]+\s*$/.test(text)) {
      return null;
    }

    const lower = text.toLowerCase();
    if (/^(?:std::)?cout\b/.test(lower)) {
      return {
        type: 'simple',
        kind: 'io',
        text: outputFromStream(tokens, '<<'),
        code: text,
      };
    }
    if (/^(?:std::)?cin\b/.test(lower)) {
      return {
        type: 'simple',
        kind: 'io',
        text: inputFromStream(tokens, '>>'),
        code: text,
      };
    }
    if (/^(?:std::)?printf\s*\(/.test(lower)) {
      const open = text.indexOf('(');
      const close = text.lastIndexOf(')');
      return {
        type: 'simple',
        kind: 'io',
        text: formatPrintf(text.slice(open + 1, close)),
        code: text,
      };
    }
    if (/^(?:std::)?scanf\s*\(/.test(lower)) {
      return {
        type: 'simple',
        kind: 'io',
        text: scanInput(text),
        code: text,
      };
    }
    if (/^console\.(writeline|write)\b/.test(lower)) {
      return {
        type: 'simple',
        kind: 'io',
        text: consoleOutput(text),
        code: text,
      };
    }
    if (/^console\.(readline|read|readkey)\b/.test(lower)) {
      return {
        type: 'simple',
        kind: 'io',
        text: 'Ввод: клавиатура',
        code: text,
      };
    }
    if (/^(?:std::)?getline\s*\(/.test(lower)) {
      const vars = text
        .slice(text.indexOf('(') + 1, text.lastIndexOf(')'))
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      return {
        type: 'simple',
        kind: 'io',
        text: `Ввод: ${vars[vars.length - 1] ?? 'строка'}`,
        code: text,
      };
    }
    if (
      /\bconsole\.(readline|read|readkey)\s*\(/.test(lower) ||
      /(?:std::)?cin\s*>>/.test(lower)
    ) {
      const lhs = text.split('=')[0];
      return {
        type: 'simple',
        kind: 'io',
        text: `Ввод: ${lastIdentifier(lhs)}`,
        code: text,
      };
    }
    if (isOnlyDeclaration(text)) return null;
    return {
      type: 'simple',
      kind: 'process',
      text,
      code: text,
    };
  }

  private readSimpleTokens(): Token[] {
    const tokens: Token[] = [];
    let depth = 0;
    while (!this.isEof()) {
      const token = this.current();
      if (depth === 0) {
        if (token.value === ';' || token.value === '}') break;
        if (['else', 'case', 'default'].includes(token.lower)) break;
      }
      if (token.value === '(' || token.value === '[' || token.value === '{') {
        depth += 1;
      }
      if (token.value === ')' || token.value === ']' || token.value === '}') {
        depth -= 1;
      }
      tokens.push(token);
      this.index += 1;
    }
    return tokens;
  }

  private readParenContent(): Token[] {
    this.expect('(');
    const tokens: Token[] = [];
    let depth = 1;
    while (!this.isEof() && depth > 0) {
      const token = this.current();
      if (token.value === '(') depth += 1;
      if (token.value === ')') {
        depth -= 1;
        if (depth === 0) {
          this.index += 1;
          break;
        }
      }
      if (depth > 0) tokens.push(token);
      this.index += 1;
    }
    return tokens;
  }

  private skipToSemicolon(): void {
    while (!this.isEof() && this.current().value !== ';') {
      if (this.current().value === '{') {
        this.skipBalanced('{', '}');
        continue;
      }
      this.index += 1;
    }
    if (this.current().value === ';') this.index += 1;
  }

  private skipBalanced(open: string, close: string): void {
    if (this.current().value !== open) return;
    let depth = 0;
    while (!this.isEof()) {
      if (this.current().value === open) depth += 1;
      if (this.current().value === close) {
        depth -= 1;
        this.index += 1;
        if (depth === 0) return;
        continue;
      }
      this.index += 1;
    }
  }

  private expect(value: string): void {
    if (this.current().value !== value) {
      throw new CodeParseError(
        `Ожидалось «${value}», найдено «${this.current().value || 'конец файла'}»`,
        this.current().line,
      );
    }
    this.index += 1;
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private isEof(): boolean {
    return this.current().type === 'eof';
  }
}

function consoleOutput(text: string): string {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < 0) return 'Вывод:';
  const args = text.slice(open + 1, close);
  const parts = splitTopLevel(args);
  if (parts.length === 0) return 'Вывод:';
  if (/^["']/.test(parts[0]) && parts.length > 1) {
    const format = unescapeString(unquote(parts[0]));
    let index = 1;
    const result = format.replace(/\{\d*\}/g, () => {
      const value = parts[index]?.trim() ?? '…';
      index += 1;
      return unquote(value);
    });
    return `Вывод: ${result}`;
  }
  if (
    parts.length === 1 &&
    /["']/.test(parts[0]) &&
    /\s*\+\s*/.test(parts[0])
  ) {
    const concatenated = parts[0]
      .replace(/"([^"]*)"/g, '$1')
      .replace(/\s*\+\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return `Вывод: ${concatenated}`;
  }
  return `Вывод: ${parts.map((part) => unquote(part.trim())).join(', ')}`;
}

function scanInput(text: string): string {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < 0) return 'Ввод:';
  const parts = splitTopLevel(text.slice(open + 1, close));
  const variables = parts
    .slice(1)
    .map((part) => part.trim().replace(/^&/, ''))
    .filter(Boolean);
  return `Ввод: ${variables.join(', ') || 'данные'}`;
}

export function parseCFamily(
  source: string,
  language: 'cpp' | 'csharp',
): ParsedProgram {
  const tokens = tokenizeCFamily(source);
  if (tokens.length <= 1) {
    throw new CodeParseError(
      language === 'cpp' ? 'Введите код на C++' : 'Введите код на C#',
      1,
    );
  }
  return new CFamilyParser(tokens, language).parse();
}
