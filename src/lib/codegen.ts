import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  Language,
} from '../types/diagram';
import { LANGUAGE_NAMES } from './code/types';

export interface GeneratedCode {
  code: string;
  language: Language;
  warnings: string[];
  statements: number;
  decisions: number;
  loops: number;
}

interface Context {
  diagram: Diagram;
  nodes: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  outgoing: Map<string, DiagramEdge[]>;
  backSources: Map<string, string[]>;
  language: Language;
  warnings: string[];
  visited: Set<string>;
  variables: Set<string>;
  statements: number;
  decisions: number;
  loops: number;
  endIds: Set<string>;
}

const CYRILLIC = /[А-Яа-яЁё]/;

function indentLines(lines: string[], level: number): string[] {
  const prefix = '    '.repeat(level);
  return lines.map((line) => (line ? `${prefix}${line}` : line));
}

function isEndNode(node: DiagramNode): boolean {
  return node.kind === 'end' || /^конец$/i.test(node.text.trim());
}

function isStartNode(node: DiagramNode): boolean {
  return node.kind === 'start' || /^начало$/i.test(node.text.trim());
}

function edgeIsYes(edge: DiagramEdge): boolean {
  return (
    edge.branch === 'yes' ||
    /^(да|yes|true)$/i.test((edge.label ?? '').trim())
  );
}

function edgeIsNo(edge: DiagramEdge): boolean {
  return (
    edge.branch === 'no' ||
    edge.loopExit === true ||
    /^(нет|no|false)$/i.test((edge.label ?? '').trim())
  );
}

function findStartNode(diagram: Diagram): DiagramNode | undefined {
  const start = diagram.nodes.find(isStartNode);
  if (start) return start;
  const incoming = new Set(diagram.edges.map((edge) => edge.to));
  const candidates = diagram.nodes.filter(
    (node) => !incoming.has(node.id) && !isEndNode(node),
  );
  return candidates[0] ?? diagram.nodes.find((node) => !isEndNode(node));
}

function commentPrefix(language: Language): string {
  return language === 'pascal' ? '//' : language === 'python' ? '#' : '//';
}

function makeComment(text: string, language: Language): string {
  return `${commentPrefix(language)} ${text.replace(/\s+/g, ' ').trim()}`;
}

function escapeString(value: string, language: Language): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  if (language === 'pascal') return `'${escaped.replace(/'/g, "''")}'`;
  if (language === 'csharp') return `"${escaped.replace(/"/g, '\\"')}"`;
  return `"${escaped.replace(/"/g, '\\"')}"`;
}

function stripTrailingSemicolon(value: string): string {
  return value.trim().replace(/;\s*$/, '').trim();
}

function convertQuotes(value: string, language: Language): string {
  const text = value.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return escapeString(text.slice(1, -1), language);
  }
  return value;
}

function normalizeCondition(
  expression: string,
  language: Language,
): { code: string; natural: boolean } {
  let value = expression
    .trim()
    .replace(/[?;]\s*$/, '')
    .replace(/(?<![\p{L}\p{N}_])и(?![\p{L}\p{N}_])/gu, ' && ')
    .replace(/(?<![\p{L}\p{N}_])или(?![\p{L}\p{N}_])/gu, ' || ')
    .replace(/(?<![\p{L}\p{N}_])не(?![\p{L}\p{N}_])/gu, ' ! ')
    .replace(/(?<![\p{L}\p{N}_])истина(?![\p{L}\p{N}_])/giu, ' true ')
    .replace(/(?<![\p{L}\p{N}_])ложь(?![\p{L}\p{N}_])/giu, ' false ')
    .replace(/\s+/g, ' ');
  if (language === 'python') {
    value = value
      .replace(/&&/g, ' and ')
      .replace(/\|\|/g, ' or ')
      .replace(/!(?!=)/g, ' not ')
      .replace(/\btrue\b/g, 'True')
      .replace(/\bfalse\b/g, 'False')
      .replace(/<>/g, '!=')
      .replace(/\bmod\b/g, '%');
    value = value.replace(/\bnot\s+not\b/g, 'not');
  } else if (language === 'pascal') {
    value = value
      .replace(/&&/g, ' and ')
      .replace(/\|\|/g, ' or ')
      .replace(/!(?!=)/g, ' not ')
      .replace(/!=/g, '<>')
      .replace(/\btrue\b/g, 'true')
      .replace(/\bfalse\b/g, 'false')
      .replace(/%/g, ' mod ');
  } else {
    value = value
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!')
      .replace(/<>/g, '!=')
      .replace(/\bmod\b/g, '%')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');
  }
  value = value.replace(/\s+/g, ' ').trim();
  return { code: value || 'true', natural: CYRILLIC.test(value) };
}

