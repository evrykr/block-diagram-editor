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
  line: number;
}

const TWO_CHAR_SYMBOLS = new Set([':=', '<=', '>=', '<>', '..']);
const SINGLE_SYMBOLS = new Set([
  '+',
  '-',
  '*',
  '/',
  '=',
  '<',
  '>',
  '(',
  ')',
  '[',
  ']',
  ';',
  ':',
  ',',
  '.',
  '^',
  '@',
]);

function tokenizePascal(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  const text = source.replace(/\r\n?/g, '\n');

  const push = (type: Token['type'], value: string) => {
    tokens.push({ type, value, lower: value.toLowerCase(), line });
  };

  while (index < text.length) {
    const char = text[index];
    if (char === '\n') {
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '{') {
      while (index < text.length && text[index] !== '}') {
        if (text[index] === '\n') line += 1;
        index += 1;
      }
      index += 1;
      continue;
    }
    if (char === '(' && text[index + 1] === '*') {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === '*' && text[index + 1] === ')')
      ) {
        if (text[index] === '\n') line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "'") {
      index += 1;
      let value = '';
      while (index < text.length) {
        if (text[index] === "'") {
          if (text[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        if (text[index] === '\n') line += 1;
        value += text[index];
        index += 1;
      }
      push('str', value);
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
      while (index < text.length && /[0-9]/.test(text[index])) {
        value += text[index];
        index += 1;
      }
      if (text[index] === '.' && text[index + 1] !== '.') {
        value += '.';
        index += 1;
        while (index < text.length && /[0-9]/.test(text[index])) {
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
      push('num', value);
      continue;
    }
    const pair = text.slice(index, index + 2);
    if (TWO_CHAR_SYMBOLS.has(pair)) {
      push('sym', pair);
      index += 2;
      continue;
    }
    if (SINGLE_SYMBOLS.has(char)) {
      push('sym', char);
      index += 1;
      continue;
    }
    // Unknown characters are kept so that the rest of the source stays parseable.
    push('sym', char);
    index += 1;
  }
  tokens.push({ type: 'eof', value: '', lower: '', line });
  return tokens;
}

function tokensToExpression(tokens: Token[]): string {
  let result = '';
  const noSpaceBefore = new Set([')', ']', ',', ';', '.', ':', '..', '^']);
  const noSpaceAfter = new Set(['(', '[', '.', '@']);
  let previous = '';
  for (const token of tokens) {
    const value =
      token.type === 'str' ? `'${token.value.replace(/'/g, "''")}'` : token.value;
    if (!result) {
      result = value;
    } else if (noSpaceBefore.has(value) || noSpaceAfter.has(previous)) {
      result += value;
    } else if (value === '(' && /^[A-Za-z_]\w*$/.test(previous)) {
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
    .replace(/\band\b/gi, 'и')
    .replace(/\bor\b/gi, 'или')
    .replace(/\bnot\b/gi, 'не')
    .replace(/\btrue\b/gi, 'истина')
    .replace(/\bfalse\b/gi, 'ложь')
    .replace(/\bnil\b/gi, 'null');
}

function outputText(args: string): string {
  const parts = splitTopLevel(args);
  const hasString = parts.some(
    (part) =>
      (part.trim().startsWith("'") && part.trim().endsWith("'")) ||
      (part.trim().startsWith('"') && part.trim().endsWith('"')),
  );
  const values = parts.map((part) => {
    const value = part.trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      return unquote(value).trim();
    }
    return value.trim();
  });
  return `Вывод: ${values.filter(Boolean).join(hasString ? ' ' : ', ')}`;
}

class PascalParser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly functions: FunctionDef[] = [];
  private readonly warnings: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ParsedProgram {
    let body: Statement[] = [];
    while (!this.isEof()) {
      const token = this.current();
      if (token.lower === 'program' || token.lower === 'library') {
        this.skipToSemicolon();
        continue;
      }
      if (token.lower === 'uses') {
        this.skipToSemicolon();
        continue;
      }
      if (token.lower === 'procedure' || token.lower === 'function') {
        this.parseRoutine();
        continue;
      }
      if (token.lower === 'begin') {
        this.index += 1;
        body = this.parseStatementsUntil(['end']);
        this.expect('end');
        break;
      }
      this.index += 1;
    }
    if (!body.length && !this.functions.length) {
      throw new CodeParseError(
        'Не найден блок begin … end с операторами программы',
        1,
      );
    }
    return {
      language: 'pascal',
      functions: this.functions,
      body,
      warnings: this.warnings,
    };
  }

  private parseRoutine(): void {
    const start = this.current();
    const kind = start.lower === 'function' ? 'function' : 'procedure';
    this.index += 1;
    const nameToken = this.current();
    if (nameToken.type !== 'id') {
      throw new CodeParseError('Не найдено имя подпрограммы', start.line);
    }
    const name = nameToken.value;
    this.index += 1;
    let params = '';
    if (this.current().value === '(') {
      const open = this.index;
      this.skipBalanced('(', ')');
      params = tokensToExpression(this.tokens.slice(open + 1, this.index - 1));
    }
    let forward = false;
    while (!this.isEof() && this.current().lower !== 'begin') {
      if (this.current().lower === 'forward') forward = true;
      if (this.current().value === ';' && forward) {
        this.index += 1;
        return;
      }
      this.index += 1;
    }
    if (this.current().lower !== 'begin') return;
    this.index += 1;
    const body = this.parseStatementsUntil(['end']);
    this.expect('end');
    if (this.current().value === ';') this.index += 1;
    this.functions.push({
      name,
      params,
      body,
      returns: kind === 'function',
      line: start.line,
    });
  }

  private parseStatementsUntil(stopWords: string[]): Statement[] {
    const statements: Statement[] = [];
    while (!this.isEof()) {
      if (stopWords.includes(this.current().lower)) break;
      if (this.current().value === ';') {
        this.index += 1;
        continue;
      }
      const statement = this.parseStatement();
      if (statement) statements.push(statement);
    }
    return statements;
  }

  private parseStatement(): Statement | null {
    const token = this.current();
    if (token.type === 'eof') return null;
    if (token.value === ';') {
      this.index += 1;
      return null;
    }
    if (token.lower === 'begin') {
      this.index += 1;
      const body = this.parseStatementsUntil(['end']);
      this.expect('end');
      return { type: 'block', body };
    }
    if (token.lower === 'if') return this.parseIf();
    if (token.lower === 'while') return this.parseWhile();
    if (token.lower === 'for') return this.parseFor();
    if (token.lower === 'repeat') return this.parseRepeat();
    if (token.lower === 'case') return this.parseCase();
    if (token.lower === 'with') {
      this.index += 1;
      this.readUntil([], ['do']);
      this.expect('do');
      const inner = this.parseStatement();
      this.warnings.push(
        `Строка ${token.line}: with разворачивается в обычный блок.`,
      );
      return { type: 'block', body: inner ? [inner] : [] };
    }
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
    if (token.lower === 'exit' || token.lower === 'halt') {
      this.index += 1;
      const value: string[] = [];
      while (!this.isEof() && this.current().value !== ';') {
        value.push(this.current().value);
        this.index += 1;
      }
      if (this.current().value === ';') this.index += 1;
      return { type: 'return', value: value.join(' ') };
    }
    if (
      token.lower === 'writeln' ||
      token.lower === 'write' ||
      token.lower === 'readln' ||
      token.lower === 'read'
    ) {
      return this.parseIo();
    }
    if (
      token.lower === 'var' ||
      token.lower === 'const' ||
      token.lower === 'type' ||
      token.lower === 'label'
    ) {
      this.skipToSemicolon();
      return null;
    }
    return this.parseSimple();
  }

  private parseIf(): Statement {
    this.index += 1;
    const conditionTokens = this.readUntil([], ['then']);
    this.expect('then');
    const thenStatement = this.parseStatement();
    const then = thenStatement ? [thenStatement] : [];
    while (this.current().value === ';' && this.tokens[this.index + 1]?.lower === 'else') {
      this.index += 1;
    }
    let otherwise: Statement[] = [];
    if (this.current().lower === 'else') {
      this.index += 1;
      const elseStatement = this.parseStatement();
      otherwise = elseStatement ? [elseStatement] : [];
    }
    const sourceCondition = tokensToExpression(conditionTokens);
    return {
      type: 'if',
      condition: conditionLabel(sanitizeCondition(sourceCondition)),
      sourceCondition,
      then,
      else: otherwise,
    };
  }

  private parseWhile(): Statement {
    this.index += 1;
    const conditionTokens = this.readUntil([], ['do']);
    this.expect('do');
    const bodyStatement = this.parseStatement();
    const sourceCondition = tokensToExpression(conditionTokens);
    return {
      type: 'while',
      condition: conditionLabel(sanitizeCondition(sourceCondition)),
      sourceCondition,
      body: bodyStatement ? [bodyStatement] : [],
      mode: 'while',
    };
  }

  private parseFor(): Statement {
    this.index += 1;
    const variableTokens: Token[] = [];
    while (!this.isEof() && this.current().value !== ':=') {
      variableTokens.push(this.current());
      this.index += 1;
    }
    this.expect(':=');
    const initTokens = this.readUntil(['to', 'downto'], ['do']);
    const descending =
      this.current().lower === 'downto' || this.tokens[this.index - 1]?.lower === 'downto';
    if (this.current().lower === 'to' || this.current().lower === 'downto') {
      this.index += 1;
    }
    const endTokens = this.readUntil([], ['do']);
    this.expect('do');
    const bodyStatement = this.parseStatement();
    const variable = tokensToExpression(variableTokens);
    const end = tokensToExpression(endTokens);
    return {
      type: 'for',
      header: `для ${variable} от ${tokensToExpression(initTokens)} до ${end}`,
      init: `${variable} := ${tokensToExpression(initTokens)}`,
      condition: conditionLabel(
        `${variable} ${descending ? '>=' : '<='} ${end}`,
      ),
      sourceCondition: `${variable} ${descending ? '>=' : '<='} ${end}`,
      update: `${variable} := ${variable} ${descending ? '-' : '+'} 1`,
      body: bodyStatement ? [bodyStatement] : [],
    };
  }

  private parseRepeat(): Statement {
    this.index += 1;
    const body = this.parseStatementsUntil(['until']);
    this.expect('until');
    const conditionTokens = this.readUntil([], [';']);
    if (this.current().value === ';') this.index += 1;
    const sourceCondition = tokensToExpression(conditionTokens);
    return {
      type: 'while',
      condition: conditionLabel(sanitizeCondition(sourceCondition)),
      sourceCondition,
      body,
      mode: 'do',
    };
  }

  private parseCase(): Statement {
    const start = this.current();
    this.index += 1;
    const subjectTokens = this.readUntil([], ['of']);
    this.expect('of');
    const branches: { labels: string[]; body: Statement[] }[] = [];
    let elseBody: Statement[] = [];
    while (!this.isEof() && this.current().lower !== 'end') {
      if (this.current().lower === 'else') {
        this.index += 1;
        elseBody = this.parseStatementsUntil(['end']);
        break;
      }
      const labels: string[] = [];
      while (!this.isEof() && this.current().value !== ':') {
        const token = this.current();
        if (token.value !== ',') {
          labels.push(
            token.type === 'str' ? `'${token.value}'` : token.value,
          );
        }
        this.index += 1;
      }
      this.expect(':');
      const bodyStatement = this.parseStatement();
      if (this.current().value === ';') this.index += 1;
      if (bodyStatement) branches.push({ labels, body: [bodyStatement] });
    }
    this.expect('end');
    this.warnings.push(
      `Строка ${start.line}: case преобразован в цепочку условий.`,
    );
    const subject = tokensToExpression(subjectTokens);
    let nested: Statement[] = elseBody;
    for (let index = branches.length - 1; index >= 0; index -= 1) {
      const branch = branches[index];
      const condition = branch.labels
        .map((label) => `${subject} = ${label}`)
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

  private parseIo(): Statement {
    const start = this.current();
    const isInput = start.lower === 'read' || start.lower === 'readln';
    this.index += 1;
    let args = '';
    if (this.current().value === '(') {
      const open = this.index;
      this.skipBalanced('(', ')');
      args = tokensToExpression(this.tokens.slice(open + 1, this.index - 1));
    } else {
      const tokens = this.readUntil([], [';']);
      args = tokensToExpression(tokens);
    }
    if (this.current().value === ';') this.index += 1;
    if (isInput) {
      return {
        type: 'simple',
        kind: 'io',
        text: `Ввод: ${args || 'данные'}`,
        code: `${start.lower}(${args})`,
      };
    }
    return {
      type: 'simple',
      kind: 'io',
      text: outputText(args),
      code: `${start.lower}(${args})`,
    };
  }

  private parseSimple(): Statement | null {
    const tokens = this.readUntil(['else', 'end', 'until'], [';']);
    if (this.current().value === ';') this.index += 1;
    if (!tokens.length) return null;
    const text = tokensToExpression(tokens);
    if (!text) return null;
    if (/^inc\s*\(/i.test(text) || /^dec\s*\(/i.test(text)) {
      return { type: 'simple', kind: 'process', text, code: text };
    }
    return { type: 'simple', kind: 'process', text, code: text };
  }

  private readUntil(stopWords: string[], stopSymbols: string[]): Token[] {
    const tokens: Token[] = [];
    let depth = 0;
    while (!this.isEof()) {
      const token = this.current();
      if (
        depth === 0 &&
        (stopWords.includes(token.lower) || stopSymbols.includes(token.value))
      ) {
        break;
      }
      if (token.value === '(' || token.value === '[') depth += 1;
      if (token.value === ')' || token.value === ']') depth -= 1;
      tokens.push(token);
      this.index += 1;
    }
    return tokens;
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

  private skipToSemicolon(): void {
    while (!this.isEof() && this.current().value !== ';') {
      if (this.current().value === '(') {
        this.skipBalanced('(', ')');
        continue;
      }
      this.index += 1;
    }
    if (this.current().value === ';') this.index += 1;
  }

  private expect(value: string): void {
    if (this.current().lower === value.toLowerCase() || this.current().value === value) {
      this.index += 1;
      return;
    }
    throw new CodeParseError(
      `Ожидалось «${value}», найдено «${this.current().value || 'конец файла'}»`,
      this.current().line,
    );
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private isEof(): boolean {
    return this.current().type === 'eof';
  }
}

export function parsePascal(source: string): ParsedProgram {
  const tokens = tokenizePascal(source);
  if (tokens.length <= 1) {
    throw new CodeParseError('Введите код на Pascal', 1);
  }
  return new PascalParser(tokens).parse();
}
