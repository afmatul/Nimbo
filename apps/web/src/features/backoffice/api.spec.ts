import type { AuthFetch } from '../identity/session/auth-fetch';

import { createBackofficeApi } from './api';
import { accountItem, accountsPage } from './test-accounts';
import { clientFile, clientFilesPage, LAURA } from './test-client-files';

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
});
