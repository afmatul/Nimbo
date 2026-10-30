import type { FileKind } from '@nimbo/contracts';

/** Tipos con vista previa (017 RN-1); `docx` y `otro` quedan fuera. Es la lista del backend (`StoragePreviewFacade`). */
const PREVIEWABLE_KINDS: ReadonlySet<FileKind> = new Set([
  'pdf',
  'xlsx',
  'pptx',
  'texto',
  'imagen',
]);

export function isPreviewableKind(kind: FileKind | undefined): boolean {
  return kind !== undefined && PREVIEWABLE_KINDS.has(kind);
}
