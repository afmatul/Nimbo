import type { AuthFetch } from '../identity/session/auth-fetch';

import { createBackofficeApi } from './api';
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
});
