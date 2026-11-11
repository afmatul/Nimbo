import * as contracts from '../index';

import { STORAGE_ERROR_CODES } from './error-codes';
import {
  STORAGE_PREVIEW_FAILURE_CODES,
  isPreviewableKind,
  previewUrlResponseSchema,
} from './preview-schemas';
import { downloadUrlSchema } from './schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

const file = {
  id: ID,
  name: 'informe.pdf',
  sizeBytes: 2048,
  kind: 'pdf',
  folderId: null,
  createdAt: '2026-10-06T10:00:00.000Z',
  updatedAt: '2026-10-06T10:00:00.000Z',
};

const response = {
  file,
  url: 'https://objetos.nimbo.me/nimbo/objeto?X-Amz-Signature=firma',
  expiresAt: '2026-10-06T10:05:00.000Z',
};

describe('previewUrlResponseSchema (plan 017 §4)', () => {
  it('CA-1: la URL de vista lleva el archivo actual, la URL firmada y su vencimiento', () => {
    expect(previewUrlResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    ['un `mime` (opción 4: sin MIME)', { ...response, mime: 'application/pdf' }],
    ['la clave del objeto', { ...response, objectKey: 'usuarios/x/objeto' }],
    ['una URL que no es absoluta', { ...response, url: '/nimbo/objeto' }],
    ['un vencimiento que no es ISO', { ...response, expiresAt: 'mañana' }],
    ['un archivo sin `kind`', { ...response, file: { ...file, kind: undefined } }],
    ['un archivo con campos extra', { ...response, file: { ...file, objectKey: 'x' } }],
  ])('CA-11: no admite %s', (_case, value) => {
    expect(previewUrlResponseSchema.safeParse(value).success).toBe(false);
  });

  it('CA-11: la descarga de 005 sigue sin el archivo en su respuesta', () => {
    expect(downloadUrlSchema.safeParse(response).success).toBe(false);
  });
});

describe('códigos públicos de previsualización (plan 017 §4)', () => {
  it('CA-2: el formato excluido responde `STORAGE_PREVIEW_UNSUPPORTED` del catálogo único de `storage`', () => {
    expect(STORAGE_ERROR_CODES.STORAGE_PREVIEW_UNSUPPORTED).toBe('STORAGE_PREVIEW_UNSUPPORTED');
  });

  it('CA-2: los fallos del lector en el navegador tienen código propio, no HTTP', () => {
    expect(Object.values(STORAGE_PREVIEW_FAILURE_CODES)).toEqual([
      'STORAGE_PREVIEW_PASSWORD_PROTECTED',
      'STORAGE_PREVIEW_CORRUPT',
      'STORAGE_PREVIEW_UNAVAILABLE',
      'STORAGE_PREVIEW_EXPIRED',
    ]);
  });

  it('CA-1: el contrato se exporta desde la raíz del paquete', () => {
    expect(contracts.previewUrlResponseSchema).toBe(previewUrlResponseSchema);
    expect(contracts.STORAGE_PREVIEW_FAILURE_CODES).toBe(STORAGE_PREVIEW_FAILURE_CODES);
  });
});

describe('isPreviewableKind (017 RN-1)', () => {
  it.each(['pdf', 'xlsx', 'pptx', 'texto', 'imagen'] as const)(
    'CA-11: %s tiene vista previa',
    (kind) => {
      expect(isPreviewableKind(kind)).toBe(true);
    },
  );

  it.each(['docx', 'otro', undefined] as const)('CA-11: %s no tiene vista previa', (kind) => {
    expect(isPreviewableKind(kind)).toBe(false);
  });
});
