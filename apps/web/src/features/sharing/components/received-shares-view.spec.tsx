/**
 * @jest-environment jsdom
 */
import {
  SHARED_ERROR_CODES,
  SHARING_ERROR_CODES,
  type DownloadUrlResponse,
} from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { StorageApi } from '../../storage/api';
import { SpaceProvider } from '../../storage/components/space-provider';
import { UploadsProvider } from '../../storage/components/uploads-provider';
import { StorageRequestError } from '../../storage/storage-request-error';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import type { SharingApi } from '../sharing-api';
import {
  fakeSharingApi,
  NODE_ID,
  PARENT_FOLDER_ID,
  RECEIVED_FOLDER,
  receivedShare,
  SHARE_ID,
  SHARED_AT,
} from '../test-sharing';

import { ReceivedSharesView } from './received-shares-view';

const received = (...entries: unknown[]) =>
  Promise.resolve({ entries }) as ReturnType<SharingApi['listReceived']>;

const SIGNED: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-10-30T10:05:00.000Z',
};

interface RenderOptions {
  readonly readOnly?: boolean;
  readonly storage?: Partial<StorageApi>;
  readonly openUrl?: (url: string) => void;
}

async function renderReceived(api: SharingApi, options: RenderOptions = {}): Promise<void> {
  const summary = { ...spaceSummaryWith(3 * GB), readOnly: options.readOnly ?? false };
  const storage = { downloadUrl: jest.fn(() => Promise.resolve(SIGNED)), ...options.storage };
  render(
    <UploadsProvider api={storage as unknown as StorageApi}>
      <SpaceProvider api={{ spaceSummary: () => Promise.resolve(summary) }} uploadedCount={0}>
        <ReceivedSharesView api={api} openUrl={options.openUrl ?? jest.fn()} />
      </SpaceProvider>
    </UploadsProvider>,
  );
  await act(async () => undefined);
}

const withTwo = (overrides: Partial<SharingApi> = {}): SharingApi =>
  fakeSharingApi({
    listReceived: jest.fn(() => received(receivedShare(), RECEIVED_FOLDER)),
    ...overrides,
  });

async function chooseAction(name: string, action: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: action }));
}

const DOCX = 'Informe_trimestral_Q3.docx';

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`Sin la fila de ${name}`);
  return row;
}

/** Tras un «Salir» fallido la lista sigue con sus dos elementos: nada se quita a medias. */
function expectBothRows(): void {
  expect(screen.getByText('2 elementos')).toBeTruthy();
  expect(rowOf(DOCX)).toBeTruthy();
  expect(rowOf('Contratos 2026')).toBeTruthy();
}

