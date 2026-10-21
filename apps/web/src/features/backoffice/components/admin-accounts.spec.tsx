/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, type AccountListResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AccountsRequest } from '../api';
import { accountItem, accountsPage, ANDREA, DIEGO, MONICA } from '../test-accounts';
import { apiError, loadOf as loadAccounts } from '../test-loads';

import { AdminAccounts } from './admin-accounts';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

type LoadMock = jest.Mock<Promise<AccountListResponse>, [AccountsRequest]>;

const loadOf = (...results: readonly (AccountListResponse | Error)[]): LoadMock =>
  loadAccounts<AccountsRequest, AccountListResponse>(...results);

async function renderList(load: LoadMock): Promise<void> {
  render(<AdminAccounts load={load} />);
  await act(async () => undefined);
}

async function searchFor(text: string): Promise<void> {
  const user = userEvent.setup();
  const input = screen.getByLabelText('Buscar por correo');
  await user.clear(input);
  await user.type(input, text);
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  await act(async () => undefined);
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('tr') as HTMLElement;
}

const PAGE = accountsPage([accountItem(), ANDREA, DIEGO, MONICA], { total: 11 });

describe('AdminAccounts: cuentas para el Administrador (011 CA-1, CA-17)', () => {
  it('CA-1: default: título, aviso de privacidad, alta interna y la primera página sin filtro', async () => {
    const load = loadOf(PAGE);
    await renderList(load);

    expect(load).toHaveBeenCalledWith({ page: 1 });
    expect(screen.getByRole('heading', { level: 1, name: 'Cuentas' })).toBeTruthy();
    expect(
      screen.getByText(
        'La administración muestra metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nueva cuenta interna' }).getAttribute('href')).toBe(
      '/admin/cuentas/nueva',
    );
    expect(screen.getByText('Mostrando 1–10 de 11 cuentas')).toBeTruthy();
  });

  it('CA-1: columnas de la lista y el nombre como enlace a la ficha por id', async () => {
    await renderList(loadOf(PAGE));

    const table = screen.getByRole('table', {
      name: 'Cuentas, ordenadas por fecha de alta, de la más reciente',
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Cuenta', 'Rol', 'Estado', 'Verificada', 'Plan', 'Espacio usado', 'Alta']);
    expect(screen.getByRole('link', { name: 'Laura Barrios' }).getAttribute('href')).toBe(
      `/admin/cuentas/${accountItem().id}`,
    );
  });

  it('CA-1: un cliente muestra estado, verificación, plan, espacio usado y fecha de alta', async () => {
    await renderList(loadOf(PAGE));

    const row = within(rowOf('Laura Barrios'));
    expect(row.getAllByText('Activa').length).toBeGreaterThan(0);
    expect(row.getAllByText('Equipo').length).toBeGreaterThan(0);
    expect(row.getAllByText('304 GB').length).toBeGreaterThan(0);
    expect(row.getAllByText('01/09/2026').length).toBeGreaterThan(0);
  });

  it('CA-1: «—» en plan y espacio de una interna, con el motivo para lectores de pantalla', async () => {
    await renderList(loadOf(PAGE));

    const row = within(rowOf('Andrea Ruiz'));
    expect(row.getAllByText('No aplica: cuenta interna')).toHaveLength(2);
    expect(row.getAllByText('Soporte').length).toBeGreaterThan(0);
  });

  it('CA-1: «—» en el plan de un cliente sin suscripción (009), que sí tiene espacio usado', async () => {
    await renderList(loadOf(PAGE));

    const row = within(rowOf('Diego Coj'));
    expect(row.getAllByText('Sin suscripción').length).toBeGreaterThan(0);
    expect(row.getAllByText('0 B').length).toBeGreaterThan(0);
    expect(row.getAllByText('No').length).toBeGreaterThan(0);
  });

  it('CA-4: la propia cuenta lleva «TÚ»', async () => {
    await renderList(loadOf(PAGE));

    expect(within(rowOf('Mónica Herrera')).getByText('TÚ')).toBeTruthy();
  });

  it('CA-1: busca por el inicio del correo, recortado y en minúsculas', async () => {
    const load = loadOf(PAGE, accountsPage([accountItem()]));
    await renderList(load);

    await searchFor(' Laura ');

    expect(load).toHaveBeenLastCalledWith({ email: 'laura', page: 1 });
    expect(screen.getByText('Mostrando 1–1 de 1 cuentas')).toBeTruthy();
  });

  it('CA-1: «Siguiente» pide la página 2 de la misma búsqueda', async () => {
    const load = loadOf(PAGE, PAGE);
    await renderList(load);
    await searchFor('l');

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(load).toHaveBeenLastCalledWith({ email: 'l', page: 2 });
  });

  it('CA-17: vacío: nada coincide; «Limpiar búsqueda» vuelve a la lista completa y enfoca el campo', async () => {
    const load = loadOf(PAGE, accountsPage([]), PAGE);
    await renderList(load);
    await searchFor('maria.lopez@gmail.com');

    expect(
      screen.getByRole('heading', {
        name: 'No encontramos ninguna cuenta con «maria.lopez@gmail.com».',
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await act(async () => undefined);

    const input = screen.getByLabelText('Buscar por correo') as HTMLInputElement;
    expect(load).toHaveBeenLastCalledWith({ page: 1 });
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('CA-17: cargando: esqueleto y «Cargando cuentas…»', async () => {
    await renderList(loadOf());

    expect(screen.getByRole('status').textContent).toContain('Cargando cuentas…');
  });

  it('CA-17: error con «Reintentar», que vuelve a pedir la lista', async () => {
    const load = loadOf(new TypeError('Failed to fetch'), PAGE);
    await renderList(load);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar las cuentas.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('CA-14: un 403 muestra la pantalla común «Sin permiso»', async () => {
    await renderList(loadOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN)));

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
