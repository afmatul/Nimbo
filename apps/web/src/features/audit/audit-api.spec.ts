import {
  AUDIT_ERROR_CODES,
  listAuditEventsResponseSchema,
  type ListAuditEventsResponse,
} from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createAuditApi } from './audit-api';

const API = 'http://localhost/api/v1';
const FROM = '2026-10-01T06:00:00.000Z';
const TO = '2026-10-06T06:00:00.000Z';

const PAGE: ListAuditEventsResponse = listAuditEventsResponseSchema.parse({
  items: [
    {
      id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
      occurredAt: '2026-10-05T15:15:00.000Z',
      action: 'node.restored',
      origin: 'staff',
      actorRole: 'SUPPORT',
      resourceType: 'folder',
      itemCount: 3,
      sizeBytes: null,
      note: 'Restauración pedida por ti en el caso 4821.',
    },
  ],
  nextCursor: 'c-2',
});

describe('api de la auditoría', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createAuditApi(
    `${API}/`,
    createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
  );

  function lastCall(): { url: string; method: string | undefined } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), method: call?.[1]?.method };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-7: sin filtros pide GET /audit/my-events y devuelve la página validada', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAGE));

    await expect(api.listMyEvents({})).resolves.toEqual(PAGE);
    expect(lastCall()).toEqual({ url: `${API}/audit/my-events`, method: 'GET' });
  });

  it('CA-9, CA-10: manda rango, origen y cursor en la consulta', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));

    await api.listMyEvents({ from: FROM, to: TO, origin: 'staff', cursor: 'c-2' });

    const url = new URL(lastCall().url);
    expect(url.pathname).toBe('/api/v1/audit/my-events');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: FROM,
      to: TO,
      origin: 'staff',
      cursor: 'c-2',
    });
  });

  it('CA-11: una lista vacía es una respuesta válida, no un error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));

    await expect(api.listMyEvents({})).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('CA-14: una respuesta con un campo fuera del contrato se rechaza como falla del servidor', async () => {
    const leaked = { ...PAGE.items[0], fileName: 'informe.docx' };
    fetchMock.mockResolvedValue(jsonResponse({ items: [leaked], nextCursor: null }));

    await expect(api.listMyEvents({})).rejects.toMatchObject({ status: 500 });
  });

  it('CA-10: un 400 llega con su código y su correlationId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: AUDIT_ERROR_CODES.AUDIT_INVALID_QUERY, message: 'x', correlationId: 'corr-1' },
        400,
      ),
    );

    await expect(api.listMyEvents({ cursor: 'basura' })).rejects.toMatchObject({
      status: 400,
      code: AUDIT_ERROR_CODES.AUDIT_INVALID_QUERY,
      correlationId: 'corr-1',
    });
  });
});
