/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type FolderSummary } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageRequestError } from '../storage-request-error';

import { NewFolderDialog, type NewFolderDialogProps } from './new-folder-dialog';

const PARENT_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const CREATED: FolderSummary = {
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Actas',
  parentId: PARENT_ID,
  createdAt: '2026-09-30T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
};

function renderDialog(overrides: Partial<NewFolderDialogProps> = {}): NewFolderDialogProps {
  const props: NewFolderDialogProps = {
    open: true,
    onOpenChange: jest.fn(),
    parentId: PARENT_ID,
    destinationName: 'Fase 3 · RAG',
    siblingFolderNames: ['Prompts'],
    createFolder: jest.fn(() => Promise.resolve(CREATED)),
    onCreated: jest.fn(),
    ...overrides,
  };
  render(<NewFolderDialog {...props} />);
  return props;
}

function nameInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('Nombre de la carpeta');
}

async function submit(name: string): Promise<void> {
  if (name !== '') await userEvent.type(nameInput(), name);
  await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));
}

function rejectWith(error: unknown): NewFolderDialogProps['createFolder'] {
  return jest.fn(() => Promise.reject(error));
}

describe('NewFolderDialog (CA-1, CA-2, CA-3, CA-9)', () => {
  it('CA-1: pregunta el nombre con el destino en la descripción y el foco en el campo', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Nueva carpeta' });
    expect(dialog.textContent).toContain('Se creará en Fase 3 · RAG.');
    expect(document.activeElement).toBe(nameInput());
  });

  it('CA-1: crea en la carpeta abierta, avisa y cierra', async () => {
    const props = renderDialog();

    await submit('Actas');

    expect(props.createFolder).toHaveBeenCalledWith({ name: 'Actas', parentId: PARENT_ID });
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(CREATED));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('CA-2: vacío: error en el campo sin llamar a la API', async () => {
    const props = renderDialog();

    await submit('');

    expect(screen.getByText('Escribe un nombre para la carpeta.')).toBeTruthy();
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(nameInput().getAttribute('aria-describedby')).toBeTruthy();
    expect(props.createFolder).not.toHaveBeenCalled();
  });

  it('CA-2: separadores de ruta: error en el campo sin llamar a la API', async () => {
    const props = renderDialog();

    await submit('Resultados/finales');

    const errorId = nameInput().getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toContain('Quita «/», «\\»');
    expect(props.createFolder).not.toHaveBeenCalled();
  });

  it('CA-2: un 400 del servidor muestra el motivo debajo del campo', async () => {
    renderDialog({
      createFolder: rejectWith(
        new StorageRequestError(400, STORAGE_ERROR_CODES.STORAGE_INVALID_NODE_REQUEST, {}, [
          { field: 'name', reason: 'NAME_TOO_LONG', message: 'x' },
        ]),
      ),
    });

    await submit('Actas');

    expect(await screen.findByText('El nombre puede tener hasta 255 caracteres.')).toBeTruthy();
  });

  it('CA-3: un 409 dice el nombre como está guardado y devuelve el foco al campo', async () => {
    renderDialog({
      createFolder: rejectWith(
        new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT),
      ),
    });

    await submit('prompts');

    expect(
      await screen.findByText('Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.'),
    ).toBeTruthy();
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(nameInput());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('CA-3: un 409 sin la carpeta en la lista usa el nombre escrito', async () => {
    renderDialog({
      siblingFolderNames: [],
      createFolder: rejectWith(
        new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT),
      ),
    });

    await submit('  Informes ');

    expect(
      await screen.findByText('Ya existe una carpeta llamada «Informes» aquí. Elige otro nombre.'),
    ).toBeTruthy();
  });

  it('CA-9: un 422 de profundidad es un aviso dentro del diálogo, sin cerrarlo', async () => {
    const props = renderDialog({
      createFolder: rejectWith(
        new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
          maxDepth: 10,
        }),
      ),
    });

    await submit('Anexos');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Llegaste al máximo de 10 niveles de carpetas. Crea la carpeta en otro lugar.',
    );
    expect(nameInput().getAttribute('aria-invalid')).toBeNull();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('sin respuesta del servidor: aviso con causa y acción', async () => {
    renderDialog({ createFolder: rejectWith(new TypeError('Failed to fetch')) });

    await submit('Actas');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos crear la carpeta. Revisa tu conexión e inténtalo de nuevo.',
    );
  });

  it('mientras espera, «Crear carpeta» queda ocupado y no envía dos veces', async () => {
    const createFolder = jest.fn(() => new Promise<FolderSummary>(() => undefined));
    renderDialog({ createFolder });

    await submit('Actas');
    const busy = screen.getByRole('button', { name: 'Creando…' });
    await userEvent.click(busy);

    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(createFolder).toHaveBeenCalledTimes(1);
  });

  it('«Cancelar» cierra sin crear', async () => {
    const props = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.createFolder).not.toHaveBeenCalled();
  });
});
