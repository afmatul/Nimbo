import type { AuthFetch } from '../identity/session/auth-fetch';

import { createBackofficeApi } from './api';
import { accountItem, accountsPage } from './test-accounts';
import { clientFile, clientFilesPage, LAURA } from './test-client-files';
import { clientTrashPage, restored, TRASH_PDF, TRASH_SHEET } from './test-client-trash';
import { accountLimits, WITH_EXTRA } from './test-limits';
import { metricsResponse } from './test-metrics';
import { PERSONAL_PLAN, plansResponse, PRO_PLAN } from './test-plans';

const API = 'http://localhost/api/v1/';

function apiWith(
  body: unknown,
): { authFetch: jest.MockedFunction<AuthFetch> } & ReturnType<typeof createBackofficeApi> {
  const authFetch: jest.MockedFunction<AuthFetch> = jest.fn((_url: string) =>
    Promise.resolve(body),
  );
  return { authFetch, ...createBackofficeApi(API, authFetch) };
}

describe('createBackofficeApi (011 plan §4)', () => {
  it('CA-13: GET /backoffice/client-files con el correo y la página en la consulta', async () => {
    const page = clientFilesPage([clientFile()], { page: 2, total: 11 });
    const api = apiWith(page);

    const result = await api.listClientFiles({ email: LAURA.email, page: 2 });

    expect(result).toEqual(page);
    expect(api.authFetch).toHaveBeenCalledWith(
      'http://localhost/api/v1/backoffice/client-files?email=laura.barrios%40alpha.gt&page=2',
      { method: 'GET' },
    );
  });

  it('CA-13: una respuesta con algo más que metadatos se rechaza como falla del servidor', async () => {
    const page = clientFilesPage([{ ...clientFile(), objectKey: 'x' } as never]);
    const api = apiWith(page);

    await expect(api.listClientFiles({ email: LAURA.email, page: 1 })).rejects.toMatchObject({
      status: 500,
    });
  });

  it('CA-10: GET /backoffice/client-trash con el correo y, si hay, el cursor', async () => {
    const page = clientTrashPage([TRASH_SHEET], 'cursor-2');
    const api = apiWith(page);

    expect(await api.listClientTrash({ email: LAURA.email })).toEqual(page);
    await api.listClientTrash({ email: LAURA.email, cursor: 'cursor-2' });

    expect(api.authFetch.mock.calls).toEqual([
      [
        'http://localhost/api/v1/backoffice/client-trash?email=laura.barrios%40alpha.gt',
        { method: 'GET' },
      ],
      [
        'http://localhost/api/v1/backoffice/client-trash?email=laura.barrios%40alpha.gt&cursor=cursor-2',
        { method: 'GET' },
      ],
    ]);
  });

  it('CA-10, RN-3: una papelera con algo más que los datos de la raíz (p. ej. una URL) se rechaza', async () => {
    const page = clientTrashPage([{ ...TRASH_PDF, url: 'https://x' } as never]);
    const api = apiWith(page);

    await expect(api.listClientTrash({ email: LAURA.email })).rejects.toMatchObject({
      status: 500,
    });
  });

  it('CA-11: POST /backoffice/client-trash/:nodeId/restore con el correo, el tipo y el motivo (sin el id)', async () => {
    const response = restored(TRASH_SHEET);
    const api = apiWith(response);

    const result = await api.restoreClientNode({
      nodeId: TRASH_SHEET.id,
      email: LAURA.email,
      type: 'file',
      note: 'El cliente lo pidió',
    });

    expect(result).toEqual(response);
    expect(api.authFetch).toHaveBeenCalledWith(
      `http://localhost/api/v1/backoffice/client-trash/${TRASH_SHEET.id}/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: LAURA.email, type: 'file', note: 'El cliente lo pidió' }),
      },
    );
  });

  it('CA-1: GET /backoffice/accounts con la página y, si hay, el inicio del correo', async () => {
    const page = accountsPage([accountItem()], { page: 2, total: 11 });
    const api = apiWith(page);

    expect(await api.listAccounts({ email: 'laura', page: 2 })).toEqual(page);
    await api.listAccounts({ page: 1 });

    expect(api.authFetch.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost/api/v1/backoffice/accounts?page=2&email=laura',
      'http://localhost/api/v1/backoffice/accounts?page=1',
    ]);
  });

  it('CA-1: una cuenta con algo más que sus datos (p. ej. archivos) se rechaza como falla del servidor', async () => {
    const api = apiWith(accountsPage([{ ...accountItem(), files: [] } as never]));

    await expect(api.listAccounts({ page: 1 })).rejects.toMatchObject({ status: 500 });
  });

  it('CA-1: GET /backoffice/accounts/:id pide la ficha por id', async () => {
    const api = apiWith(accountItem());

    expect(await api.getAccount(LAURA.id)).toEqual(accountItem());
    expect(api.authFetch).toHaveBeenCalledWith(
      `http://localhost/api/v1/backoffice/accounts/${LAURA.id}`,
      { method: 'GET' },
    );
  });

  it('CA-2, CA-3: suspender es POST y reactivar DELETE sobre /suspension, sin cuerpo', async () => {
    const api = apiWith(accountItem({ status: 'suspended' }));

    expect((await api.suspendAccount(LAURA.id)).status).toBe('suspended');
    await api.reactivateAccount(LAURA.id);

    const url = `http://localhost/api/v1/backoffice/accounts/${LAURA.id}/suspension`;
    expect(api.authFetch.mock.calls).toEqual([
      [url, { method: 'POST' }],
      [url, { method: 'DELETE' }],
    ]);
  });

  it('CA-5: el alta es POST /backoffice/accounts con el cuerpo en JSON', async () => {
    const created = accountItem({ role: 'SUPPORT', planName: null, usedBytes: null });
    const api = apiWith(created);
    const body = {
      fullName: 'Rodrigo Pérez',
      email: 'rodrigo.perez@nimbo.gt',
      employeeCode: 'EMP-0142',
      role: 'SUPPORT',
    } as const;

    expect(await api.enrollAccount(body)).toEqual(created);
    expect(api.authFetch).toHaveBeenCalledWith('http://localhost/api/v1/backoffice/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('CA-12: GET /backoffice/metrics devuelve solo totales y conteos', async () => {
    const api = apiWith(metricsResponse());

    expect(await api.getMetrics()).toEqual(metricsResponse());
    expect(api.authFetch).toHaveBeenCalledWith('http://localhost/api/v1/backoffice/metrics', {
      method: 'GET',
    });
  });

  it('CA-12: unas métricas con filas de cuentas se rechazan como falla del servidor', async () => {
    const api = apiWith({ ...metricsResponse(), accountsList: [] });

    await expect(api.getMetrics()).rejects.toMatchObject({ status: 500 });
  });

  it('CA-8: GET /backoffice/plans devuelve el catálogo con su conteo de cuentas', async () => {
    const catalog = plansResponse([PERSONAL_PLAN, PRO_PLAN]);
    const api = apiWith(catalog);

    expect(await api.listPlans()).toEqual(catalog);
    expect(api.authFetch).toHaveBeenCalledWith('http://localhost/api/v1/backoffice/plans', {
      method: 'GET',
    });
  });

  it('CA-10: POST /backoffice/plans/:id/deactivation desactiva el plan', async () => {
    const retired = { ...PRO_PLAN, deactivatedAt: '2026-10-20T12:00:00.000Z' };
    const api = apiWith(retired);

    expect(await api.deactivatePlan(PRO_PLAN.id)).toEqual(retired);
    expect(api.authFetch).toHaveBeenCalledWith(
      `http://localhost/api/v1/backoffice/plans/${PRO_PLAN.id}/deactivation`,
      { method: 'POST' },
    );
  });
});

describe('createBackofficeApi: límites y vigencia (011b plan §4)', () => {
  const limitsUrl = `http://localhost/api/v1/backoffice/accounts/${LAURA.id}`;

  it('CA-1: GET …/limits devuelve los límites de la cuenta', async () => {
    const api = apiWith(accountLimits());

    expect(await api.getAccountLimits(LAURA.id)).toEqual(accountLimits());
    expect(api.authFetch).toHaveBeenCalledWith(`${limitsUrl}/limits`, { method: 'GET' });
  });

  it('CA-1, CA-4: fijar el extra es PUT …/quota con el cuerpo en JSON y quitarlo DELETE sin cuerpo', async () => {
    const api = apiWith(WITH_EXTRA);
    const body = { extraBytes: WITH_EXTRA.extraQuotaBytes, until: '2030-11-15' };

    expect(await api.adjustQuota(LAURA.id, body)).toEqual(WITH_EXTRA);
    await api.removeQuota(LAURA.id);

    expect(api.authFetch.mock.calls).toEqual([
      [
        `${limitsUrl}/quota`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ],
      [`${limitsUrl}/quota`, { method: 'DELETE' }],
    ]);
  });

  it('CA-6: extender la vigencia es PUT …/validity con el día elegido', async () => {
    const api = apiWith(accountLimits());

    await api.adjustValidity(LAURA.id, { expiresAt: '2030-11-30' });

    expect(api.authFetch).toHaveBeenCalledWith(`${limitsUrl}/validity`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresAt: '2030-11-30' }),
    });
  });

  it('CA-1: unos límites con algo más que la lista blanca se rechazan como falla del servidor', async () => {
    const api = apiWith({ ...accountLimits(), files: [] });

    await expect(api.getAccountLimits(LAURA.id)).rejects.toMatchObject({ status: 500 });
  });
});
