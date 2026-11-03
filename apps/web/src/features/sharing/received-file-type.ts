import type { FileType } from '../../components/nimbo/file-type-chip';

/**
 * Tipo del chip de un archivo recibido. `GET /shares/received` no trae `kind` (012 CA-22): se lee de la extensión del
 * nombre con las extensiones del catálogo de la API (`file-kind.ts` de 005); lo demás es «otro». Pendiente: que la
 * respuesta traiga `kind` (notas de la 012b).
 */
const TYPE_BY_EXTENSION: Readonly<Record<string, FileType>> = {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  pdf: 'pdf',
  jpg: 'img',
  jpeg: 'img',
  png: 'img',
  gif: 'img',
  webp: 'img',
  txt: 'text',
  md: 'text',
};

export function receivedFileType(name: string): FileType {
  const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return TYPE_BY_EXTENSION[extension] ?? 'other';
}
