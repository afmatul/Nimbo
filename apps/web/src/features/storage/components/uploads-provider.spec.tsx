/**
 * @jest-environment jsdom
 */
import type { InitUploadResponse, ResumeUploadResponse } from '@nimbo/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { StorageApi } from '../api';
import { useUploads } from '../hooks/use-upload-manager';
import { StorageRequestError } from '../storage-request-error';
import type { PutObjectRequest } from '../upload/xhr-put';

import { UploadsProvider } from './uploads-provider';

const AT = '2026-09-30T10:00:00.000Z';
const UPLOAD_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';

function simple(name: string): InitUploadResponse {
  return {
    uploadId: UPLOAD_ID,
    mode: 'simple',
    name,
    expiresAt: AT,
    upload: { url: 'https://s3.nimbo.test/u/a', method: 'PUT', expiresAt: AT },
  };
}

function fakeApi(overrides: Partial<StorageApi> = {}): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => new Promise<InitUploadResponse>(() => undefined)),
    resume: jest.fn(() => new Promise<ResumeUploadResponse>(() => undefined)),
    complete: jest.fn(() =>
      Promise.resolve({
        file: {
          id: FILE_ID,
          name: 'informe.docx',
          sizeBytes: 4,
          kind: 'docx',
          folderId: null,
          createdAt: AT,
          updatedAt: AT,
        },
      }),
    ),
    cancel: jest.fn(() => Promise.resolve()),
    folderContents: jest.fn(),
    createFolder: jest.fn(),
    downloadUrl: jest.fn(),
    ...overrides,
  } as jest.Mocked<StorageApi>;
}

function localFile(name: string, size = 4): File {
  return new File(['x'.repeat(size)], name);
}

function Enqueue({ files }: { readonly files: readonly File[] }): React.JSX.Element {
  const { enqueue } = useUploads();
  return (
    <button type="button" onClick={() => enqueue(files, null)}>
      Encolar
    </button>
  );
}

