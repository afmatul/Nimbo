import { Injectable } from '@nestjs/common';

import type { ITextExtractor } from '../../application/ports/i-text-extractor.port';
import { NotIndexableError } from '../../domain/errors';
import type { Segment } from '../../domain/segment';
import { TextLocation } from '../../domain/text-location';

const LINE_BREAK = /\r\n|\r|\n/;
const NUL = '\u0000';

/** UTF-8 estricto sin NUL, como lo valida `storage` al subir (005 D-9); el BOM se descarta. */
function decodeUtf8(content: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new NotIndexableError('formato_no_soportado');
  }
  if (text.includes(NUL)) throw new NotIndexableError('formato_no_soportado');
  return text;
}

/**
 * Extractor de `.txt` y `.md` (CA-3): una línea = un segmento con su número (desde 1, contando las líneas en blanco,
 * que no se emiten). El `Chunker` une líneas contiguas en rangos.
 */
@Injectable()
export class PlainTextExtractor implements ITextExtractor {
  readonly kind = 'texto';

  extract(content: Buffer): Promise<readonly Segment[]> {
    return Promise.resolve().then(() => this.read(content));
  }

  private read(content: Buffer): readonly Segment[] {
    return decodeUtf8(content)
      .split(LINE_BREAK)
      .map((text, index) => ({ text, location: TextLocation.line(index + 1) }))
      .filter((segment) => segment.text.trim().length > 0);
  }
}