function looksLikeCode(text: string, variables: Set<string>): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/[=<>+*/%]|:=|\+\+|--/.test(value)) return true;
  if (/^[A-Za-z_]\w*\s*\(/.test(value)) return true;
  if (/^(return|break|continue|throw|yield|goto)\b/i.test(value)) return true;
  if (/^[A-Za-z_]\w*$/.test(value)) return variables.has(value);
  if (!CYRILLIC.test(value) && /[A-Za-z_]\w*\s*[.[(]/.test(value)) return true;
  return false;
}

function naturalText(value: string): boolean {
  return CYRILLIC.test(value) && !/[=<>+\-*/%]|:=/.test(value);
}

function convertProcess(
  node: DiagramNode,
  language: Language,
  sourceLanguage: Language | undefined,
  variables: Set<string>,
): string | null {
  let value = node.code?.trim() || node.text.trim();
  if (!value) return null;
  if (node.code && sourceLanguage === language) {
    value = stripTrailingSemicolon(value);
  } else {
    value = stripTrailingSemicolon(value)
      .replace(/:=/g, '=')
      .replace(/<>/g, '!=')
      .replace(/\bdiv\b/g, '/');
  }
  if (/^return\b/i.test(value)) {
    const expression = value.replace(/^return\b/i, '').trim();
    if (language === 'pascal') {
      return expression ? `exit(${expression});` : 'exit;';
    }
    if (language === 'python') {
      return expression ? `return ${expression}` : 'return';
    }
    return expression ? `return ${expression};` : 'return;';
  }
  if (/^break$/i.test(value)) return 'break';
  if (/^continue$/i.test(value)) return 'continue';
  if (naturalText(value) || (!looksLikeCode(value, variables) && CYRILLIC.test(value))) {
    return null;
  }
  if (language === 'python') {
    let python = value
      .replace(/;\s*$/, '')
      .replace(/^(?:const\s+)?(?:unsigned\s+|signed\s+|long\s+|short\s+)*(?:int|float|double|char|bool|boolean|string|var|auto|byte|decimal|object|dynamic|size_t)\s+(?=[A-Za-z_])/i, '')
      .replace(/\btrue\b/g, 'True')
      .replace(/\bfalse\b/g, 'False')
      .replace(/\bnull\b/g, 'None');
    python = python.replace(/([A-Za-z_]\w*)\s*\+\+/g, '$1 += 1');
    python = python.replace(/([A-Za-z_]\w*)\s*--/g, '$1 -= 1');
    return python;
  }
  if (language === 'pascal') {
    let pascal = value.replace(/;\s*$/, '');
    const compound = pascal.match(
      /^([A-Za-z_][\w.[\]]*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/,
    );
    if (compound) {
      const operator = compound[2][0];
      pascal = `${compound[1]} := ${compound[1]} ${operator} (${compound[3]})`;
    } else {
      const increment = pascal.match(
        /^([A-Za-z_][\w.[\]]*)\s*(\+\+|--)$/,
      );
      if (increment) {
        pascal = `${increment[1]} := ${increment[1]} ${
          increment[2] === '++' ? '+' : '-'
        } 1`;
      } else if (
        /^[A-Za-z_][\w.[\]]*\s*=(?!=)/.test(pascal) &&
        !/^if\b/i.test(pascal)
      ) {
        pascal = pascal.replace(/\s*=(?!=)\s*/, ' := ');
      }
    }
    return `${pascal};`;
  }
  return `${value.replace(/;\s*$/, '')};`;
}

function quoteOrExpression(
  value: string,
  language: Language,
  variables: Set<string>,
): string {
  const expression = value.trim();
  if (!expression) return language === 'pascal' ? "''" : '""';
  if (
    (expression.startsWith('"') && expression.endsWith('"')) ||
    (expression.startsWith("'") && expression.endsWith("'"))
  ) {
    return convertQuotes(expression, language);
  }
  if (/^[-\d.]+$/.test(expression)) return expression;
  if (/[+*/%<>=!&|()[\]{}]|:=/.test(expression)) {
    return expression
      .replace(/:=/g, '=')
      .replace(/<>/g, '!=')
      .replace(/\btrue\b/g, language === 'python' ? 'True' : 'true')
      .replace(/\bfalse\b/g, language === 'python' ? 'False' : 'false');
  }
  if (/^[A-Za-z_]\w*$/.test(expression)) {
    return variables.has(expression)
      ? expression
      : escapeString(expression, language);
  }
  return escapeString(expression, language);
}

function ioLines(
  node: DiagramNode,
  language: Language,
  sourceLanguage: Language | undefined,
  variables: Set<string>,
): { lines: string[]; natural: boolean } {
  const label = node.text.trim();
  if (node.code && sourceLanguage === language) {
    const raw = stripTrailingSemicolon(node.code);
    if (language === 'pascal' || language === 'cpp' || language === 'csharp') {
      return { lines: [`${raw};`], natural: false };
    }
    return { lines: [raw], natural: false };
  }
  const match = label.match(/^(Ввод|Вывод|Input|Output)\s*:\s*([\s\S]*)$/i);
  if (!match) {
    return {
      lines: [makeComment(label || 'Действие', language)],
      natural: true,
    };
  }
  const direction = match[1].toLowerCase();
  const payload = match[2].trim();
  if (direction === 'ввод' || direction === 'input') {
    const targets = payload
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (targets.length === 0) {
      return {
        lines: [makeComment('Ввод данных', language)],
        natural: true,
      };
    }
    if (language === 'python') {
      return {
        lines: targets.map((target) => `${target} = input()`),
        natural: false,
      };
    }
    if (language === 'pascal') {
      return { lines: [`readln(${targets.join(', ')});`], natural: false };
    }
    if (language === 'cpp') {
      return {
        lines: [`cin >> ${targets.join(' >> ')};`],
        natural: false,
      };
    }
    return {
      lines: targets.map((target) => `${target} = Console.ReadLine();`),
      natural: false,
    };
  }
  const expression = quoteOrExpression(payload, language, variables);
  if (language === 'python') return { lines: [`print(${expression})`], natural: false };
  if (language === 'pascal') return { lines: [`writeln(${expression});`], natural: false };
  if (language === 'cpp') {
    return { lines: [`cout << ${expression} << endl;`], natural: false };
  }
  return { lines: [`Console.WriteLine(${expression});`], natural: false };
}

function collectVariables(diagram: Diagram): Set<string> {
  const variables = new Set<string>();
  for (const node of diagram.nodes) {
    if (node.kind === 'io') {
      const match = node.text.match(/^Ввод\s*:\s*(.+)$/i);
      if (match) {
        for (const part of match[1].split(',')) {
          const name = part.trim();
          if (/^[A-Za-z_]\w*$/.test(name)) variables.add(name);
        }
      }
    }
    const source = node.code || node.text;
    const assignment = source.match(
      /^(?:const\s+)?(?:int|float|double|char|bool|boolean|string|var|auto|long|short|byte|decimal|object|dynamic)?\s*([A-Za-z_]\w*)\s*(?::=|=)(?!=)/,
    );
    if (assignment) variables.add(assignment[1]);
  }
  return variables;
}

function bfsDistances(
  start: string | undefined,
  outgoing: Map<string, DiagramEdge[]>,
  backEdges: Set<string>,
  limit = 80,
): Map<string, number> {
  const distances = new Map<string, number>();
  if (!start) return distances;
  const queue: { id: string; distance: number }[] = [
    { id: start, distance: 0 },
  ];
  while (queue.length) {
    const item = queue.shift()!;
    if (item.distance > limit || distances.has(item.id)) continue;
    distances.set(item.id, item.distance);
    for (const edge of outgoing.get(item.id) ?? []) {
      if (backEdges.has(edge.id)) continue;
      if (!distances.has(edge.to)) {
        queue.push({ id: edge.to, distance: item.distance + 1 });
      }
    }
  }
  return distances;
}

function findJoin(
  first: string | undefined,
  second: string | undefined,
  outgoing: Map<string, DiagramEdge[]>,
  backEdges: Set<string>,
): string | null {
  if (!first) return second ?? null;
  if (!second) return first;
  const distancesA = bfsDistances(first, outgoing, backEdges);
  const distancesB = bfsDistances(second, outgoing, backEdges);
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [id, distanceA] of distancesA) {
    const distanceB = distancesB.get(id);
    if (distanceB === undefined) continue;
    const score = Math.max(distanceA, distanceB) * 100 + distanceA + distanceB;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function addStop(stop: Set<string>, nodeId: string | null): Set<string> {
  if (!nodeId) return stop;
  const next = new Set(stop);
  next.add(nodeId);
  return next;
}

function bodyOrPass(lines: string[], language: Language, level: number): string[] {
  if (lines.length > 0) return lines;
  if (language === 'python') return [ `${'    '.repeat(level)}pass` ];
  return [];
}

function formatIf(
  condition: string,
  thenLines: string[],
  elseLines: string[],
  language: Language,
  level: number,
): string[] {
  const indent = '    '.repeat(level);
  const nested = '    '.repeat(level + 1);
  const result: string[] = [];
  if (language === 'python') {
    result.push(`${indent}if ${condition}:`);
    result.push(...bodyOrPass(thenLines, language, level + 1));
    if (elseLines.length > 0) {
      result.push(`${indent}else:`);
      result.push(...bodyOrPass(elseLines, language, level + 1));
    }
    return result;
  }
  if (language === 'pascal') {
    result.push(`${indent}if ${condition} then`);
    result.push(`${indent}begin`);
    result.push(...(thenLines.length ? thenLines : [`${nested};`]));
    result.push(`${indent}end`);
    if (elseLines.length > 0) {
      result.push(`${indent}else`);
      result.push(`${indent}begin`);
      result.push(...(elseLines.length ? elseLines : [`${nested};`]));
      result.push(`${indent}end;`);
    } else {
      result[result.length - 1] = `${indent}end;`;
    }
    return result;
  }
  result.push(`${indent}if (${condition}) {`);
  result.push(...(thenLines.length ? thenLines : [`${nested}// пусто`]));
  if (elseLines.length > 0) {
    result.push(`${indent}} else {`);
    result.push(...(elseLines.length ? elseLines : [`${nested}// пусто`]));
  }
  result.push(`${indent}}`);
  return result;
}

function formatWhile(
  condition: string,
  bodyLines: string[],
  language: Language,
  level: number,
): string[] {
  const indent = '    '.repeat(level);
  const nested = '    '.repeat(level + 1);
  if (language === 'python') {
    return [`${indent}while ${condition}:`, ...bodyOrPass(bodyLines, language, level + 1)];
  }
  if (language === 'pascal') {
    return [
      `${indent}while ${condition} do`,
      `${indent}begin`,
      ...(bodyLines.length ? bodyLines : [`${nested};`]),
      `${indent}end;`,
    ];
  }
  return [
    `${indent}while (${condition}) {`,
    ...(bodyLines.length ? bodyLines : [`${nested}// пусто`]),
    `${indent}}`,
  ];
}

function emitCode(
  startId: string | undefined,
  stop: Set<string>,
  level: number,
  context: Context,
): string[] {
  let current = startId;
  while (current && !stop.has(current)) {
    const node = context.nodes.get(current);
    if (!node) break;
    if (isEndNode(node)) break;
    if (context.visited.has(current)) {
      context.warnings.push(
        `Узел «${node.text}» образует цикл без условия — он показан комментарием.`,
      );
      return [ ...indentLines([makeComment(`Повторный переход: ${node.text}`, context.language)], level) ];
    }
    if (level > 30) {
      context.warnings.push('Достигнута слишком глубокая вложенность — вывод остановлен.');
      break;
    }
    context.visited.add(current);

    if (node.kind === 'decision') {
      context.decisions += 1;
      return emitDecision(node, stop, level, context);
    }

    if (node.kind === 'comment') {
      return [
        ...indentLines([makeComment(node.text, context.language)], level),
        ...emitCode(nextNode(node.id, context), stop, level, context),
      ];
    }
    if (node.kind === 'connector') {
      return emitCode(nextNode(node.id, context), stop, level, context);
    }
    if (isStartNode(node)) {
      current = nextNode(node.id, context);
      continue;
    }

    if (node.kind === 'process') {
      const line = convertProcess(
        node,
        context.language,
        context.diagram.sourceLanguage,
        context.variables,
      );
      context.statements += 1;
      const lines = line
        ? indentLines([line], level)
        : indentLines([makeComment(node.text, context.language)], level);
      return [...lines, ...emitCode(nextNode(node.id, context), stop, level, context)];
    }
    if (node.kind === 'io') {
      const io = ioLines(
        node,
        context.language,
        context.diagram.sourceLanguage,
        context.variables,
      );
      context.statements += 1;
      return [
        ...indentLines(io.lines, level),
        ...emitCode(nextNode(node.id, context), stop, level, context),
      ];
    }
    if (node.kind === 'preparation') {
      return [
        ...indentLines([makeComment(node.text, context.language)], level),
        ...emitCode(nextNode(node.id, context), stop, level, context),
      ];
    }
    current = nextNode(node.id, context);
  }
  return [];
}

function nextNode(nodeId: string, context: Context): string | undefined {
  return context.outgoing.get(nodeId)?.[0]?.to;
}

function emitDecision(
  node: DiagramNode,
  stop: Set<string>,
  level: number,
  context: Context,
): string[] {
  const outgoing = context.outgoing.get(node.id) ?? [];
  const backSources = context.backSources.get(node.id) ?? [];
  if (outgoing.length === 0) {
    context.warnings.push(
      `У решения «${node.text}» нет исходящих связей — ветвление пропущено.`,
    );
    return [];
  }

  if (backSources.length > 0) {
    context.loops += 1;
    const exitEdge =
      outgoing.find((edge) => edge.loopExit || edgeIsNo(edge)) ??
      outgoing.find((edge) => !edgeIsYes(edge));
    const bodyEdge =
      outgoing.find((edge) => edgeIsYes(edge)) ??
      outgoing.find((edge) => edge.id !== exitEdge?.id);
    const condition = decisionCondition(node, context.language, context.warnings);
    if (!bodyEdge) {
      return indentLines([makeComment(`Цикл: ${node.text}`, context.language)], level);
    }
    const body = emitCode(
      bodyEdge.to,
      addStop(stop, node.id),
      level + 1,
      context,
    );
    const after = exitEdge
      ? emitCode(exitEdge.to, stop, level, context)
      : [];
    return [...formatWhile(condition.code, body, context.language, level), ...after];
  }

  if (outgoing.length === 1) {
    context.warnings.push(
      `У решения «${node.text}» только один выход — условие пропущено.`,
    );
    return emitCode(outgoing[0].to, stop, level, context);
  }

  const yesEdge =
    outgoing.find((edge) => edgeIsYes(edge)) ?? outgoing[0];
  const noEdge =
    outgoing.find((edge) => edge.id !== yesEdge.id && edgeIsNo(edge)) ??
    outgoing.find((edge) => edge.id !== yesEdge.id);

  if (!noEdge) {
    return emitCode(yesEdge.to, stop, level, context);
  }

  // A do…while condition has an edge back to an already emitted body node.
  if (context.visited.has(yesEdge.to) && !context.visited.has(noEdge.to)) {
    context.warnings.push(
      'Цикл do…while восстановлен как условие после тела: тело уже находится выше по коду.',
    );
    return [
      ...indentLines(
        [
          makeComment(
            `Повторять, пока ${decisionCondition(node, context.language, context.warnings).code}`,
            context.language,
          ),
        ],
        level,
      ),
      ...emitCode(noEdge.to, stop, level, context),
    ];
  }

  const join = findJoin(
    yesEdge.to,
    noEdge.to,
    context.outgoing,
    new Set(context.edges.filter((edge) => edge.back).map((edge) => edge.id)),
  );
  const condition = decisionCondition(node, context.language, context.warnings);
  const thenLines = emitCode(
    yesEdge.to,
    addStop(stop, join),
    level + 1,
    context,
  );
  const elseLines = emitCode(
    noEdge.to,
    addStop(stop, join),
    level + 1,
    context,
  );
  const result = formatIf(
    condition.code,
    thenLines,
    elseLines,
    context.language,
    level,
  );
  if (join) result.push(...emitCode(join, stop, level, context));
  return result;
}

function decisionCondition(
  node: DiagramNode,
  language: Language,
  warnings: string[],
): { code: string; natural: boolean } {
  let expression = node.text.trim().replace(/[?]\s*$/, '');
  if (node.code) {
    expression = node.code.trim();
  }
  const normalized = normalizeCondition(expression, language);
  if (normalized.natural) {
    warnings.push(
      `Условие «${node.text}» записано словами; в коде использовано true.`,
    );
    return { code: language === 'python' ? 'True' : 'true', natural: true };
  }
  return normalized;
}

function buildHeader(diagram: Diagram, language: Language): string[] {
  const prefix = commentPrefix(language);
  const built = new Date().toLocaleDateString('ru-RU');
  return [
    `${prefix} ${diagram.title || 'Блок-схема'}`,
    `${prefix} ГОСТ 19.701-90 · сгенерировано СхемоГОСТ · ${built}`,
  ];
}

function wrapCode(
  body: string[],
  language: Language,
  title: string,
  variables: string[],
): string[] {
  if (language === 'python') {
    return body;
  }
  if (language === 'pascal') {
    const reserved = new Set([
      'begin',
      'end',
      'if',
      'then',
      'else',
      'while',
      'do',
      'for',
      'to',
      'downto',
      'program',
      'var',
      'const',
      'function',
      'procedure',
      'readln',
      'writeln',
    ]);
    const names = variables
      .filter((name) => /^[A-Za-z_]\w*$/.test(name))
      .filter((name) => !reserved.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    const declarations =
      names.length > 0
        ? ['var', `    ${names.join(', ')}: Integer;`, '']
        : [];
    return [
      `program ${title.replace(/[^A-Za-z0-9_]/g, '') || 'Flowchart'};`,
      '',
      ...declarations,
      'begin',
      ...indentLines(body, 1),
      'end.',
    ];
  }
  if (language === 'cpp') {
    const hasReturn = body.some((line) => /^\s*return\b/.test(line));
    const declared = new Set<string>();
    const declarationPattern =
      /^\s*(?:const\s+)?(?:unsigned\s+|signed\s+|long\s+|short\s+)*(?:int|float|double|char|bool|string|auto|size_t|wchar_t)\s+([^;]+)/;
    for (const line of body) {
      const match = line.match(declarationPattern);
      if (!match) continue;
      for (const part of match[1].split(',')) {
        const name = part
          .replace(/[=([{].*$/, '')
          .trim()
          .match(/^[*&]*([A-Za-z_]\w*)/)?.[1];
        if (name) declared.add(name);
      }
    }
    const reserved = new Set([
      'if',
      'for',
      'while',
      'return',
      'cout',
      'cin',
      'endl',
      'main',
      'true',
      'false',
      'nullptr',
    ]);
    const unbound = variables.filter(
      (name) =>
        /^[A-Za-z_]\w*$/.test(name) &&
        !declared.has(name) &&
        !reserved.has(name.toLowerCase()),
    );
    return [
      '#include <iostream>',
      'using namespace std;',
      '',
      'int main() {',
      ...(unbound.length ? [`    int ${unbound.join(', ')};`] : []),
      ...indentLines(body, 1),
      ...(hasReturn ? [] : ['    return 0;']),
      '}',
    ];
  }
  return [
    'using System;',
    '',
    'class Program',
    '{',
    '    static void Main()',
    '    {',
    ...indentLines(body, 2),
    '    }',
    '}',
  ];
}

export function diagramToCode(diagram: Diagram, language: Language): GeneratedCode {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, DiagramEdge[]>();
  for (const edge of diagram.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => {
      if (edgeIsYes(a) && !edgeIsYes(b)) return -1;
      if (!edgeIsYes(a) && edgeIsYes(b)) return 1;
      if (edgeIsNo(a) && !edgeIsNo(b)) return 1;
      if (!edgeIsNo(a) && edgeIsNo(b)) return -1;
      return 0;
    });
  }
  const backSources = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    if (!edge.back) continue;
    const list = backSources.get(edge.to) ?? [];
    list.push(edge.from);
    backSources.set(edge.to, list);
  }
  const endIds = new Set(
    diagram.nodes.filter(isEndNode).map((node) => node.id),
  );
  const context: Context = {
    diagram,
    nodes,
    edges: diagram.edges,
    outgoing,
    backSources,
    language,
    warnings: [],
    visited: new Set(),
    variables: collectVariables(diagram),
    statements: 0,
    decisions: 0,
    loops: 0,
    endIds,
  };
  const start = findStartNode(diagram);
  if (!start) {
    throw new Error('В схеме нет начального блока.');
  }
  if (!diagram.nodes.some(isEndNode)) {
    context.warnings.push('В схеме нет блока «Конец».');
  }
  const body = emitCode(start.id, new Set(), 0, context);
  if (body.length === 0) {
    context.warnings.push(
      'Из начального блока не удалось пройти ни к одному действию.',
    );
  }
  const header = buildHeader(diagram, language);
  const wrapped = wrapCode(body, language, 'Flowchart', [
    ...context.variables,
  ]);
  const prefix = commentPrefix(language);
  const warningLines =
    context.warnings.length > 0
      ? ['', `${prefix} Замечания:`, ...context.warnings.map((w) => `${prefix} - ${w}`)]
      : [];
  return {
    code: [...header, ...warningLines, '', ...wrapped].join('\n').trimEnd(),
    language,
    warnings: context.warnings,
    statements: context.statements,
    decisions: context.decisions,
    loops: context.loops,
  };
}

export function languageTitle(language: Language): string {
  return LANGUAGE_NAMES[language];
}
