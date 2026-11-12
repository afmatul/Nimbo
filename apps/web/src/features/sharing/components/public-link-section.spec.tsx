/**
 * @jest-environment jsdom
 */
import { SHARING_ERROR_CODES, STORAGE_ERROR_CODES, type CurrentPublicLink } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { jsonResponse } from '../../../lib/test-http';
import { createAuthFetch } from '../../identity/session/auth-fetch';
import { SpaceProvider } from '../../storage/components/space-provider';
import { createStorageHttp } from '../../storage/storage-http';
import { StorageRequestError } from '../../storage/storage-request-error';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import { createSharingApi, type SharingApi } from '../sharing-api';
import {
  fakeSharingApi,
  never,
  NODE_ID,
  PUBLIC_LINK_ID,
  PUBLIC_LINK_URL,
  publicLink,
} from '../test-sharing';

import { PublicLinkSection, type CancelOpenPart } from './public-link-section';

const HELP = 'Cualquiera con el enlace puede descargar este archivo, sin cuenta en Nimbo.';
const GENERATED = 'Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.';
const NOTE =
  'Por seguridad, el enlace solo se ve al generarlo. Si lo perdiste, genera otro: el actual dejará de funcionar.';
const REPLACE_WARNING = 'El enlace actual dejará de funcionar para quien lo tenga.';
const REVOKE_QUESTION = '¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.';
const REVOKED = 'Revocamos el enlace. Ya no sirve para descargar el archivo.';
const NETWORK = 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.';
const READ_ONLY = 'No puedes generar enlaces. Para hacerlo, renueva tu plan.';
const EXPIRED = publicLink({
  status: 'expired',
  expiresAt: '2026-11-03T15:15:00.000Z',
  hasPassword: false,
});

const current = (...links: (ReturnType<typeof publicLink> | null)[]) => {
  const mock = jest.fn<Promise<CurrentPublicLink>, [string]>();
  links.forEach((link) => mock.mockResolvedValueOnce({ link }));
  return mock.mockResolvedValue({ link: links.at(-1) ?? null });
};
const created = (link = publicLink()) =>
  jest.fn(() => Promise.resolve({ link, url: PUBLIC_LINK_URL }));
const rejectWith = (status: number, code: string) =>
  jest.fn(() => Promise.reject(new StorageRequestError(status, code)));

interface Rendered {
  readonly onBusyChange: jest.Mock;
  readonly cancelRef: React.MutableRefObject<CancelOpenPart | null>;
}

function renderSection(api: SharingApi, readOnly = false): Rendered {
  const onBusyChange = jest.fn();
  const cancelRef: React.MutableRefObject<CancelOpenPart | null> = { current: null };
  const summary = { ...spaceSummaryWith(3 * GB), readOnly };
  render(
    <SpaceProvider api={{ spaceSummary: () => Promise.resolve(summary) }} uploadedCount={0}>
      <PublicLinkSection
        api={api}
        fileId={NODE_ID}
        onBusyChange={onBusyChange}
        cancelRef={cancelRef}
      />
    </SpaceProvider>,
  );
  return { onBusyChange, cancelRef };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });
const findButton = (name: string): Promise<HTMLElement> => screen.findByRole('button', { name });
const expiry = (label: string): HTMLInputElement =>
  screen.getByRole('radio', { name: label }) as HTMLInputElement;

