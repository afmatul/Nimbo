import type { FileKind } from '@nimbo/contracts';

/** Nombre del tipo de archivo en la ficha (014 CA-20, mockup `storage/ficha-archivo`: «Documento de Word (.docx)»). */
export const FILE_KIND_LABELS: Readonly<Record<FileKind, string>> = {
  docx: 'Documento de Word (.docx)',
  xlsx: 'Hoja de cálculo de Excel (.xlsx)',
  pptx: 'Presentación de PowerPoint (.pptx)',
  pdf: 'Documento PDF (.pdf)',
  imagen: 'Imagen',
  texto: 'Texto (.txt o .md)',
  otro: 'Otro tipo de archivo',
};
