/** Tipos de `archivo.tipo` (`CHECK` de la migración). Coinciden con `FILE_KINDS` de `contracts/storage`. */
export const FILE_KINDS = ['docx', 'pdf', 'texto', 'xlsx', 'pptx', 'imagen', 'otro'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export interface FileKindEntry {
  readonly kind: FileKind;
  readonly mime: string;
}

const IMAGE_PNG: FileKindEntry = { kind: 'imagen', mime: 'image/png' };
const IMAGE_JPEG: FileKindEntry = { kind: 'imagen', mime: 'image/jpeg' };

/**
 * Catálogo único extensión → tipo y MIME (plan §6, D-9). Solo estas extensiones tienen firma que validar; `svg`,
 * `bmp`, `heic` y cualquier otra son `otro`.
 */
export const FILE_KIND_CATALOG: Readonly<Record<string, FileKindEntry>> = Object.freeze({
  docx: {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: { kind: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: {
    kind: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  txt: { kind: 'texto', mime: 'text/plain' },
  md: { kind: 'texto', mime: 'text/markdown' },
  png: IMAGE_PNG,
  jpg: IMAGE_JPEG,
  jpeg: IMAGE_JPEG,
  gif: { kind: 'imagen', mime: 'image/gif' },
  webp: { kind: 'imagen', mime: 'image/webp' },
});

/** Tipo de un archivo sin firma que validar (CA-12). */
export const OTHER_FILE_KIND: FileKindEntry = Object.freeze({
  kind: 'otro',
  mime: 'application/octet-stream',
});

/** Tipo y MIME según la extensión (sin punto); `otro` si no está en el catálogo. */
export function fileKindOf(extension: string): FileKindEntry {
  return FILE_KIND_CATALOG[extension.toLowerCase()] ?? OTHER_FILE_KIND;
}
