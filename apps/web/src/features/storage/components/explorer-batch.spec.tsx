/**
 * @jest-environment jsdom
 */
import type { BatchResult, FolderContentsResponse, NodeSummary } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BatchApi } from '../batch-api';
import { useNodeSelection } from '../hooks/use-node-selection';

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

function Harness({ api, onChanged }: { readonly api: BatchApi; readonly onChanged: () => void }) {
  const selection = useNodeSelection([ACTA, INFORME], 'raiz');
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

async function renderWithAllSelected(api: BatchApi, onChanged = jest.fn()) {
  const user = userEvent.setup();
  render(<Harness api={api} onChanged={onChanged} />);
  expect(screen.queryByRole('region', { name: 'Selección' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'marcar todo' }));
  return { user, bar: screen.getByRole('region', { name: 'Selección' }), onChanged };
}

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

// Evita que jsdom intente navegar al hacer clic en los enlaces de descarga.
beforeAll(() => {
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
