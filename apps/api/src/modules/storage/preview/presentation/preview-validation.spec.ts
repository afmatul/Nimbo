import type { ArgumentMetadata } from '@nestjs/common';
import { fileSummarySchema } from '@nimbo/contracts';

import { NodeNotFoundError } from '../../domain/errors';

import { previewFileIdPipe } from './preview-validation';

const METADATA = {} as ArgumentMetadata;
const FILE_ID = '11111111-1111-4111-8111-111111111111';

describe('previewFileIdPipe', () => {
  it('CA-11: acepta un UUID válido con las reglas del contrato público', () => {
    expect(fileSummarySchema.shape.id.parse(FILE_ID)).toBe(FILE_ID);
    expect(previewFileIdPipe().transform(FILE_ID, METADATA)).toBe(FILE_ID);
  });

  it.each(['no-es-un-uuid', '', 'https://example.test?token=SECRETO'])(
    'CA-5: %s se comporta como un nodo inexistente',
    (fileId) => {
      expect(() => previewFileIdPipe().transform(fileId, METADATA)).toThrow(NodeNotFoundError);
    },
  );
});