describe('ReceivedSharesView: «Compartidos conmigo» (spec 012b CA-8, CA-9, CA-11)', () => {
  it('CA-8: mientras carga lo anuncia', async () => {
    await renderReceived(fakeSharingApi());

    expect(screen.getByRole('heading', { level: 1, name: 'Compartidos conmigo' })).toBeTruthy();
    const loading = screen
      .getAllByRole('status')
      .find((status) => status.textContent?.includes('Cargando lo que te compartieron…'));
    expect(loading).toBeTruthy();
  });

  it('CA-8: sin elementos, explica cómo llegan y ofrece ir a Mis archivos', async () => {
    await renderReceived(fakeSharingApi({ listReceived: jest.fn(() => received()) }));

    expect(screen.getByRole('heading', { name: 'Todavía no te han compartido nada' })).toBeTruthy();
    expect(
      screen.getByText(
        'Lo que compartan contigo aparecerá aquí. Para recibirlo, la otra persona debe compartir con el correo de tu cuenta.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
  });

  it('CA-8, CA-9: cada elemento con nombre, tipo, quién lo compartió, mi nivel y fecha; abre su carpeta o su ficha', async () => {
    await renderReceived(
      fakeSharingApi({ listReceived: jest.fn(() => received(receivedShare(), RECEIVED_FOLDER)) }),
    );

    expect(screen.getByText('2 elementos')).toBeTruthy();
    const docx = rowOf('Informe_trimestral_Q3.docx');
    expect(
      within(docx).getByRole('link', { name: 'Informe_trimestral_Q3.docx' }).getAttribute('href'),
    ).toBe(`/archivos/archivo/${NODE_ID}`);
    expect(within(docx).getAllByText('Andrea Morales').length).toBeGreaterThan(0);
    expect(within(docx).getAllByText('Editor').length).toBeGreaterThan(0);
    expect(docx.querySelector(`time[datetime="${SHARED_AT}"]`)).not.toBeNull();

    const folder = rowOf('Contratos 2026');
    expect(within(folder).getByRole('link', { name: 'Contratos 2026' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${PARENT_FOLDER_ID}`,
    );
    expect(within(folder).getAllByText('Carpeta').length).toBeGreaterThan(0);
    expect(within(folder).getAllByText('Lector').length).toBeGreaterThan(0);
  });

  it('CA-11: si la lista no carga, lo dice y «Reintentar» vuelve a pedirla', async () => {
    const listReceived = jest
      .fn<ReturnType<SharingApi['listReceived']>, []>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(() => received(receivedShare()));
    await renderReceived(fakeSharingApi({ listReceived }));

    expect(screen.getByRole('alert').textContent).toContain(
      'No pudimos cargar lo que te compartieron.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('link', { name: 'Informe_trimestral_Q3.docx' })).toBeTruthy();
    expect(listReceived).toHaveBeenCalledTimes(2);
  });
});

describe('ReceivedSharesView: «Salir» (spec 012b CA-9, CA-10, CA-11)', () => {
  it('CA-9: el menú de un archivo ofrece Abrir, Descargar y Salir; el de una carpeta, Abrir y Salir', async () => {
    const openUrl = jest.fn();
    await renderReceived(withTwo(), { openUrl });

    await userEvent.click(screen.getByRole('button', { name: `Acciones de ${DOCX}` }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Abrir',
      'Descargar',
      'Salir',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Descargar' }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(SIGNED.url));

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Contratos 2026' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Abrir',
      'Salir',
    ]);
    expect(screen.getByRole('menuitem', { name: 'Abrir' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${PARENT_FOLDER_ID}`,
    );
  });

  it('CA-10: confirma, sale, el elemento desaparece sin recargar y el foco vuelve al título', async () => {
    const api = withTwo({ leave: jest.fn(() => Promise.resolve()) });
    await renderReceived(api);

    await chooseAction(DOCX, 'Salir');
    const dialog = screen.getByRole('alertdialog', { name: `¿Salir de «${DOCX}»?` });
    expect(
      within(dialog).getByText(
        'Dejarás de verlo. Quien lo compartió puede volver a compartírtelo.',
      ),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir' }));

    expect(api.leave).toHaveBeenCalledWith(SHARE_ID);
    await waitFor(() => expect(screen.queryByRole('link', { name: DOCX })).toBeNull());
    expect(screen.getByText('1 elemento')).toBeTruthy();
    expect(await screen.findByText(`Saliste de «${DOCX}».`)).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Compartidos conmigo' }),
    );
    expect(api.listReceived).toHaveBeenCalledTimes(1);
  });

  it('CA-10: mientras sale, lo anuncia y los botones quedan deshabilitados', async () => {
    await renderReceived(withTwo());

    await chooseAction(DOCX, 'Salir');
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir' }));

    expect(within(dialog).getByRole('status').textContent).toBe(`Saliendo de «${DOCX}»…`);
    expect(
      (within(dialog).getByRole('button', { name: 'Saliendo…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(dialog).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('CA-11: si el acceso ya no existe, la lista no cambia y «Actualizar lista» la relee', async () => {
    const leave = jest.fn(() =>
      Promise.reject(new StorageRequestError(404, SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND)),
    );
    const api = withTwo({ leave });
    await renderReceived(api);

    await chooseAction(DOCX, 'Salir');
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Ese acceso ya no existe.');
    expect(alert.textContent).toContain(
      `Es posible que quien compartió «${DOCX}» lo haya quitado. Actualiza la lista para ver tus accesos vigentes.`,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('link', { name: DOCX })).toBeTruthy();
    await userEvent.click(within(alert).getByRole('button', { name: 'Actualizar lista' }));

    expect(api.listReceived).toHaveBeenCalledTimes(2);
  });

  it('CA-11: sin conexión, el diálogo sigue abierto con el motivo y «Reintentar»', async () => {
    const leave = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined);
    await renderReceived(withTwo({ leave }));

    await chooseAction(DOCX, 'Salir');
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir' }),
    );

    const dialog = screen.getByRole('alertdialog');
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      `No pudimos salir de «${DOCX}». Revisa tu conexión e inténtalo de nuevo; seguirás viéndolo hasta entonces.`,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.queryByRole('link', { name: DOCX })).toBeNull());
    expect(leave).toHaveBeenCalledTimes(2);
  });

  it('CA-11: con error de red, el motivo y «Reintentar» en el diálogo; la lista queda entera', async () => {
    await renderReceived(
      withTwo({ leave: jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))) }),
    );

    await chooseAction(DOCX, 'Salir');
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      `No pudimos salir de «${DOCX}». Revisa tu conexión e inténtalo de nuevo; seguirás viéndolo hasta entonces.`,
    );
    expect(within(dialog).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expectBothRows();
  });

  it('CA-11: con 429, el mensaje de espera del catálogo por `code`; la lista queda entera', async () => {
    const leave = jest.fn(() =>
      Promise.reject(
        new StorageRequestError(429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, {
          retryAfterSeconds: 120,
        }),
      ),
    );
    await renderReceived(withTwo({ leave }));

    await chooseAction(DOCX, 'Salir');
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salir' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Hiciste demasiados intentos. Espera 2 minutos e inténtalo de nuevo.',
    );
    expect(screen.queryByText('Ese acceso ya no existe.')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expectBothRows();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('CA-10: en solo lectura avisa y «Salir» sigue disponible', async () => {
    const api = withTwo({ leave: jest.fn(() => Promise.resolve()) });
    await renderReceived(api, { readOnly: true });

    expect(
      await screen.findByText(
        'Puedes ver y descargar lo que te compartieron, y salir de ello. Para editar o subir archivos, renueva tu plan.',
      ),
    ).toBeTruthy();
    await chooseAction('Contratos 2026', 'Salir');
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir' }),
    );

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Contratos 2026' })).toBeNull());
  });
});
