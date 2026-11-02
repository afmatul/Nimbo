import { SHARED_ERROR_CODES, type AgentStatusResponse } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { getStatus } from './agent-api';

const API = 'http://localhost/api/v1';
const STATUS: AgentStatusResponse = {
  used: 4,
  limit: 20,
  resetsAt: '2026-11-01T00:00:00.000Z',
  hasIndexedFiles: true,
  maxQuestionChars: 1000,
};

describe('api del agente (020b plan §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1: lee el contador con GET /agent/status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(STATUS));

    await expect(getStatus(API, authFetch)).resolves.toEqual(STATUS);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${API}/agent/status`);
    expect(init?.method).toBeUndefined();
  });

  it('una respuesta fuera del contrato se rechaza', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...STATUS, maxQuestionChars: 0 }));

    await expect(getStatus(API, authFetch)).rejects.toThrow();
  });

  it('un 403 llega como `ApiClientError` con su código', async () => {
    fetchMock.mockResolvedValue(errorResponse(SHARED_ERROR_CODES.FORBIDDEN, 403));

    await expect(getStatus(API, authFetch)).rejects.toMatchObject({
      code: SHARED_ERROR_CODES.FORBIDDEN,
      status: 403,
    });
  });
});
