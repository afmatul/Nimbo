/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  BACKOFFICE_FIELD_MESSAGES,
  SHARED_ERROR_CODES,
  type ClientFilesResponse,
} from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ClientFilesRequest } from '../hooks/use-client-files';
import { clientFile, clientFilesPage, LAURA, TRASHED_PDF } from '../test-client-files';
import { apiError, loadOf as loadInOrder } from '../test-loads';

import { SupportClientFiles } from './support-client-files';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

type LoadMock = jest.Mock<Promise<ClientFilesResponse>, [ClientFilesRequest]>;

const loadOf = (...results: readonly (ClientFilesResponse | Error)[]): LoadMock =>
  loadInOrder<ClientFilesRequest, ClientFilesResponse>(...results);

async function searchFor(email: string, load: LoadMock): Promise<void> {
  render(<SupportClientFiles load={load} />);
  const user = userEvent.setup();
  if (email !== '') await user.type(screen.getByLabelText('Correo del cliente'), email);
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  await act(async () => undefined);
}

describe('SupportClientFiles: metadatos de un cliente para Soporte (011 CA-13, CA-17)', () => {
  it('CA-17: inicial, con el aviso de privacidad, la ayuda del campo y qué verá', () => {
    render(<SupportClientFiles load={loadOf()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Metadatos de archivos' })).toBeTruthy();
    expect(
      screen.getByText(
        'Soporte ve metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido ni vistas previas.',
      ),
    ).toBeTruthy();
    const input = screen.getByLabelText('Correo del cliente');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Busca a un cliente para ver sus archivos' }),
    ).toBeTruthy();
  });

  it('CA-13: default, con el cliente, el aviso de auditoría con el rol y la tabla paginada', async () => {
    const load = loadOf(clientFilesPage([clientFile(), TRASHED_PDF], { total: 214 }));
    await searchFor(` ${LAURA.email.toUpperCase()} `, load);

    expect(load).toHaveBeenCalledWith({ email: LAURA.email, page: 1 });
    expect(screen.getByRole('heading', { level: 2, name: 'Laura Barrios' })).toBeTruthy();
    expect(screen.getByText('Esta consulta queda en la auditoría de Laura.')).toBeTruthy();
    expect(screen.getByText('Verá la fecha y tu rol (Soporte).')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Mostrando 1–10 de 214 archivos')).toBeTruthy();
  });

  it('CA-13: «Siguiente» pide la página 2 del mismo correo', async () => {
    const load = loadOf(clientFilesPage([clientFile()], { total: 11 }));
    await searchFor(LAURA.email, load);

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(load).toHaveBeenLastCalledWith({ email: LAURA.email, page: 2 });
  });

  it('CA-17: vacío: el cliente no tiene archivos, ni cargas sin terminar', async () => {
    await searchFor(LAURA.email, loadOf(clientFilesPage([])));

    expect(screen.getByRole('heading', { name: 'Laura Barrios no tiene archivos.' })).toBeTruthy();
    expect(
      screen.getByText(
        'No hay archivos en su cuenta ni en su papelera. Las cargas que no terminaron no aparecen aquí.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('CA-17: cargando: esqueleto y «Buscando la cuenta y sus archivos…»', async () => {
    await searchFor(LAURA.email, loadOf());

    expect(screen.getByRole('status').textContent).toContain('Buscando la cuenta y sus archivos…');
  });

  it('CA-13: no-encontrado: el mismo texto sin auditoría; «Limpiar búsqueda» vacía y enfoca el campo', async () => {
    await searchFor(
      'lucia.barios@gmail.com',
      loadOf(apiError(404, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND)),
    );

    expect(
      screen.getByRole('heading', {
        name: 'No encontramos una cuenta de cliente con «lucia.barios@gmail.com».',
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/queda en la auditoría de/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    const input = screen.getByLabelText('Correo del cliente') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(
      screen.getByRole('heading', { name: 'Busca a un cliente para ver sus archivos' }),
    ).toBeTruthy();
  });

  it('CA-17: error con «Reintentar», que repite la búsqueda', async () => {
    const load = loadOf(new TypeError('Failed to fetch'), clientFilesPage([clientFile()]));
    await searchFor(LAURA.email, load);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos completar la búsqueda.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it.each([
    ['', BACKOFFICE_FIELD_MESSAGES.REQUIRED],
    ['laura@', BACKOFFICE_FIELD_MESSAGES.INVALID_EMAIL],
  ])('CA-13: un correo «%s» no se busca y el campo explica qué falta', async (email, message) => {
    const load = loadOf();
    await searchFor(email, load);

    const input = screen.getByLabelText('Correo del cliente');
    expect(load).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(message)).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('CA-14: un 403 muestra la pantalla común «Sin permiso»', async () => {
    await searchFor(LAURA.email, loadOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN)));

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
