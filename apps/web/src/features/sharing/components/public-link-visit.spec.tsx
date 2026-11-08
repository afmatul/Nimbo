/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiClientError } from '../../../lib/api-error';
import { PREPARING_DELAY_MS } from '../../../lib/use-preparing-download';
import type { PublicLinkVisitorApi } from '../public-link-visitor-api';
import { PUBLIC_LINK_DETAILS, SIGNED_DOWNLOAD } from '../test-public-link';

import { PublicLinkVisitView } from './public-link-visit';

const TOKEN = 'AbC-123_xyz';
const WITH_PASSWORD = { ...PUBLIC_LINK_DETAILS, requiresPassword: true };
const PASSWORD_LABEL = 'Contraseña del enlace';
const HINT = 'No es la de tu cuenta: te la da quien compartió el enlace.';
const WRONG_PASSWORD = 'La contraseña no es correcta. Revísala y vuelve a intentarlo.';

function apiError(code: string, retryAfterSeconds?: number): ApiClientError {
  return new ApiClientError({ code, message: code, correlationId: 'c-1', retryAfterSeconds });
}

const NETWORK_DOWN = apiError('INTERNAL_ERROR');
const UNAVAILABLE = apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE);
const PASSWORD_INVALID = apiError(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID);
const tooManyRequests = (seconds?: number) =>
  apiError(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, seconds);

function fakeApi(details = PUBLIC_LINK_DETAILS): jest.Mocked<PublicLinkVisitorApi> {
  return {
    open: jest.fn().mockResolvedValue(details),
    download: jest.fn().mockResolvedValue(SIGNED_DOWNLOAD),
  };
}

function renderVisit(api: PublicLinkVisitorApi, openUrl = jest.fn()) {
  render(<PublicLinkVisitView api={api} openUrl={openUrl} />);
  return { openUrl };
}

const shareHeading = () =>
  screen.findByRole('heading', { level: 1, name: 'Andrea Morales compartió un archivo contigo' });
const downloadButton = () => screen.getByRole('button', { name: 'Descargar' });
const passwordInput = () => screen.getByLabelText(PASSWORD_LABEL);

async function submitPassword(password: string): Promise<void> {
  const user = userEvent.setup();
  if (password !== '') await user.type(passwordInput(), password);
  await user.click(downloadButton());
}

