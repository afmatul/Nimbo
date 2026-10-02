import type { FileKind } from './file-kind';

/** Categorías del desglose de espacio (spec 007 CA-2, P-3): Documentos, Imágenes y Otros. */
export const FILE_CATEGORIES = ['documents', 'images', 'other'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

const CATEGORY_BY_KIND: Readonly<Record<FileKind, FileCategory>> = Object.freeze({
  docx: 'documents',
  pdf: 'documents',
  texto: 'documents',
  xlsx: 'documents',
  pptx: 'documents',
  imagen: 'images',
  otro: 'other',
});

/** Categoría del desglose a la que pertenece un tipo de archivo (función pura). */
export const categoryOf = (kind: FileKind): FileCategory => CATEGORY_BY_KIND[kind];
