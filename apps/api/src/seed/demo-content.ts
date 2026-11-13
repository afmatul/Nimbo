import type { DemoFile } from './demo-corpus';
import { buildDocx } from './docx-builder';

/** `archivo.tipo` por extensión, solo para las que usa el corpus (las demás, `otro`, como `FileKind`). */
const KIND_BY_EXTENSION: Readonly<Record<string, string>> = {
  md: 'texto',
  txt: 'texto',
  docx: 'docx',
};
const SHORT_TEXT =
  'Este archivo es parte de los datos de demostración de Nimbo.\n' +
  'Puedes abrirlo, compartirlo, moverlo o enviarlo a la papelera.\n';
const FILLER = 'Nimbo · relleno de demostración para la cuota.\n';

export const kindOf = (name: string): string =>
  KIND_BY_EXTENSION[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] ?? 'otro';

/** Los bytes que la semilla sube a MinIO: un `.docx` real, relleno de tamaño exacto o un texto corto. */
export const contentOf = (file: DemoFile): Buffer => {
  if (file.docxText !== undefined) return buildDocx(file.docxText);
  return file.sizeBytes === undefined
    ? Buffer.from(SHORT_TEXT, 'utf8')
    : Buffer.alloc(file.sizeBytes, FILLER);
};
