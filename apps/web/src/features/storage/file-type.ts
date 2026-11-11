import type { FileKind } from '@nimbo/contracts';

import type { FileType } from '../../components/nimbo/file-type-chip';

export const CHIP_TYPE_BY_KIND: Readonly<Record<FileKind, FileType>> = {
  docx: 'docx',
  pdf: 'pdf',
  xlsx: 'xlsx',
  pptx: 'pptx',
  imagen: 'img',
  texto: 'text',
  otro: 'other',
};
