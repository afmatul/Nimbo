/**
 * @jest-environment jsdom
 */
import {
  EDITING_ERROR_CODES,
  EDITING_EVENTS,
  STORAGE_ERROR_CODES,
  type OpenEditSessionResponse,
  type ReadOnlyReason,
} from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useSession } from '../../identity/session/session-provider';
import { RealtimeContext } from '../../realtime/use-realtime';
import { StorageRequestError } from '../../storage/storage-request-error';
import type { EditingApi } from '../editing-api';
import { loadDocsApi, type DocsApi } from '../onlyoffice/load-docs-api';
import {
  ANDRES,
  DOCUMENT_SERVER_URL,
  EDITOR_CONFIG,
  editingSession,
  FakeRealtimeChannel,
  FILE_ID,
  JULIA,
  LUCIA,
  MARIO,
  ME,
  SOFIA,
  viewingSession,
} from '../test-edit-session';

import { EditorView } from './editor-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../../identity/session/session-provider', () => ({ useSession: jest.fn() }));
jest.mock('../onlyoffice/load-docs-api', () => ({ loadDocsApi: jest.fn() }));

const loadDocsApiMock = jest.mocked(loadDocsApi);
const DocEditor = jest.fn();
const destroyEditor = jest.fn();

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function fakeApi(...responses: OpenEditSessionResponse[]): jest.Mocked<EditingApi> {
  const openSession = jest.fn<Promise<OpenEditSessionResponse>, [string, string | null]>();
  responses.forEach((response) => openSession.mockResolvedValueOnce(response));
  return { openSession };
}

function failingApi(status: number, code: string): jest.Mocked<EditingApi> {
  return {
    openSession: jest.fn<Promise<OpenEditSessionResponse>, [string, string | null]>(() =>
      Promise.reject(new StorageRequestError(status, code)),
    ),
  };
}

async function renderEditor(
  api: EditingApi,
  channel = new FakeRealtimeChannel(),
): Promise<ReturnType<typeof render>> {
  const view = render(
    <RealtimeContext.Provider value={channel}>
      <EditorView fileId={FILE_ID} api={api} />
    </RealtimeContext.Provider>,
  );
  await act(async () => undefined);
  return view;
}

/** Barra del editor: título, modo y acciones. */
function header(): HTMLElement {
  const title = screen.getByRole('heading', { level: 1 });
  const found = title.closest('header');
  if (found === null) throw new Error('Sin barra del editor');
  return found;
}

function presencePanel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'En este documento' });
}

async function expectAccessible(): Promise<void> {
  // `next/link` actualiza su estado al observar la vista; axe corre dentro de `act` para no dejar avisos.
  const results = await act(async () => axe(document.body));
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({
    status: 'authenticated',
    user: ME,
    accessToken: 'token',
    renew: jest.fn(),
    signOut: jest.fn(),
  });
  DocEditor.mockImplementation(() => ({ destroyEditor }));
  loadDocsApiMock.mockResolvedValue({ DocEditor } as unknown as DocsApi);
});

