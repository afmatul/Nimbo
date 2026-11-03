import { OPTIMIZER_ERROR_CODES } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';
import { createStorageHttp } from '../storage/storage-http';
import { StorageRequestError } from '../storage/storage-request-error';

import { createOptimizerApi } from './optimizer-api';
import { ESTIMATING, IMAGE_FILE_ID, OPTIMIZING } from './test-optimization';

describe('OptimizerApi (021 plan §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createOptimizerApi(
    createStorageHttp(
      'http://localhost/api/v1',
      createAuthFetch({
        getAccessToken: () => 'token-a',
        renew: () => Promise.resolve(null),
      }),
    ),
  );
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-6: GET devuelve la última optimización o null', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ optimization: ESTIMATING }))
      .mockResolvedValueOnce(jsonResponse({ optimization: null }));
    await expect(api.status(IMAGE_FILE_ID)).resolves.toEqual(ESTIMATING);
    await expect(api.status(IMAGE_FILE_ID)).resolves.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://localhost/api/v1/files/${IMAGE_FILE_ID}/optimization`,
    );
  });
  it('CA-1: calcula con POST estimate sin body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ESTIMATING, 202));
    await expect(api.estimate(IMAGE_FILE_ID)).resolves.toEqual(ESTIMATING);
    expect(fetchMock.mock.calls[0]).toEqual([
      `http://localhost/api/v1/files/${IMAGE_FILE_ID}/optimization/estimate`,
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
  it('CA-6: confirma con POST run y solo optimizationId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPTIMIZING, 202));
    await expect(api.run(IMAGE_FILE_ID, { optimizationId: OPTIMIZING.id })).resolves.toEqual(
      OPTIMIZING,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ optimizationId: OPTIMIZING.id }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/optimization/run');
  });
  it('CA-11: conserva el 409 stale tipado', async () => {
    const code = OPTIMIZER_ERROR_CODES.OPTIMIZER_ESTIMATE_STALE;
    fetchMock.mockResolvedValue(errorResponse(code, 409));
    await expect(api.run(IMAGE_FILE_ID, { optimizationId: OPTIMIZING.id })).rejects.toEqual(
      new StorageRequestError(409, code),
    );
  });
  it('rechaza respuestas que no cumplen contracts', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ optimization: { ...ESTIMATING, pollAfterMs: null } }),
    );
    await expect(api.status(IMAGE_FILE_ID)).rejects.toEqual(
      new StorageRequestError(500, 'INTERNAL_ERROR'),
    );
  });
});
