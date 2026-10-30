import type { Language } from '../../types/diagram';
import { parseCFamily } from './cfamily';
import { parsePascal } from './pascal';
import { parsePython } from './python';
import type { ParsedProgram } from './types';

export function parseSource(source: string, language: Language): ParsedProgram {
  switch (language) {
    case 'python':
      return parsePython(source);
    case 'pascal':
      return parsePascal(source);
    case 'cpp':
      return parseCFamily(source, 'cpp');
    case 'csharp':
      return parseCFamily(source, 'csharp');
  }
}

export * from './types';
