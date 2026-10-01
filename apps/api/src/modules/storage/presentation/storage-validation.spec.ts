import type { ArgumentMetadata } from '@nestjs/common';
import { initUploadSchema, listFilesQuerySchema } from '@nimbo/contracts';

import { ZodValidationPipe } from '../../../shared';
import type { DomainError } from '../../../shared';
import {
  InvalidQueryError,
  InvalidUploadRequestError,
  NodeNotFoundError,
  UploadNotFoundError,
} from '../domain/errors';

import {
  fileIdPipe,
  storageQueryValidationError,
  storageUploadValidationError,
  uploadIdPipe,
} from './storage-validation';

const BODY: ArgumentMetadata = { type: 'body' };
const QUERY: ArgumentMetadata = { type: 'query' };
const PARAM: ArgumentMetadata = { type: 'param', data: 'id' };
const UUID = '6f1c1d3e-8a2b-4c5d-9e0f-112233445566';

/** El error que lanza `work`; falla la prueba si no lanza. */
function thrownBy(work: () => unknown): DomainError {
  try {
    work();
  } catch (error) {
    return error as DomainError;
  }
  throw new Error('se esperaba un error');
}

describe('validación de entrada de `storage` (CA-7, CA-16)', () => {
  const initPipe = new ZodValidationPipe(initUploadSchema, storageUploadValidationError);
  const queryPipe = new ZodValidationPipe(listFilesQuerySchema, storageQueryValidationError);

  it('CA-7: un inicio de carga inválido es 400 `STORAGE_INVALID_UPLOAD_REQUEST` con cada campo en falla', () => {
    const error = thrownBy(() => initPipe.transform({ sizeBytes: -1, extra: true }, BODY));

    expect(error).toBeInstanceOf(InvalidUploadRequestError);
    expect(error.status).toBe(400);
    expect((error.fields ?? []).map((issue) => [issue.field, issue.reason])).toEqual(
      expect.arrayContaining([
        ['name', 'REQUIRED'],
        ['sizeBytes', 'INVALID_SIZE'],
        ['extra', 'UNKNOWN_FIELD'],
      ]),
    );
  });

  it('CA-7: un inicio válido pasa con `onConflict` en `ask` y `folderId` en la raíz por defecto', () => {
    expect(initPipe.transform({ name: 'a.pdf', sizeBytes: 10 }, BODY)).toEqual({
      name: 'a.pdf',
      sizeBytes: 10,
      onConflict: 'ask',
      folderId: null,
    });
  });

  it('CA-15: un cursor vacío es 400 `STORAGE_INVALID_QUERY`; sin parámetros la página es de 50', () => {
    expect(() => queryPipe.transform({ cursor: '' }, QUERY)).toThrow(InvalidQueryError);
    expect(queryPipe.transform({}, QUERY)).toEqual({ limit: 50 });
  });

  it.each(['no-es-uuid', '123', `${UUID}x`])(
    'CA-16: el id de carga «%s» responde el mismo 404 que uno inexistente',
    async (id) => {
      await expect(uploadIdPipe().transform(id, PARAM)).rejects.toBeInstanceOf(UploadNotFoundError);
    },
  );

  it('CA-16: el id de archivo malformado responde el mismo 404 que uno inexistente', async () => {
    await expect(fileIdPipe().transform('x', PARAM)).rejects.toBeInstanceOf(NodeNotFoundError);
  });

  it('CA-16: un UUID pasa tal cual', async () => {
    await expect(uploadIdPipe().transform(UUID, PARAM)).resolves.toBe(UUID);
    await expect(fileIdPipe().transform(UUID, PARAM)).resolves.toBe(UUID);
  });
});
