import { spaceSummaryResponseSchema } from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createSpaceApi } from './space-api';
import { createStorageHttp } from './storage-http';
import { StorageRequestError } from './storage-request-error';
import { GB, spaceSummaryWith } from './test-space-summary';

const API = 'http://localhost/api/v1';

describe('api del resumen de espacio', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createSpaceApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1, CA-6: lee GET /storage/summary y devuelve el resumen validado con el contrato', async () => {
    const summary = spaceSummaryWith(4.8 * GB);
    expect(spaceSummaryResponseSchema.safeParse(summary).success).toBe(true);
    fetchMock.mockResolvedValue(jsonResponse(summary));

    await expect(api.spaceSummary()).resolves.toEqual(summary);
    const call = fetchMock.mock.calls.at(-1);
    expect(String(call?.[0])).toBe(`${API}/storage/summary`);
    expect(call?.[1]?.method).toBe('GET');
  });

  it('CA-8: una respuesta que no cumple el contrato se rechaza como falla del servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...spaceSummaryWith(4.8 * GB), planName: '' }));

    await expect(api.spaceSummary()).rejects.toBeInstanceOf(StorageRequestError);
  });
});
