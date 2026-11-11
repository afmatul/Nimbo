import type { PreviewUrlResponse } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';
import type { AuthFetch } from '../../identity/session/auth-fetch';

import { requestPreviewUrl } from './api';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const DELIVERY: PreviewUrlResponse = {
  file: {
    id: FILE_ID,
    name: 'Notas.txt',
    kind: 'texto',
    folderId: null,
    sizeBytes: 100,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  url: 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE',
  expiresAt: '2026-10-10T10:05:00.000Z',
};

const http = (): jest.MockedFunction<AuthFetch> => jest.fn();

describe('cliente de emisión T-06', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-7: emite un POST autenticado y devuelve la entrega validada', async () => {
    const authFetch = http().mockResolvedValue(DELIVERY);
    const response = await requestPreviewUrl('https://api.test/api/v1/', authFetch, {
      fileId: FILE_ID,
    });
    expect(authFetch).toHaveBeenCalledWith(`https://api.test/api/v1/files/${FILE_ID}/preview-url`, {
      method: 'POST',
    });
    expect(response.file.id).toBe(FILE_ID);
    expect(response.url === DELIVERY.url).toBe(true);
  });

  it('CA-7: propaga AbortSignal sin pedir bytes al origen de objetos', async () => {
    const authFetch = http().mockResolvedValue(DELIVERY);
    const signal = new AbortController().signal;
    const fetchCall = jest.spyOn(globalThis, 'fetch');
    await requestPreviewUrl('https://api.test/api/v1', authFetch, { fileId: FILE_ID, signal });
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(authFetch.mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(fetchCall).toHaveBeenCalledTimes(0);
  });

  it('Guardia transversal: conserva el error estructurado y Retry-After', async () => {
    const error = new ApiClientError({
      code: 'STORAGE_TOO_MANY_REQUESTS',
      status: 429,
      message: 'Público',
      correlationId: 'request-17',
      retryAfterSeconds: 17,
    });
    const authFetch = http().mockRejectedValue(error);
    await expect(
      requestPreviewUrl('https://api.test/api/v1', authFetch, { fileId: FILE_ID }),
    ).rejects.toBe(error);
  });

  it('CA-2: una respuesta inválida se rechaza sin transportar el payload privado', async () => {
    const authFetch = http().mockResolvedValue({
      ...DELIVERY,
      mime: 'PRIVATE_MIME',
      token: 'PRIVATE_TOKEN',
    });
    const error: unknown = await requestPreviewUrl('https://api.test/api/v1', authFetch, {
      fileId: FILE_ID,
    }).catch((caught: unknown) => caught);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(error instanceof Error).toBe(true);
    if (!(error instanceof Error)) throw new Error('Falta el error de contrato');
    expect(/PRIVATE_|X-Amz-Signature|private-object/.test(error.message + error.stack)).toBe(false);
  });
});
