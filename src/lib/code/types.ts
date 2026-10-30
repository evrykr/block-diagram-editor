export type Language = 'python' | 'pascal' | 'cpp' | 'csharp';

export interface SimpleStatement {
  type: 'simple';
  kind: 'process' | 'io' | 'comment';
  text: string;
  code?: string;
}

export interface IfStatement {
  type: 'if';
  condition: string;
  sourceCondition?: string;
  then: Statement[];
  else: Statement[];
}

export interface WhileStatement {
  type: 'while';
  condition: string;
  sourceCondition?: string;
  body: Statement[];
  /** while is the default; do renders the condition after the body. */
  mode?: 'while' | 'do';
}

export interface ForStatement {
  type: 'for';
  header: string;
  init: string;
  condition: string;
  sourceCondition?: string;
  update: string;
  body: Statement[];
}

export interface ForEachStatement {
  type: 'foreach';
  variable: string;
  iterable: string;
  body: Statement[];
  header: string;
}

export interface BreakStatement {
  type: 'break';
}

export interface ContinueStatement {
  type: 'continue';
}

export interface ReturnStatement {
  type: 'return';
  value: string;
}

export interface BlockStatement {
  type: 'block';
  body: Statement[];
}

export type Statement =
  | SimpleStatement
  | IfStatement
  | WhileStatement
  | ForStatement
  | ForEachStatement
  | BreakStatement
  | ContinueStatement
  | ReturnStatement
  | BlockStatement;

export interface FunctionDef {
  name: string;
  params: string;
  body: Statement[];
  returns: boolean;
  line: number;
}

export interface ParsedProgram {
  language: Language;
  functions: FunctionDef[];
  body: Statement[];
  warnings: string[];
}

export class CodeParseError extends Error {
  line: number;

  constructor(message: string, line = 1) {
    super(message);
    this.name = 'CodeParseError';
    this.line = line;
  }
}

export function conditionLabel(expression: string): string {
  const clean = expression.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  if (!clean) return 'Условие?';
  return /[?]$/.test(clean) ? clean : `${clean}?`;
}

export function stripOuterParens(value: string): string {
  let text = value.trim();
  while (text.startsWith('(') && text.endsWith(')')) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      if (text[index] === ')') depth -= 1;
      if (depth === 0 && index < text.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function splitTopLevel(
  value: string,
  separator = ',',
  limit = Number.POSITIVE_INFINITY,
): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      current += char;
      if (char === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === separator && depth === 0 && result.length < limit - 1) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() || result.length > 0) result.push(current.trim());
  return result;
}

export function findMatchingParen(
  value: string,
  openIndex: number,
): number {
  const open = value[openIndex];
  const close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function unquote(value: string): string {
  const text = value.trim();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  python: 'Python',
  pascal: 'Pascal',
  cpp: 'C++',
  csharp: 'C#',
};

export const LANGUAGE_EXTENSIONS: Record<Language, string> = {
  python: 'py',
  pascal: 'pas',
  cpp: 'cpp',
  csharp: 'cs',
};
