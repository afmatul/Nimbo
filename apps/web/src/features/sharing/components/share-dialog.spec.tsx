/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageRequestError } from '../../storage/storage-request-error';
import type { SharingApi } from '../sharing-api';
import {
  directEntry,
  fakeSharingApi,
  never,
  NODE_ID,
  PARENT_FOLDER_ID,
  PUBLIC_LINK_URL,
  publicLink,
} from '../test-sharing';

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
    expect(within(dialog()).getByText('Cargando quién tiene acceso…').getAttribute('role')).toBe(
      'status',
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

const FOLDER = { nodeType: 'folder', nodeId: PARENT_FOLDER_ID, name: 'Proyecto Alpha' } as const;
const GENERATED = 'Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.';

const withoutLink = (overrides: Partial<SharingApi> = {}): SharingApi =>
  fakeSharingApi({
    currentPublicLink: jest.fn(() => Promise.resolve({ link: null })),
    ...overrides,
  });

async function openLinkForm(): Promise<void> {
  await userEvent.click(
    await within(dialog()).findByRole('button', { name: 'Crear enlace público' }),
  );
}

function overlay(): Element {
  const element = document.querySelector('[data-slot="dialog-overlay"]');
  if (element === null) throw new Error('Sin velo del diálogo');
  return element;
}

describe('ShareDialog: sección «Enlace público» (spec 013c CA-2, CA-11)', () => {
  it('CA-2: un archivo muestra la sección después de «Personas con acceso»', async () => {
    renderDialog(withoutLink());

    const headings = within(dialog()).getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Personas con acceso',
      'Enlace público',
    ]);
  });

  it('CA-2: una carpeta no muestra la sección ni pide nada a la API de enlaces', async () => {
    const api = withoutLink();
    render(<ShareDialog api={api} target={FOLDER} onClose={jest.fn()} />);
    await act(async () => undefined);

    expect(screen.queryByRole('heading', { name: 'Enlace público' })).toBeNull();
    expect(api.currentPublicLink).not.toHaveBeenCalled();
  });

  it('CA-11: Escape con el formulario abierto lo cancela y el diálogo sigue abierto', async () => {
    const onClose = jest.fn();
    renderDialog(withoutLink(), onClose);
    await openLinkForm();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('form', { name: 'Nuevo enlace público' })).toBeNull();
    expect(dialog()).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CA-11: Escape con la confirmación de revocar abierta la cancela y el diálogo sigue abierto', async () => {
    const onClose = jest.fn();
    const currentPublicLink = jest.fn(() => Promise.resolve({ link: publicLink() }));
    renderDialog(fakeSharingApi({ currentPublicLink }), onClose);
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Revocar enlace' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: /¿Revocar el enlace\?/ })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CA-11: con una generación en curso, ni Escape, ni la X, ni un clic fuera lo cierran', async () => {
    const onClose = jest.fn();
    renderDialog(withoutLink({ createPublicLink: jest.fn(() => never()) }), onClose);
    await openLinkForm();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Generar enlace' }));

    await userEvent.keyboard('{Escape}');
    const close = within(dialog()).getByRole('button', { name: 'Cerrar' });
    expect(close.hasAttribute('disabled')).toBe(true);
    fireEvent.pointerDown(overlay());

    expect(dialog()).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CA-11: sin nada en curso, el clic fuera cierra como la X', async () => {
    const onClose = jest.fn();
    renderDialog(withoutLink(), onClose);
    await within(dialog()).findByRole('button', { name: 'Crear enlace público' });

    fireEvent.pointerDown(overlay());

    expect(onClose).toHaveBeenCalled();
  });

  it('CA-11 (D-7): con la URL a la vista y nada abierto, Escape cierra el diálogo', async () => {
    const onClose = jest.fn();
    const createPublicLink = jest.fn(() =>
      Promise.resolve({ link: publicLink(), url: PUBLIC_LINK_URL }),
    );
    renderDialog(withoutLink({ createPublicLink }), onClose);
    await openLinkForm();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Generar enlace' }));
    await within(dialog()).findByText(GENERATED);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