describe('UploadsProvider', () => {
  it('CA-21: el panel aparece al encolar y sigue vivo al cambiar la página dentro de la pestaña', async () => {
    const api = fakeApi();
    const { rerender } = render(
      <UploadsProvider api={api}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    expect(await screen.findByRole('region', { name: 'Subiendo 1 archivo' })).toBeTruthy();

    rerender(
      <UploadsProvider api={api}>
        <p>Otra página</p>
      </UploadsProvider>,
    );

    expect(screen.getByRole('region', { name: 'Subiendo 1 archivo' })).toBeTruthy();
  });

  it('CA-6: un nombre repetido abre el diálogo con el nombre final y «Conservar ambos» reenvía keep_both', async () => {
    const api = fakeApi({
      init: jest.fn((body) =>
        body.onConflict === 'ask'
          ? Promise.reject(
              new StorageRequestError(409, 'STORAGE_NAME_CONFLICT', {
                suggestedName: 'informe (1).docx',
              }),
            )
          : new Promise<InitUploadResponse>(() => undefined),
      ),
    });
    render(
      <UploadsProvider api={api}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Ya tienes un archivo con este nombre',
    });
    expect(dialog.textContent).toContain('informe (1).docx');

    await userEvent.click(screen.getByRole('button', { name: 'Conservar ambos' }));

    await waitFor(() =>
      expect(api.init).toHaveBeenLastCalledWith({
        name: 'informe.docx',
        sizeBytes: 4,
        onConflict: 'keep_both',
        folderId: null,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('014 CA-1, CA-15: el diálogo avisa la poda y «Reemplazar (nueva versión)» reenvía replace', async () => {
    const api = fakeApi({
      init: jest.fn((body) =>
        body.onConflict === 'ask'
          ? Promise.reject(
              new StorageRequestError(409, 'STORAGE_NAME_CONFLICT', {
                suggestedName: 'informe (1).docx',
                wouldPruneVersion: 3,
              }),
            )
          : new Promise<InitUploadResponse>(() => undefined),
      ),
    });
    render(
      <UploadsProvider api={api}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Ya tienes un archivo con este nombre',
    });
    expect(dialog.textContent).toContain(
      'Al reemplazar se eliminará la versión 3, la más antigua.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar (nueva versión)' }));

    await waitFor(() =>
      expect(api.init).toHaveBeenLastCalledWith({
        name: 'informe.docx',
        sizeBytes: 4,
        onConflict: 'replace',
        folderId: null,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('CA-22: cancelar con progreso pausa y pregunta; «Seguir subiendo» cierra el diálogo', async () => {
    const put = jest.fn((request: PutObjectRequest) => {
      request.onProgress({ loadedBytes: 2, totalBytes: 4 });
      return new Promise<void>(() => undefined);
    });
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar la carga de/ }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Cancelar esta carga?' });
    expect(dialog.textContent).toContain('Ya subiste 2 B de 4 B de «informe.docx».');

    await userEvent.click(screen.getByRole('button', { name: 'Seguir subiendo' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('CA-8: el evento offline del navegador deja la carga en espera', async () => {
    const put = jest.fn(() => new Promise<void>(() => undefined));
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(await screen.findByRole('region', { name: 'Carga en espera' })).toBeTruthy();
  });

  it('CA-21: «Cerrar» quita el panel cuando no queda ninguna carga activa', async () => {
    const put = jest.fn(() => Promise.resolve());
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await screen.findByRole('region', { name: 'Cargas terminadas' });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el panel de cargas' }));

    expect(screen.queryByRole('region')).toBeNull();
  });

  it('CA-21 (UI-4): mientras hay filas reserva abajo el alto del panel, así no tapa las últimas filas a 360 px', async () => {
    const put = jest.fn(() => Promise.resolve());
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
      </UploadsProvider>,
    );
    expect(screen.queryByTestId('upload-panel-spacer')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    const region = await screen.findByRole('region', { name: 'Cargas terminadas' });

    expect(screen.getByTestId('upload-panel-spacer').getAttribute('aria-hidden')).toBe('true');
    expect(region.querySelector('ul')?.className).toContain('max-h-60 sm:max-h-96');
    expect(region.parentElement?.className).toContain('pb-safe');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar el panel de cargas' }));
    expect(screen.queryByTestId('upload-panel-spacer')).toBeNull();
  });

  it('CA-1: expone los archivos recién subidos para que la lista los muestre sin recargar', async () => {
    const put = jest.fn(() => Promise.resolve());
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    function Uploaded(): React.JSX.Element {
      const { uploadedFiles } = useUploads();
      return <output>{uploadedFiles.map((file) => file.id).join(', ')}</output>;
    }
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
        <Uploaded />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));

    expect(await screen.findByText(FILE_ID, { selector: 'output' })).toBeTruthy();
  });

  it('014 CA-1: reemplazar un archivo ya subido expone un solo archivo con ese id', async () => {
    const put = jest.fn(() => Promise.resolve());
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    function Uploaded(): React.JSX.Element {
      const { uploadedFiles } = useUploads();
      return <output data-testid="uploaded">{uploadedFiles.map((file) => file.id).join(',')}</output>;
    }
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
        <Uploaded />
      </UploadsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await screen.findByText(FILE_ID, { selector: 'output' });
    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await waitFor(() => expect(api.init).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.getByTestId('uploaded').textContent).toBe(FILE_ID));
  });

  it('006 CA-7: un archivo subido que se renombra o mueve se expone con su último estado', async () => {
    const put = jest.fn(() => Promise.resolve());
    const api = fakeApi({ init: jest.fn(() => Promise.resolve(simple('informe.docx'))) });
    const folderId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    function Uploaded(): React.JSX.Element {
      const { uploadedFiles, reviseUploaded } = useUploads();
      const first = uploadedFiles[0];
      return (
        <>
          <output>
            {uploadedFiles.map((file) => `${file.name}@${String(file.folderId)}`).join(', ')}
          </output>
          <button
            type="button"
            onClick={() => first && reviseUploaded({ ...first, name: 'nuevo.docx', folderId })}
          >
            Mover
          </button>
        </>
      );
    }
    render(
      <UploadsProvider api={api} managerOptions={{ put }}>
        <Enqueue files={[localFile('informe.docx')]} />
        <Uploaded />
      </UploadsProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Encolar' }));
    await screen.findByText('informe.docx@null', { selector: 'output' });

    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));

    expect(screen.getByText(`nuevo.docx@${folderId}`, { selector: 'output' })).toBeTruthy();
  });

  it('useUploads fuera del proveedor avisa del error de montaje', () => {
    function Orphan(): null {
      useUploads();
      return null;
    }
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Orphan />)).toThrow('useUploads debe usarse dentro de <UploadsProvider>.');
  });
});
