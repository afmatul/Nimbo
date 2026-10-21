/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  IDENTITY_ERROR_CODES,
  SHARED_ERROR_CODES,
  type AccountListItem,
  type ClientFilesResponse,
} from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ClientFilesRequest } from '../api';
import { accountItem, ANDREA } from '../test-accounts';
import { clientFile, clientFilesPage, LAURA, TRASHED_PDF } from '../test-client-files';
import { apiError, loadOf } from '../test-loads';

import { AdminClientFiles, type AdminClientFilesApi } from './admin-client-files';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function apiOf(
  account: readonly (AccountListItem | Error)[],
  files: readonly (ClientFilesResponse | Error)[] = [],
) {
  return {
    getAccount: loadOf<string, AccountListItem>(...account),
    listClientFiles: loadOf<ClientFilesRequest, ClientFilesResponse>(...files),
  } satisfies AdminClientFilesApi;
}

async function renderView(api: AdminClientFilesApi, id: string = LAURA.id): Promise<void> {
  render(<AdminClientFiles accountId={id} api={api} />);
  await act(async () => undefined);
}

const FOUND = clientFilesPage([clientFile(), TRASHED_PDF], { total: 11 });

describe('AdminClientFiles: metadatos de un cliente desde su ficha (011 CA-13, estado desde-admin)', () => {
  it('CA-13: pide la cuenta por id y sus archivos con su correo, sin buscador y con «Volver a la ficha»', async () => {
    const api = apiOf([accountItem()], [FOUND]);
    await renderView(api);

    expect(api.getAccount).toHaveBeenCalledWith(LAURA.id);
    expect(api.listClientFiles).toHaveBeenCalledWith({ email: LAURA.email, page: 1 });
    expect(screen.getByRole('heading', { level: 1, name: 'Metadatos de archivos' })).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Volver a la ficha de Laura Barrios' }).getAttribute('href'),
    ).toBe(`/admin/cuentas/${LAURA.id}`);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('CA-13, RN-2: el aviso de privacidad y el de auditoría dicen el rol de la sesión (Administrador)', async () => {
    await renderView(apiOf([accountItem()], [FOUND]));

    expect(
      screen.getByText(
        'La administración muestra metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Verá la fecha y tu rol (Administrador).')).toBeTruthy();
    expect(screen.queryByText(/Soporte/)).toBeNull();
  });

  it('CA-13: «Siguiente» pide la página 2 del mismo cliente', async () => {
    const api = apiOf([accountItem()], [FOUND]);
    await renderView(api);

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(api.listClientFiles).toHaveBeenLastCalledWith({ email: LAURA.email, page: 2 });
  });

  it('CA-17: vacío: el cliente no tiene archivos', async () => {
    await renderView(apiOf([accountItem()], [clientFilesPage([])]));

    expect(screen.getByRole('heading', { name: 'Laura Barrios no tiene archivos.' })).toBeTruthy();
  });

  it('CA-17: cargando: mientras llega la cuenta o sus archivos', async () => {
    await renderView(apiOf([]));

    expect(screen.getByRole('status').textContent).toContain('Buscando la cuenta y sus archivos…');
  });

  it('CA-17: error de los archivos con «Reintentar»', async () => {
    const api = apiOf([accountItem()], [new TypeError('Failed to fetch'), FOUND]);
    await renderView(api);

    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Reintentar' }),
    );
    await act(async () => undefined);

    expect(api.listClientFiles).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('CA-13: una cuenta interna no tiene archivos de cliente (el mismo 404 de la API)', async () => {
    await renderView(
      apiOf([ANDREA], [apiError(404, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND)]),
      ANDREA.id,
    );

    expect(
      screen.getByRole('heading', {
        name: 'No encontramos una cuenta de cliente con «andrea.ruiz@nimbo.gt».',
      }),
    ).toBeTruthy();
  });

  it('CA-17: una cuenta que no existe muestra «No encontramos esta cuenta.»', async () => {
    const api = apiOf([apiError(404, IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND)]);
    await renderView(api);

    expect(screen.getByRole('heading', { name: 'No encontramos esta cuenta.' })).toBeTruthy();
    expect(api.listClientFiles).not.toHaveBeenCalled();
  });

  it.each([
    ['la cuenta', apiOf([apiError(403, SHARED_ERROR_CODES.FORBIDDEN)])],
    ['los archivos', apiOf([accountItem()], [apiError(403, SHARED_ERROR_CODES.FORBIDDEN)])],
  ])('CA-14: un 403 al pedir %s muestra «Sin permiso»', async (_what, api) => {
    await renderView(api);

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });
});