describe('EditorView (016)', () => {
  it('cargando: mientras se abre la sesión anuncia «Abriendo el editor…»', async () => {
    await renderEditor({ openSession: jest.fn(() => never()) });

    expect(screen.getByRole('status').textContent).toContain('Abriendo el editor…');
    await expectAccessible();
  });

  it('cargando: mientras llega el script del editor también anuncia «Abriendo el editor…»', async () => {
    loadDocsApiMock.mockReturnValue(never());
    await renderEditor(fakeApi(editingSession()));

    expect(screen.getByText('Abriendo el editor…')).toBeTruthy();
    expect(DocEditor).not.toHaveBeenCalled();
  });

  describe('coeditando', () => {
    it('CA-1: abre con la conexión en vivo y monta ONLYOFFICE con la configuración firmada tal cual', async () => {
      const api = fakeApi(editingSession());
      await renderEditor(api);

      expect(api.openSession).toHaveBeenCalledWith(FILE_ID, 'conexion-1');
      expect(loadDocsApiMock).toHaveBeenCalledWith(DOCUMENT_SERVER_URL);
      expect(DocEditor).toHaveBeenCalledWith(expect.any(String), EDITOR_CONFIG);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Propuesta_comercial_2027.docx' }),
      ).toBeTruthy();
      expect(within(header()).getByText('Editando')).toBeTruthy();
    });

    it('CA-6: «Estás editando con 2 personas más» y la lista con los nombres reales', async () => {
      await renderEditor(fakeApi(editingSession()));
      const panel = presencePanel();

      expect(within(panel).getByText('Estás editando con 2 personas más')).toBeTruthy();
      expect(within(panel).getByText('3 de 5 editores')).toBeTruthy();
      expect(within(panel).getByText('Quedan 2 lugares para editar a la vez')).toBeTruthy();
      expect(within(panel).getByText('Lucía Barrios (tú)')).toBeTruthy();
      expect(within(panel).getByText('Mario Gómez')).toBeTruthy();
      expect(within(panel).getByText('Julia Cifuentes')).toBeTruthy();
      await expectAccessible();
    });

    it('CA-6: la lista se actualiza con `editing.presence` cuando alguien entra o sale', async () => {
      const channel = new FakeRealtimeChannel();
      await renderEditor(fakeApi(editingSession()), channel);

      act(() =>
        channel.emit(EDITING_EVENTS.PRESENCE, {
          participants: [LUCIA, MARIO, JULIA, SOFIA],
          editors: 4,
          maxEditors: 5,
        }),
      );
      expect(within(presencePanel()).getByText('Estás editando con 3 personas más')).toBeTruthy();
      expect(within(presencePanel()).getByText('Sofía Ramírez')).toBeTruthy();

      act(() =>
        channel.emit(EDITING_EVENTS.PRESENCE, { participants: [LUCIA], editors: 1, maxEditors: 5 }),
      );
      expect(within(presencePanel()).getByText('Solo tú estás editando')).toBeTruthy();
      expect(within(presencePanel()).queryByText('Mario Gómez')).toBeNull();
    });

    it('CA-6, RN-9: un aviso de presencia fuera del contrato se ignora', async () => {
      const channel = new FakeRealtimeChannel();
      await renderEditor(fakeApi(editingSession()), channel);

      act(() =>
        channel.emit(EDITING_EVENTS.PRESENCE, {
          participants: [LUCIA],
          editors: 1,
          maxEditors: 5,
          fileName: 'informe.docx',
        }),
      );

      expect(within(presencePanel()).getByText('Estás editando con 2 personas más')).toBeTruthy();
    });

    it('CA-6: al reconectar el canal vuelve a entrar a la sala sin recargar el editor', async () => {
      const api = fakeApi(editingSession(), editingSession([LUCIA, MARIO]));
      const view = await renderEditor(api);

      view.rerender(
        <RealtimeContext.Provider value={new FakeRealtimeChannel('conexion-2')}>
          <EditorView fileId={FILE_ID} api={api} />
        </RealtimeContext.Provider>,
      );
      await act(async () => undefined);

      expect(api.openSession).toHaveBeenLastCalledWith(FILE_ID, 'conexion-2');
      expect(within(presencePanel()).getByText('Estás editando con 1 persona más')).toBeTruthy();
      expect(DocEditor).toHaveBeenCalledTimes(1);
    });

    it('360 px: el botón «3 de 5 editores» despliega y repliega la lista', async () => {
      await renderEditor(fakeApi(editingSession()));
      const toggle = screen.getByRole('button', { name: '3 de 5 editores' });

      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe(presencePanel().id);
      await userEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('al salir de la pantalla cierra el editor', async () => {
      const { unmount } = await renderEditor(fakeApi(editingSession()));

      unmount();

      expect(destroyEditor).toHaveBeenCalledTimes(1);
    });
  });

  describe('limite-editores', () => {
    const DIEGO = { userId: '5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d', displayName: 'Diego Morales' };
    const FULL = [MARIO, JULIA, SOFIA, ANDRES, DIEGO];

    it('CA-7: entra en solo lectura con el aviso, el límite alcanzado y aparte en «Solo ven»', async () => {
      await renderEditor(fakeApi(viewingSession('EDITING_LIMIT_REACHED', FULL)));
      const panel = presencePanel();

      expect(
        screen.getByText('Hay 5 editores; estás en solo lectura. Inténtalo en unos minutos'),
      ).toBeTruthy();
      expect(within(header()).getByText('Solo lectura')).toBeTruthy();
      expect(within(panel).getByText('5 de 5 editores')).toBeTruthy();
      expect(within(panel).getByText('Límite del plan alcanzado')).toBeTruthy();
      expect(within(panel).getByText('Solo ven (no cuentan para el límite)')).toBeTruthy();
      expect(within(panel).getByText('Lucía Barrios (tú)')).toBeTruthy();
      expect(within(panel).getByText('Solo ve')).toBeTruthy();
      await expectAccessible();
    });

    it('CA-7: «Intentar editar» vuelve a abrir y, si hay lugar, entra en edición', async () => {
      const api = fakeApi(viewingSession('EDITING_LIMIT_REACHED', FULL), editingSession());
      await renderEditor(api);

      await userEvent.click(screen.getByRole('button', { name: 'Intentar editar' }));

      await waitFor(() => expect(within(header()).getByText('Editando')).toBeTruthy());
      expect(api.openSession).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/estás en solo lectura/)).toBeNull();
    });
  });

  it('solo-lectura-lector, CA-3: puede verlo pero no editarlo, sin acciones de plan', async () => {
    await renderEditor(fakeApi(viewingSession('EDITING_VIEW_ONLY', [MARIO])));

    expect(screen.getByText('Puedes ver este documento, pero no editarlo')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ver planes' })).toBeNull();
    expect(within(presencePanel()).getByText('1 de 5 editores')).toBeTruthy();
    await expectAccessible();
  });

  it('solo-lectura-plan, CA-5: «Tu plan no incluye edición» con «Ver planes»', async () => {
    await renderEditor(fakeApi(viewingSession('EDITING_PLAN_READ_ONLY', [], 0)));

    expect(screen.getAllByText('Tu plan no incluye edición').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ver planes' }).getAttribute('href')).toBe('/planes');
    expect(screen.queryByText(/de 0 editores/)).toBeNull();
    await expectAccessible();
  });

  it('solo-lectura-vencida (spec 010, PD-119): texto propio con «Renovar plan»', async () => {
    await renderEditor(fakeApi(viewingSession('EDITING_ACCOUNT_READ_ONLY', [], 0)));

    expect(
      screen.getByText('Tu suscripción venció; tus archivos están en solo lectura'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Renovar plan' }).getAttribute('href')).toBe(
      '/suscripcion/renovar',
    );
    expect(screen.queryByRole('link', { name: 'Ver planes' })).toBeNull();
    expect(within(presencePanel()).getByText('Solo lectura')).toBeTruthy();
    await expectAccessible();
  });

  it('solo-lectura-tamano, CA-21: el documento supera el tope editable', async () => {
    await renderEditor(fakeApi(viewingSession('EDITING_FILE_TOO_LARGE')));

    expect(
      screen.getByText('Este documento es demasiado grande para editarlo en línea'),
    ).toBeTruthy();
    expect(within(presencePanel()).getByText('No se puede editar en línea')).toBeTruthy();
    await expectAccessible();
  });

  it('solo-lectura-plan-propietario, CA-22: sin «Ver planes» ni «Renovar plan»', async () => {
    await renderEditor(fakeApi(viewingSession('EDITING_OWNER_PLAN_READ_ONLY', [], 0)));

    expect(screen.getByText('El plan de la cuenta propietaria no incluye edición')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ver planes' })).toBeNull();
    expect(screen.queryByText('Renovar plan')).toBeNull();
    await expectAccessible();
  });

  it.each<[ReadOnlyReason, string]>([
    ['EDITING_VIEW_ONLY', 'Puedes ver este documento, pero no editarlo'],
    ['EDITING_PLAN_READ_ONLY', 'Tu plan no incluye edición'],
    ['EDITING_OWNER_PLAN_READ_ONLY', 'El plan de la cuenta propietaria no incluye edición'],
    ['EDITING_ACCOUNT_READ_ONLY', 'Tu suscripción venció; tus archivos están en solo lectura'],
    ['EDITING_LIMIT_REACHED', 'Hay 5 editores; estás en solo lectura. Inténtalo en unos minutos'],
    ['EDITING_FILE_TOO_LARGE', 'Este documento es demasiado grande para editarlo en línea'],
  ])('el aviso de solo lectura sale solo del código `%s`', async (reason, title) => {
    await renderEditor(fakeApi(viewingSession(reason)));

    expect(screen.getByRole('status', { name: title })).toBeTruthy();
    expect(DocEditor).toHaveBeenCalledWith(expect.any(String), EDITOR_CONFIG);
  });

  describe('no-disponible', () => {
    it('CA-15: «El editor no está disponible. Tus archivos siguen a salvo» con «Reintentar»', async () => {
      const api = failingApi(503, EDITING_ERROR_CODES.EDITING_UNAVAILABLE);
      await renderEditor(api);

      const alert = screen.getByRole('alert');
      expect(within(alert).getByText('El editor no está disponible')).toBeTruthy();
      expect(alert.textContent).toContain('Tus archivos siguen a salvo');
      expect(screen.getByRole('link', { name: 'Volver a Mis archivos' })).toBeTruthy();
      await expectAccessible();

      await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
      expect(api.openSession).toHaveBeenCalledTimes(2);
    });

    it('CA-15: si el script de ONLYOFFICE no carga, también', async () => {
      loadDocsApiMock.mockRejectedValue(new Error('sin servicio'));
      await renderEditor(fakeApi(editingSession()));

      expect(screen.getByText('El editor no está disponible')).toBeTruthy();
    });
  });

  it('CA-2: un archivo ajeno, en la papelera o inexistente muestra «no encontramos» sin editor', async () => {
    await renderEditor(failingApi(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND));

    expect(screen.getByText(/No encontramos lo que buscas/)).toBeTruthy();
    expect(DocEditor).not.toHaveBeenCalled();
  });

  it('con la sesión anterior guardándose, pide reintentar en unos segundos', async () => {
    const api = failingApi(409, EDITING_ERROR_CODES.EDITING_SAVE_IN_PROGRESS);
    await renderEditor(api);

    expect(screen.getByText('Estamos guardando la sesión anterior')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(api.openSession).toHaveBeenCalledTimes(2);
  });

  it('CA-4: un archivo que no es .docx no abre el editor', async () => {
    await renderEditor(failingApi(422, EDITING_ERROR_CODES.EDITING_UNSUPPORTED_FORMAT));

    expect(screen.getByText('Solo se pueden editar documentos .docx')).toBeTruthy();
    expect(DocEditor).not.toHaveBeenCalled();
  });
});
