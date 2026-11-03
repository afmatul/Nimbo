/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageRequestError } from '../../storage/storage-request-error';
import type { SharingApi } from '../sharing-api';
import { directEntry, fakeSharingApi, NODE_ID } from '../test-sharing';

import { ShareDialog } from './share-dialog';

const TARGET = { nodeType: 'file', nodeId: NODE_ID, name: 'Propuesta comercial v3.pdf' } as const;
const EMAIL = 'juan@nimbo.gt';

const listOf = (...entries: unknown[]) =>
  Promise.resolve({ entries }) as ReturnType<SharingApi['listAccess']>;

function renderDialog(api: SharingApi, onClose = jest.fn()): void {
  render(<ShareDialog api={api} target={TARGET} onClose={onClose} />);
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Compartir «Propuesta comercial v3.pdf»' });
}

function emailInput(): HTMLInputElement {
  return within(dialog()).getByRole('textbox', { name: 'Correo de la persona' });
}

async function shareWith(email: string, level: 'Lector' | 'Editor' = 'Lector'): Promise<void> {
  await userEvent.type(emailInput(), email);
  await userEvent.click(within(dialog()).getByRole('radio', { name: new RegExp(`^${level}`) }));
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Compartir' }));
}

describe('ShareDialog: compartir y ver accesos (spec 012b CA-1, CA-2, CA-3)', () => {
  afterEach(() => jest.useRealTimers());

  it('CA-1: abre con el foco en el correo y la lista de accesos cargando', async () => {
    renderDialog(fakeSharingApi());

    await waitFor(() => expect(document.activeElement).toBe(emailInput()));
    expect(within(dialog()).getByRole('status').textContent).toContain(
      'Cargando quién tiene acceso…',
    );
  });

  it('CA-2: comparte, muestra el éxito y a la persona en la lista sin recargar', async () => {
    const listAccess = jest
      .fn<ReturnType<SharingApi['listAccess']>, Parameters<SharingApi['listAccess']>>()
      .mockImplementationOnce(() => listOf())
      .mockImplementation(() => listOf(directEntry()));
    const share = jest.fn(() => Promise.resolve(directEntry()));
    renderDialog(fakeSharingApi({ listAccess, share }));
    await screen.findByText('Todavía no compartiste esto con nadie.');

    await shareWith(EMAIL, 'Editor');

    expect(share).toHaveBeenCalledWith({
      nodeType: 'file',
      nodeId: NODE_ID,
      email: EMAIL,
      level: 'EDITOR',
    });
    expect(
      await within(dialog()).findByText('Listo: Juan Cortés ya tiene acceso como Editor.'),
    ).toBeTruthy();
    expect(await within(dialog()).findByText('juan@nimbo.gt')).toBeTruthy();
    expect(emailInput().value).toBe('');
  });

  it('CA-3: un correo mal escrito se corrige antes de llamar a la API', async () => {
    const api = fakeSharingApi();
    renderDialog(api);

    await shareWith('juan@');

    expect(within(dialog()).getByRole('alert').textContent).toContain(
      'Escribe un correo válido, por ejemplo nombre@dominio.com.',
    );
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(emailInput().value).toBe('juan@');
    expect(api.share).not.toHaveBeenCalled();
  });

  it('CA-3: destinatario no encontrado conserva lo escrito y «Corregir el correo» lleva al campo', async () => {
    const share = jest.fn(() =>
      Promise.reject(new StorageRequestError(422, SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND)),
    );
    renderDialog(fakeSharingApi({ listAccess: jest.fn(() => listOf()), share }));

    await shareWith('nadie@nimbo.gt', 'Editor');

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toContain(
      'No encontramos una cuenta de Nimbo con ese correo. Revisa que esté bien escrito o pídele que se registre.',
    );
    expect(emailInput().value).toBe('nadie@nimbo.gt');
    expect(
      (within(dialog()).getByRole('radio', { name: /^Editor/ }) as HTMLInputElement).checked,
    ).toBe(true);
    await userEvent.click(within(alert).getByRole('button', { name: 'Corregir el correo' }));
    expect(document.activeElement).toBe(emailInput());
  });

  it('CA-3: demasiados intentos dice cuánto esperar y conserva lo escrito', async () => {
    const share = jest.fn(() =>
      Promise.reject(
        new StorageRequestError(429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, {
          retryAfterSeconds: 120,
        }),
      ),
    );
    renderDialog(fakeSharingApi({ share }));

    await shareWith(EMAIL);

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toContain(
      'Hiciste demasiados intentos. Espera 2 minutos e inténtalo de nuevo.',
    );
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(emailInput().value).toBe(EMAIL);
  });

  it('CA-2: si tarda más de 2 s, el botón dice «Compartiendo…»', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    renderDialog(fakeSharingApi());

    await user.type(emailInput(), EMAIL);
    await user.click(within(dialog()).getByRole('button', { name: 'Compartir' }));
    act(() => jest.advanceTimersByTime(2_000));

    const button = within(dialog()).getByRole('button', { name: 'Compartiendo…' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('CA-1: «Cerrar» lo cierra', async () => {
    const onClose = jest.fn();
    renderDialog(fakeSharingApi(), onClose);

    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalled();
  });
});