describe('PublicLinkVisitView (013b §6)', () => {
  beforeEach(() => window.history.replaceState(null, '', `/enlace#${TOKEN}`));

  it('CA-1: cargando: anuncia la carga con un h1 de la página', () => {
    const api = fakeApi();
    api.open.mockReturnValue(new Promise(() => undefined));
    renderVisit(api);

    expect(screen.getByRole('status').textContent).toBe('Cargando el archivo compartido…');
    expect(screen.getByRole('heading', { level: 1, name: 'Archivo compartido' })).toBeTruthy();
  });

  it('CA-1: sin contraseña: quién, nombre, «2,4 MB», vencimiento absoluto y «Descargar», nada más', async () => {
    renderVisit(fakeApi());

    expect(await shareHeading()).toBeTruthy();
    expect(screen.getByText('Informe_trimestral_Q3.docx')).toBeTruthy();
    expect(screen.getByText('2,4 MB')).toBeTruthy();
    expect(screen.getByText('Vence el 14 nov 2026, 14:30')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Descargar',
    ]);
    expect(screen.queryByLabelText(PASSWORD_LABEL)).toBeNull();
  });

  it.each([
    ['Informe_trimestral_Q3.docx', 'docx'],
    ['Presupuesto.xlsx', 'xlsx'],
    ['Contrato.pdf', 'pdf'],
    ['notas.zip', 'other'],
  ])('CA-1: la baldosa de «%s» lleva el color de su tipo, como el chip', async (name, type) => {
    renderVisit(fakeApi({ ...PUBLIC_LINK_DETAILS, name }));
    await shareHeading();

    const tile = screen.getByText(name).closest('div')?.previousElementSibling as HTMLElement;
    expect(tile.style.color).toBe(`var(--file-${type})`);
    expect(tile.style.backgroundColor).toBe(`var(--file-${type}-bg)`);
    expect(tile.querySelector('svg')).not.toBeNull();
  });

  it('CA-2: con contraseña: la misma ficha sin escribir nada y el campo con su ayuda asociada', async () => {
    const api = fakeApi(WITH_PASSWORD);
    renderVisit(api);

    expect(await shareHeading()).toBeTruthy();
    const input = passwordInput();
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('maxlength')).toBe('128');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      HINT,
    );
    expect(api.download).not.toHaveBeenCalled();
  });

  it('CA-3: descargando: pasados 2 s dice «Preparando descarga…», lo anuncia y no acepta otro clic', async () => {
    jest.useFakeTimers();
    try {
      const api = fakeApi();
      api.download.mockReturnValue(new Promise(() => undefined));
      renderVisit(api);
      await act(async () => {
        await Promise.resolve();
      });
      const button = await screen.findByRole('button', { name: 'Descargar' });

      act(() => button.click());
      act(() => jest.advanceTimersByTime(PREPARING_DELAY_MS));

      const preparing = screen.getByRole('button', { name: 'Preparando descarga…' });
      expect(preparing.getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByRole('status').textContent).toBe('Preparando descarga…');
      act(() => preparing.click());
      expect(api.download).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('CA-3: descarga iniciada: abre la URL firmada, anuncia el éxito y «Descargar» vuelve', async () => {
    const { openUrl } = renderVisit(fakeApi());
    await shareHeading();

    await userEvent.setup().click(downloadButton());

    expect(openUrl).toHaveBeenCalledWith(SIGNED_DOWNLOAD.url);
    expect((await screen.findByRole('status')).textContent).toBe(
      'Tu descarga comenzó. Si no empieza, vuelve a intentarlo.',
    );
    expect(downloadButton().getAttribute('aria-disabled')).toBeNull();
  });

  it('CA-4: con el campo vacío pide la contraseña y no envía nada', async () => {
    const api = fakeApi(WITH_PASSWORD);
    renderVisit(api);
    await shareHeading();

    await submitPassword('');

    expect(screen.getByRole('alert').textContent).toBe('Escribe la contraseña del enlace.');
    expect(passwordInput().getAttribute('aria-invalid')).toBe('true');
    expect(api.download).not.toHaveBeenCalled();
  });

  it('CA-4: contraseña incorrecta: el mensaje, el campo vacío, inválido y con el foco', async () => {
    const api = fakeApi(WITH_PASSWORD);
    api.download.mockRejectedValue(PASSWORD_INVALID);
    renderVisit(api);
    await shareHeading();

    await submitPassword('no-es-esta');

    expect((await screen.findByRole('alert')).textContent).toBe(WRONG_PASSWORD);
    const input = passwordInput() as HTMLInputElement;
    expect(api.download).toHaveBeenCalledWith(TOKEN, 'no-es-esta');
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(document.activeElement).toBe(input);
  });

  it('CA-5: bloqueado al descargar: aviso neutro anunciado, la ficha visible y el campo vacío', async () => {
    const api = fakeApi(WITH_PASSWORD);
    api.download.mockRejectedValue(tooManyRequests(15 * 60));
    renderVisit(api);
    await shareHeading();

    await submitPassword('la-correcta');

    expect((await screen.findByRole('status')).textContent).toBe(
      'Hubo demasiados intentos con este enlace. Espera 15 minutos e inténtalo de nuevo.',
    );
    expect(screen.getByText('Informe_trimestral_Q3.docx')).toBeTruthy();
    expect((passwordInput() as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA-5: el aviso dice «1 minuto» en singular con menos de 60 s de espera', async () => {
    const api = fakeApi();
    api.download.mockRejectedValue(tooManyRequests(30));
    renderVisit(api);
    await shareHeading();

    await userEvent.setup().click(downloadButton());

    expect((await screen.findByRole('status')).textContent).toBe(
      'Hubo demasiados intentos con este enlace. Espera 1 minuto e inténtalo de nuevo.',
    );
  });

  it('CA-5: un 429 al abrir muestra el mismo texto sin ficha y «Reintentar» vuelve a abrir', async () => {
    const api = fakeApi();
    api.open.mockRejectedValueOnce(tooManyRequests(120));
    renderVisit(api);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Hubo demasiados intentos con este enlace.',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Espera 2 minutos e inténtalo de nuevo.')).toBeTruthy();
    expect(screen.queryByText('Informe_trimestral_Q3.docx')).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await shareHeading()).toBeTruthy();
  });

  it('CA-6: no disponible: un solo mensaje, sin ficha ni acción', async () => {
    const api = fakeApi();
    api.open.mockRejectedValue(UNAVAILABLE);
    renderVisit(api);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Este enlace ya no está disponible.' }),
    ).toBeTruthy();
    expect(screen.getByText('Pide a quien te lo compartió uno nuevo.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Archivo compartido' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Informe_trimestral_Q3.docx')).toBeNull();
  });

  it('CA-6: un 404 al descargar deja la página en «no disponible»', async () => {
    const api = fakeApi();
    api.download.mockRejectedValue(UNAVAILABLE);
    renderVisit(api);
    await shareHeading();

    await userEvent.setup().click(downloadButton());

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Este enlace ya no está disponible.' }),
    ).toBeTruthy();
    expect(screen.queryByText('Informe_trimestral_Q3.docx')).toBeNull();
  });

  it('CA-7: error al abrir: su texto, anunciado como error, distinto de no disponible y con «Reintentar»', async () => {
    const api = fakeApi();
    api.open.mockRejectedValueOnce(NETWORK_DOWN);
    renderVisit(api);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar el archivo compartido.');
    expect(alert.textContent).toContain('Revisa tu conexión e inténtalo de nuevo.');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await shareHeading()).toBeTruthy();
    expect(api.open).toHaveBeenCalledTimes(2);
  });

  it('CA-7: la red falla al descargar: aviso sobre la ficha y «Reintentar» vuelve a pedir la URL', async () => {
    const api = fakeApi();
    api.download.mockRejectedValueOnce(NETWORK_DOWN);
    const { openUrl } = renderVisit(api);
    await shareHeading();

    await userEvent.setup().click(downloadButton());

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(
      'No pudimos iniciar la descarga. Revisa tu conexión e inténtalo de nuevo.',
    );
    expect(screen.getByText('Informe_trimestral_Q3.docx')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(SIGNED_DOWNLOAD.url));
    expect(api.download).toHaveBeenCalledTimes(2);
  });
});
