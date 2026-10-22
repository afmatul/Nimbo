import type { Provider, Type } from '@nestjs/common';

import { ExtractorRegistry } from '../../application/extractor-registry';
import { I_COMMAND_RUNNER } from '../../application/ports/i-command-runner.port';
import {
  I_TEXT_EXTRACTORS,
  type ITextExtractor,
} from '../../application/ports/i-text-extractor.port';
import { ChildProcessRunner } from '../process/child-process.runner';

import { DocxExtractor } from './docx.extractor';
import { GHOSTSCRIPT_CONFIG, type GhostscriptConfig, PdfExtractor } from './pdf.extractor';
import { PlainTextExtractor } from './plain-text.extractor';

/** Extractores registrados: sumar un formato es una línea aquí (`.xlsx`/`.pptx` en T-12). */
const TEXT_EXTRACTORS: readonly Type<ITextExtractor>[] = [
  DocxExtractor,
  PdfExtractor,
  PlainTextExtractor,
];

/**
 * Proveedores de la extracción que comparten los módulos `api` (qué es indexable) y `worker` (extraer): cada
 * extractor, su lista bajo `I_TEXT_EXTRACTORS`, el `ExtractorRegistry` y el `ICommandRunner` del PDF. Quien los
 * importa agrega `ghostscriptConfigProvider(...)`.
 */
export const EXTRACTOR_PROVIDERS: readonly Provider[] = [
  ...TEXT_EXTRACTORS,
  {
    provide: I_TEXT_EXTRACTORS,
    useFactory: (...extractors: ITextExtractor[]): readonly ITextExtractor[] => extractors,
    inject: [...TEXT_EXTRACTORS],
  },
  ExtractorRegistry,
  { provide: I_COMMAND_RUNNER, useClass: ChildProcessRunner },
];

/** El `api` no tiene `GHOSTSCRIPT_BIN` (plan 019 §5): solo pregunta `supports(kind)` y nunca extrae. */
const GHOSTSCRIPT_NOT_CONFIGURED: GhostscriptConfig = Object.freeze({
  get bin(): string {
    throw new Error(
      'Ghostscript no está configurado en este proceso: el texto de los PDF se extrae en el worker.',
    );
  },
});

/**
 * Binario de Ghostscript para `PdfExtractor`: el `worker` pasa `GHOSTSCRIPT_BIN`; el `api`, `null`, y entonces leer
 * el binario falla en vez de inventar uno.
 */
export function ghostscriptConfigProvider(bin: string | null): Provider {
  return {
    provide: GHOSTSCRIPT_CONFIG,
    useValue: bin === null ? GHOSTSCRIPT_NOT_CONFIGURED : { bin },
  };
}