describe('PublicLinkSection: estado del enlace (spec 013c CA-1, CA-7, CA-13, CA-14)', () => {
  it('CA-1: muestra «Cargando el enlace público…» y luego «sin enlace» con su ayuda', async () => {
    const api = fakeSharingApi({ currentPublicLink: current(null) });
    renderSection(api);

    expect(screen.getByRole('heading', { level: 3, name: 'Enlace público' })).toBeTruthy();
    expect(screen.getByText('Cargando el enlace público…')).toBeTruthy();
    expect(await screen.findByText(HELP)).toBeTruthy();
    expect(button('Crear enlace público')).toBeTruthy();
    expect(api.currentPublicLink).toHaveBeenCalledWith(NODE_ID);
  });

  it('CA-7: un enlace activo muestra «Activo», fechas, contraseña y la nota, sin la URL', async () => {
    renderSection(
      fakeSharingApi({ currentPublicLink: current(publicLink({ hasPassword: true })) }),
    );

    expect(await screen.findByText('Activo')).toBeTruthy();
    expect(screen.getByText('Vence el 18 nov 2026, 14:30')).toBeTruthy();
    expect(screen.getByText('Con contraseña')).toBeTruthy();
    expect(screen.getByText('Creado el 11 nov 2026, 14:30')).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(button('Generar otro enlace')).toBeTruthy();
    expect(button('Revocar enlace')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Enlace generado' })).toBeNull();
    expect(document.body.textContent).not.toContain(PUBLIC_LINK_URL);
  });

  it('CA-7: un enlace vencido muestra «Vencido» y «Venció el …», sin la nota', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(EXPIRED) }));

    expect(await screen.findByText('Vencido')).toBeTruthy();
    expect(screen.getByText('Venció el 3 nov 2026, 09:15')).toBeTruthy();
    expect(screen.getByText('Sin contraseña')).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(button('Generar otro enlace')).toBeTruthy();
    expect(button('Revocar enlace')).toBeTruthy();
  });

  it('CA-13: si la carga falla, avisa con «Reintentar», que vuelve a pedir el estado', async () => {
    const currentPublicLink = jest
      .fn<Promise<CurrentPublicLink>, [string]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ link: null });
    renderSection(fakeSharingApi({ currentPublicLink }));

    expect((await screen.findByRole('alert')).textContent).toContain(NETWORK);
    await userEvent.click(button('Reintentar'));

    expect(await screen.findByText(HELP)).toBeTruthy();
    expect(currentPublicLink).toHaveBeenCalledTimes(2);
  });

  it('CA-14: si el archivo ya no existe, lo dice sin botón', async () => {
    renderSection(
      fakeSharingApi({
        currentPublicLink: rejectWith(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND),
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Este archivo ya no está disponible. Puede que esté en la papelera.',
    );
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});

/** `SharingApi` real sobre un `fetch` simulado: el cuerpo que llega a la API es el de verdad (CA-4). */
function realApi(fetchMock: jest.Mock): SharingApi {
  global.fetch = fetchMock;
  return createSharingApi(
    createStorageHttp(
      'http://localhost/api/v1',
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );
}

function linkServer(): jest.Mock {
  let generated = false;
  return jest.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      generated = true;
      return Promise.resolve(jsonResponse({ link: publicLink(), url: PUBLIC_LINK_URL }, 201));
    }
    return Promise.resolve(jsonResponse({ link: generated ? publicLink() : null }));
  });
}

describe('PublicLinkSection: generar (spec 013c CA-3, CA-4, §5)', () => {
  it('CA-4: con la contraseña vacía, la API recibe el cuerpo sin `password`', async () => {
    const fetchMock = linkServer();
    renderSection(realApi(fetchMock));

    await userEvent.click(await findButton('Crear enlace público'));
    await userEvent.click(button('Generar enlace'));
    await screen.findByText(GENERATED);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ fileId: NODE_ID, expiresInDays: 7 });
  });

  it('CA-3: genera, muestra la URL una vez con «Copiar enlace» enfocado e informa la acción en curso', async () => {
    const api = fakeSharingApi({
      currentPublicLink: current(null, publicLink()),
      createPublicLink: created(),
    });
    const { onBusyChange } = renderSection(api);

    await userEvent.click(await findButton('Crear enlace público'));
    await waitFor(() => expect(document.activeElement).toBe(expiry('7 días')));
    await userEvent.click(button('Generar enlace'));

    expect(await screen.findByText(GENERATED)).toBeTruthy();
    const field = screen.getByRole('textbox', { name: 'Enlace generado' }) as HTMLInputElement;
    expect(field.value).toBe(PUBLIC_LINK_URL);
    expect(document.activeElement).toBe(button('Copiar enlace'));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('§5: la URL no llega al almacenamiento del navegador ni a la consola', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
    renderSection(
      fakeSharingApi({ currentPublicLink: current(null), createPublicLink: created() }),
    );

    await userEvent.click(await findButton('Crear enlace público'));
    await userEvent.click(button('Generar enlace'));
    await screen.findByText(GENERATED);

    const received = [setItem, ...consoleSpies].flatMap((spy) => spy.mock.calls.flat());
    expect(received.map(String).join(' ')).not.toContain(PUBLIC_LINK_URL);
    [setItem, ...consoleSpies].forEach((spy) => spy.mockRestore());
  });

  it('CA-15: «Cancelar» cierra el formulario y devuelve el foco a «Crear enlace público»', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(null) }));

    await userEvent.click(await findButton('Crear enlace público'));
    await userEvent.click(button('Cancelar'));

    expect(screen.queryByRole('form', { name: 'Nuevo enlace público' })).toBeNull();
    expect(document.activeElement).toBe(button('Crear enlace público'));
  });
});

