/**
 * @jest-environment jsdom
 */
import type { OpenEditSessionResponse } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useSession } from '../../identity/session/session-provider';
import { RealtimeContext } from '../../realtime/use-realtime';
import type { EditingApi } from '../editing-api';
import { loadDocsApi, type DocsApi } from '../onlyoffice/load-docs-api';
import { editingSession, FakeRealtimeChannel, FILE_ID, ME } from '../test-edit-session';

import { EditorView } from './editor-view';
import { SaveFailedBanner } from './save-failed-banner';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../../identity/session/session-provider', () => ({ useSession: jest.fn() }));
jest.mock('../onlyoffice/load-docs-api', () => ({ loadDocsApi: jest.fn() }));

const DocEditor = jest.fn(() => ({ destroyEditor: jest.fn() }));
const FAILED: OpenEditSessionResponse = { ...editingSession(), lastSaveFailed: true };

function fakeApi(...responses: OpenEditSessionResponse[]): jest.Mocked<EditingApi> {
  const openSession = jest.fn<Promise<OpenEditSessionResponse>, [string, string | null]>();
  responses.forEach((response) => openSession.mockResolvedValueOnce(response));
  return { openSession };
}

async function renderEditor(api: EditingApi): Promise<void> {
  render(
    <RealtimeContext.Provider value={new FakeRealtimeChannel()}>
      <EditorView fileId={FILE_ID} api={api} />
    </RealtimeContext.Provider>,
  );
  await act(async () => undefined);
}

function header(): HTMLElement {
  const found = screen.getByRole('heading', { level: 1 }).closest('header');
  if (found === null) throw new Error('Sin barra del editor');
  return found;
}

beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({
    status: 'authenticated',
    user: ME,
    accessToken: 'token',
    renew: jest.fn(),
    signOut: jest.fn(),
  });
  jest.mocked(loadDocsApi).mockResolvedValue({ DocEditor } as unknown as DocsApi);
});

describe('SaveFailedBanner (016 CA-14)', () => {
  it('CA-14: dice que no se guardó, que la versión anterior está intacta y ofrece reintentar', async () => {
    const onReopen = jest.fn();
    render(<SaveFailedBanner onReopen={onReopen} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos guardar tus cambios');
    expect(alert.textContent).toContain('Tu versión anterior está intacta. Reintenta');
    expect(within(alert).queryByRole('button', { name: 'Cerrar aviso' })).toBeNull();
    const results = await act(async () => axe(document.body));
    expect(results.violations).toEqual([]);

    await userEvent.click(within(alert).getByRole('button', { name: 'Abrir el editor de nuevo' }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it('guardado-fallido: con `lastSaveFailed` se ve el banner y no se monta el editor ni la presencia', async () => {
    await renderEditor(fakeApi(FAILED));

    expect(screen.getByRole('alert').textContent).toContain('No pudimos guardar tus cambios');
    expect(DocEditor).not.toHaveBeenCalled();
    expect(screen.queryByRole('complementary', { name: 'En este documento' })).toBeNull();
    expect(within(header()).queryByText('Editando')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Propuesta_comercial_2027.docx' }),
    ).toBeTruthy();
  });

  it('CA-14: «Abrir el editor de nuevo» repite la apertura, oculta el banner y monta el editor', async () => {
    const api = fakeApi(FAILED, editingSession());
    await renderEditor(api);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir el editor de nuevo' }));

    await waitFor(() => expect(DocEditor).toHaveBeenCalledTimes(1));
    expect(api.openSession).toHaveBeenCalledTimes(2);
    expect(api.openSession).toHaveBeenLastCalledWith(FILE_ID, 'conexion-1');
    expect(screen.queryByText('No pudimos guardar tus cambios')).toBeNull();
    expect(within(header()).getByText('Editando')).toBeTruthy();
  });
});
