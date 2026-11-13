/**
 * @jest-environment jsdom
 */
import type { BatchResult, FolderContentsResponse, NodeSummary } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { messageForCode } from '../../../lib/error-catalog';
import type { BatchApi } from '../batch-api';
import { DOWNLOAD_FRAME_TTL_MS, DOWNLOAD_STAGGER_MS } from '../batch-downloads';
import { useNodeSelection } from '../hooks/use-node-selection';
import { StorageRequestError } from '../storage-request-error';

import { ExplorerBatch } from './explorer-batch';

const AT = '2026-11-01T10:00:00.000Z';
const ACTA: NodeSummary = {
  type: 'file',
  id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c41',
  name: 'Acta.pdf',
  sizeBytes: 1_000,
  kind: 'pdf',
  folderId: null,
  createdAt: AT,
  updatedAt: AT,
};
const INFORME: NodeSummary = {
  ...ACTA,
  id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c42',
  name: 'Informe.pdf',
};
const DESTINO = { id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c43', name: 'Destino' };
const ROOT: FolderContentsResponse = {
  folder: null,
  breadcrumbs: [],
  items: [
    { type: 'folder', ...DESTINO, parentId: null, createdAt: AT, updatedAt: AT, shared: false },
  ],
  nextCursor: null,
  accessLevel: 'OWNER',
};
const item = (node: NodeSummary) => ({ type: node.type, id: node.id });
const PARTIAL: BatchResult = {
  succeeded: [item(ACTA)],
  failed: [{ ...item(INFORME), code: 'STORAGE_NODE_NOT_FOUND' }],
};

function fakeApi(): jest.Mocked<BatchApi> {
  return {
    move: jest.fn<Promise<BatchResult>, Parameters<BatchApi['move']>>(() =>
      Promise.resolve(PARTIAL),
    ),
    trash: jest.fn<Promise<BatchResult>, Parameters<BatchApi['trash']>>(() =>
      Promise.resolve({ succeeded: [item(ACTA), item(INFORME)], failed: [] }),
    ),
    download: jest.fn<ReturnType<BatchApi['download']>, Parameters<BatchApi['download']>>(() =>
      Promise.resolve({ downloads: [], failed: [] }),
    ),
    share: jest.fn<Promise<BatchResult>, Parameters<BatchApi['share']>>(() =>
      Promise.resolve(PARTIAL),
    ),
  };
}

interface HarnessProps {
  readonly api: BatchApi;
  readonly onChanged: () => void;
  readonly nodes?: readonly NodeSummary[];
}

function Harness({ api, onChanged, nodes = [ACTA, INFORME] }: HarnessProps) {
  const selection = useNodeSelection(nodes, 'raiz');
  return (
    <>
      <button type="button" onClick={selection.toggleAll}>
        marcar todo
      </button>
      <ExplorerBatch
        api={api}
        selection={selection}
        folderContents={() => Promise.resolve(ROOT)}
        onChanged={onChanged}
      />
    </>
  );
}

async function renderWithAllSelected(
  api: BatchApi,
  onChanged = jest.fn(),
  nodes: readonly NodeSummary[] = [ACTA, INFORME],
) {
  const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  render(<Harness api={api} onChanged={onChanged} nodes={nodes} />);
  expect(screen.queryByRole('region', { name: 'Selección' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'marcar todo' }));
  return { user, bar: screen.getByRole('region', { name: 'Selección' }), onChanged };
}

const downloadFrames = (): readonly HTMLIFrameElement[] => [
  ...document.body.querySelectorAll<HTMLIFrameElement>('iframe[hidden]'),
];

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('ExplorerBatch: acciones sobre la selección múltiple', () => {
  it('la barra dice cuántos hay y ofrece Compartir, Descargar, Mover y Eliminar', async () => {
    const { bar } = await renderWithAllSelected(fakeApi());

    expect(bar.textContent).toContain('2 seleccionados');
    for (const name of ['Compartir', 'Descargar', 'Mover', 'Eliminar', 'Quitar selección']) {
      expect(within(bar).getByRole('button', { name })).toBeTruthy();
    }
  });

  it('Eliminar confirma, manda todo a la papelera, avisa el éxito y vacía la selección', async () => {
    const api = fakeApi();
    const { user, bar, onChanged } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Eliminar' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Mover 2 elementos a la papelera?' });
    await user.click(within(dialog).getByRole('button', { name: 'Mover a la papelera' }));

    expect(api.trash).toHaveBeenCalledWith([item(ACTA), item(INFORME)]);
    expect(await screen.findByText('Se movieron 2 elementos a la papelera.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Selección' })).toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it('Mover elige el destino en el árbol y muestra el resultado parcial con el nombre y el motivo', async () => {
    const api = fakeApi();
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Mover' }));
    const dialog = screen.getByRole('dialog', { name: 'Mover 2 elementos' });
    await user.click(await within(dialog).findByText('Destino'));
    await user.click(within(dialog).getByRole('button', { name: 'Mover aquí' }));

    expect(api.move).toHaveBeenCalledWith([item(ACTA), item(INFORME)], DESTINO.id);
    const outcome = await screen.findByRole('status', { name: /Se movió 1 de 2/ });
    expect(within(outcome).getByText(/Informe\.pdf/)).toBeTruthy();
  });

  it('Compartir envía correo y nivel para toda la selección', async () => {
    const api = fakeApi();
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Compartir' }));
    const dialog = screen.getByRole('dialog', { name: 'Compartir 2 elementos' });
    await user.type(within(dialog).getByLabelText('Correo de la persona'), 'luis@ejemplo.com');
    await user.click(within(dialog).getByRole('button', { name: 'Compartir' }));

    expect(api.share).toHaveBeenCalledWith({
      items: [item(ACTA), item(INFORME)],
      email: 'luis@ejemplo.com',
      level: 'VIEWER',
    });
    expect(await screen.findByRole('status', { name: /Se compartió 1 de 2/ })).toBeTruthy();
  });

  it('Descargar pide las URL y avisa cuántas descargas empezaron', async () => {
    const api = fakeApi();
    api.download.mockResolvedValue({
      downloads: [{ id: ACTA.id, name: 'Acta.pdf', url: 'https://minio.test/acta' }],
      failed: [],
    });
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Descargar' }));

    expect(api.download).toHaveBeenCalledWith([item(ACTA), item(INFORME)]);
    expect(await screen.findByText('Empezó la descarga de 1 archivo.')).toBeTruthy();
  });

  it('Descargar muestra lo que no se pudo (`failed`) en el mismo aviso parcial que mover o eliminar', async () => {
    const api = fakeApi();
    api.download.mockResolvedValue({
      downloads: [{ id: ACTA.id, name: 'Acta.pdf', url: 'https://minio.test/acta' }],
      failed: PARTIAL.failed,
    });
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Descargar' }));

    const outcome = await screen.findByRole('status', { name: 'Empezó la descarga de 1 archivo.' });
    const failure = within(outcome).getByRole('listitem');
    // El motivo es el del elemento, no el «carpeta de destino» que el catálogo usa al subir o crear.
    expect(failure.textContent).toBe(
      'Informe.pdf: Ya no existe o está en la papelera. Actualiza la lista y vuelve a intentarlo.',
    );
    expect(failure.textContent).not.toContain(messageForCode('STORAGE_NODE_NOT_FOUND'));
    expect(within(outcome).getByRole('button', { name: 'Cerrar aviso' })).toBeTruthy();
  });

  it('Descargar abre cada URL en su iframe oculto, escalonadas, y los quita después', async () => {
    const api = fakeApi();
    api.download.mockResolvedValue({
      downloads: [
        { id: ACTA.id, name: 'Acta.pdf', url: 'https://minio.test/acta' },
        { id: INFORME.id, name: 'Informe.pdf', url: 'https://minio.test/informe' },
      ],
      failed: [],
    });
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Descargar' }));
    await screen.findByText('Empezó la descarga de 2 archivos.');
    act(() => jest.advanceTimersByTime(0));
    expect(downloadFrames().map((frame) => frame.src)).toEqual(['https://minio.test/acta']);

    act(() => jest.advanceTimersByTime(DOWNLOAD_STAGGER_MS));
    expect(downloadFrames().map((frame) => frame.src)).toEqual([
      'https://minio.test/acta',
      'https://minio.test/informe',
    ]);

    act(() => jest.advanceTimersByTime(DOWNLOAD_FRAME_TTL_MS + DOWNLOAD_STAGGER_MS));
    expect(downloadFrames()).toEqual([]);
  });

  it('Descargar solo carpetas vacías avisa que no hay archivos, sin decir «0 archivos»', async () => {
    const { user, bar } = await renderWithAllSelected(fakeApi());

    await user.click(within(bar).getByRole('button', { name: 'Descargar' }));

    expect(await screen.findByText(/No hay archivos para descargar/)).toBeTruthy();
    expect(screen.queryByText(/0 archivos/)).toBeNull();
  });

  it('con un solo elemento, los títulos van en singular', async () => {
    const { user, bar } = await renderWithAllSelected(fakeApi(), jest.fn(), [ACTA]);

    await user.click(within(bar).getByRole('button', { name: 'Compartir' }));
    expect(screen.getByRole('dialog', { name: 'Compartir 1 elemento' })).toBeTruthy();
  });

  it('Compartir con un correo sin cuenta deja el diálogo abierto con lo escrito y el motivo', async () => {
    const api = fakeApi();
    const code = 'SHARING_RECIPIENT_NOT_FOUND';
    api.share.mockResolvedValue({
      succeeded: [],
      failed: [
        { ...item(ACTA), code },
        { ...item(INFORME), code },
      ],
    });
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Compartir' }));
    const dialog = screen.getByRole('dialog', { name: 'Compartir 2 elementos' });
    await user.type(within(dialog).getByLabelText('Correo de la persona'), 'nadie@ejemplo.com');
    await user.click(within(dialog).getByRole('button', { name: 'Compartir' }));

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(
      /No encontramos una cuenta/,
    );
    expect(within(dialog).getByLabelText<HTMLInputElement>('Correo de la persona').value).toBe(
      'nadie@ejemplo.com',
    );
    const barBehind = screen.getByRole('region', { name: 'Selección', hidden: true });
    expect(barBehind.textContent).toContain('2 seleccionados');
  });

  it('Compartir rechazado entero (correo inválido) lo explica en el diálogo, sin cerrarlo', async () => {
    const api = fakeApi();
    api.share.mockRejectedValue(
      new StorageRequestError(422, 'SHARING_INVALID_REQUEST', {}, [
        { field: 'email', reason: 'INVALID_EMAIL', message: 'correo' },
      ]),
    );
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Compartir' }));
    const dialog = screen.getByRole('dialog', { name: 'Compartir 2 elementos' });
    await user.type(within(dialog).getByLabelText('Correo de la persona'), 'luis@ejemplo');
    await user.click(within(dialog).getByRole('button', { name: 'Compartir' }));

    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/correo válido/);
  });

  it('lo que está dentro de una carpeta también seleccionada no se manda aparte', async () => {
    const api = fakeApi();
    const carpeta: NodeSummary = {
      type: 'folder',
      ...DESTINO,
      parentId: null,
      createdAt: AT,
      updatedAt: AT,
    };
    const dentro: NodeSummary = { ...ACTA, folderId: carpeta.id };
    const { user, bar } = await renderWithAllSelected(api, jest.fn(), [carpeta, dentro]);

    await user.click(within(bar).getByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Mover a la papelera' }));

    expect(api.trash).toHaveBeenCalledWith([item(carpeta)]);
  });

  it('si la petición falla, lo dice con un error y conserva la selección', async () => {
    const api = fakeApi();
    api.trash.mockRejectedValue(new Error('red'));
    const { user, bar } = await renderWithAllSelected(api);

    await user.click(within(bar).getByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Mover a la papelera' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Selección' })).toBeTruthy();
  });
});