describe('PublicLinkSection: reemplazar (spec 013c CA-8)', () => {
  it('CA-8: pide confirmar en línea con el formulario y el foco en la opción marcada', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(publicLink()) }));

    await userEvent.click(await findButton('Generar otro enlace'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(REPLACE_WARNING)).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Nuevo enlace público' })).toBeTruthy();
    expect(button('Generar otro enlace')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(expiry('7 días')));
  });

  it('CA-8: al cancelar vuelve al resumen sin cambios y el foco a «Generar otro enlace»', async () => {
    const api = fakeSharingApi({ currentPublicLink: current(publicLink()) });
    renderSection(api);

    await userEvent.click(await findButton('Generar otro enlace'));
    await userEvent.click(button('Cancelar'));

    expect(screen.queryByText(REPLACE_WARNING)).toBeNull();
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(document.activeElement).toBe(button('Generar otro enlace'));
    expect(api.createPublicLink).not.toHaveBeenCalled();
  });

  it('CA-8: al confirmar muestra la URL nueva con el aviso del reemplazo', async () => {
    renderSection(
      fakeSharingApi({ currentPublicLink: current(publicLink()), createPublicLink: created() }),
    );

    await userEvent.click(await findButton('Generar otro enlace'));
    await userEvent.click(button('Generar otro enlace'));

    expect(
      await screen.findByText(
        'Generamos otro enlace y el anterior dejó de funcionar. Cópialo ahora: por seguridad, no podrás volver a verlo.',
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Enlace generado' }) as HTMLInputElement).value,
    ).toBe(PUBLIC_LINK_URL);
  });

  it('CA-8 (D-5): con un enlace vencido el formulario aparece sin la advertencia', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(EXPIRED) }));

    await userEvent.click(await findButton('Generar otro enlace'));

    expect(screen.getByRole('form', { name: 'Nuevo enlace público' })).toBeTruthy();
    expect(screen.queryByText(REPLACE_WARNING)).toBeNull();
  });
});

async function openRevoke(): Promise<HTMLElement> {
  await userEvent.click(await findButton('Revocar enlace'));
  return screen.getByRole('group', { name: REVOKE_QUESTION });
}

describe('PublicLinkSection: revocar (spec 013c CA-9, CA-13, CA-14)', () => {
  afterEach(() => jest.useRealTimers());

  it('CA-9: confirma en línea con el foco en «Cancelar», que lo devuelve a «Revocar enlace»', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(publicLink()) }));

    const confirm = await openRevoke();
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('group', { name: REVOKE_QUESTION })).toBeNull();
    expect(document.activeElement).toBe(button('Revocar enlace'));
  });

  it('CA-9: al confirmar, avisa, vuelve a «sin enlace» y el foco pasa a «Crear enlace público»', async () => {
    const api = fakeSharingApi({
      currentPublicLink: current(publicLink(), null),
      revokePublicLink: jest.fn(() => Promise.resolve()),
    });
    renderSection(api);

    const confirm = await openRevoke();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));

    expect(await screen.findByText(REVOKED)).toBeTruthy();
    expect(await screen.findByText(HELP)).toBeTruthy();
    expect(api.revokePublicLink).toHaveBeenCalledWith(PUBLIC_LINK_ID);
    await waitFor(() => expect(document.activeElement).toBe(button('Crear enlace público')));
  });

  it('CA-9: pasados 2 s dice «Revocando…» e informa la acción en curso', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const { onBusyChange } = renderSection(
      fakeSharingApi({
        currentPublicLink: current(publicLink()),
        revokePublicLink: jest.fn((): Promise<void> => never()),
      }),
    );

    await user.click(await findButton('Revocar enlace'));
    const confirm = screen.getByRole('group', { name: REVOKE_QUESTION });
    await user.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    act(() => jest.advanceTimersByTime(2_000));

    const revoking = within(confirm).getByRole('button', { name: 'Revocando…' });
    expect(revoking.getAttribute('aria-disabled')).toBe('true');
    expect(within(confirm).getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
  });

  it('CA-14: si el enlace ya no existe, «Actualizar» vuelve a pedir el estado', async () => {
    const currentPublicLink = current(publicLink(), null);
    renderSection(
      fakeSharingApi({
        currentPublicLink,
        revokePublicLink: rejectWith(404, SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND),
      }),
    );

    const confirm = await openRevoke();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Este enlace ya no existe. Actualiza para ver el estado actual.',
    );
    await userEvent.click(within(alert).getByRole('button', { name: 'Actualizar' }));

    expect(await screen.findByText(HELP)).toBeTruthy();
    expect(currentPublicLink).toHaveBeenCalledTimes(2);
  });

  it('CA-13: si la red falla al revocar, avisa con «Reintentar», que vuelve a revocar', async () => {
    const revokePublicLink = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined);
    renderSection(
      fakeSharingApi({ currentPublicLink: current(publicLink(), null), revokePublicLink }),
    );

    const confirm = await openRevoke();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(NETWORK);
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(REVOKED)).toBeTruthy();
    expect(revokePublicLink).toHaveBeenCalledTimes(2);
  });
});

describe('PublicLinkSection: solo lectura (spec 013c CA-10)', () => {
  it('CA-10: sin enlace, avisa con `ReadOnlyBanner` y no ofrece crear', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(null) }), true);

    expect(await screen.findByText('Tu cuenta está en solo lectura.')).toBeTruthy();
    expect(screen.getByText(READ_ONLY)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Renovar plan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Crear enlace público' })).toBeNull();
  });

  it('CA-10: con enlace, solo «Revocar enlace» sigue y no se muestra la nota', async () => {
    renderSection(fakeSharingApi({ currentPublicLink: current(publicLink()) }), true);

    expect(await findButton('Revocar enlace')).toBeTruthy();
    await screen.findByText(READ_ONLY);
    expect(screen.queryByRole('button', { name: 'Generar otro enlace' })).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('CA-10: el `403` tardío muestra el mismo aviso sobre el formulario y conserva lo elegido', async () => {
    renderSection(
      fakeSharingApi({
        currentPublicLink: current(null),
        createPublicLink: rejectWith(403, STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY),
      }),
    );

    await userEvent.click(await findButton('Crear enlace público'));
    await userEvent.click(expiry('30 días'));
    await userEvent.click(button('Generar enlace'));

    expect(await screen.findByText(READ_ONLY)).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Nuevo enlace público' })).toBeTruthy();
    expect(expiry('30 días').checked).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PublicLinkSection: Escape (spec 013c CA-11)', () => {
  it('CA-11: el callback registrado cancela el formulario abierto y dice que había algo', async () => {
    const { cancelRef } = renderSection(fakeSharingApi({ currentPublicLink: current(null) }));

    await userEvent.click(await findButton('Crear enlace público'));
    let cancelled = false;
    act(() => {
      cancelled = cancelRef.current?.() ?? false;
    });

    expect(cancelled).toBe(true);
    expect(screen.queryByRole('form', { name: 'Nuevo enlace público' })).toBeNull();
    expect(document.activeElement).toBe(button('Crear enlace público'));
  });

  it('CA-11: sin nada abierto, el callback no cancela nada', async () => {
    const { cancelRef } = renderSection(fakeSharingApi({ currentPublicLink: current(null) }));
    await screen.findByText(HELP);

    expect(cancelRef.current?.()).toBe(false);
  });
});
