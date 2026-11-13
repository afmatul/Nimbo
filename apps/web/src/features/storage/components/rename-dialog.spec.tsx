/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FileSummary,
  type FolderSummary,
} from '@nimbo/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { StorageRequestError } from '../storage-request-error';
import { explorerFile, explorerFolder } from '../test-explorer-nodes';

import { RenameDialog, type RenameDialogProps } from './rename-dialog';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const VIEWPORTS = [360, 1440] as const;
const AT = '2026-09-30T10:00:00.000Z';
const PARENT_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

const FILE: FileSummary = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'Informe_avance_RAG.docx',
  sizeBytes: 1_200,
  kind: 'docx',
  folderId: PARENT_ID,
  createdAt: AT,
  updatedAt: AT,
};
const FOLDER: FolderSummary = {
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Pruebas de recuperación',
  parentId: PARENT_ID,
  createdAt: AT,
  updatedAt: AT,
};
const FILE_NODE = explorerFile(FILE);
const FOLDER_NODE = explorerFolder(FOLDER);

function renderDialog(overrides: Partial<RenameDialogProps> = {}): RenameDialogProps {
  const props: RenameDialogProps = {
    node: FILE_NODE,
    siblingFolderNames: ['Prompts', 'Pruebas de recuperación'],
    renameFile: jest.fn((_id, body) => Promise.resolve({ ...FILE_NODE, name: body.name })),
    renameFolder: jest.fn((_id, body) => Promise.resolve({ ...FOLDER_NODE, name: body.name })),
    onRenamed: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<RenameDialog {...props} />);
  return props;
}

function nameInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('Nombre');
}

async function submit(name: string): Promise<void> {
  await userEvent.clear(nameInput());
  if (name !== '') await userEvent.type(nameInput(), name);
  await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
}

function conflict(suggestedName: string): StorageRequestError {
  return new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT, { suggestedName });
}

async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const results = await axe(document.body);
    const blocking = results.violations.filter((violation) =>
      BLOCKING_IMPACTS.has(violation.impact ?? ''),
    );
    expect({ width, blocking: blocking.map((violation) => violation.id) }).toEqual({
      width,
      blocking: [],
    });
  }
}

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

describe('RenameDialog de un archivo (CA-4)', () => {
  it('CA-4: muestra el nombre sin la extensión, que queda fija como sufijo, con el texto seleccionado', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Renombrar archivo' });
    expect(dialog.textContent).toContain('Cambia el nombre de Informe_avance_RAG.docx.');
    expect(nameInput().value).toBe('Informe_avance_RAG');
    const suffix = screen.getByText('.docx');
    expect(nameInput().getAttribute('aria-describedby')).toContain(suffix.id);
    expect(document.activeElement).toBe(nameInput());
    expect(nameInput().selectionStart).toBe(0);
    expect(nameInput().selectionEnd).toBe('Informe_avance_RAG'.length);
  });

  it('CA-4: guarda el nombre con la misma extensión y cierra', async () => {
    const props = renderDialog();

    await submit('Informe_septiembre');

    expect(props.renameFile).toHaveBeenCalledWith(FILE.id, {
      name: 'Informe_septiembre.docx',
      onConflict: 'ask',
    });
    await waitFor(() =>
      expect(props.onRenamed).toHaveBeenCalledWith({
        ...FILE_NODE,
        name: 'Informe_septiembre.docx',
      }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('CA-4: con un nombre repetido pregunta «Conservar ambos» y reintenta con keep_both', async () => {
    const renameFile = jest
      .fn()
      .mockRejectedValueOnce(conflict('Actas (1).docx'))
      .mockResolvedValueOnce({ ...FILE_NODE, name: 'Actas (1).docx' });
    const props = renderDialog({ renameFile });

    await submit('Actas');
    const question = await screen.findByRole('alertdialog', { name: '¿Conservar ambos archivos?' });
    expect(question.textContent).toContain('«Actas.docx»');
    expect(question.textContent).toContain('«Actas (1).docx»');
    await userEvent.click(screen.getByRole('button', { name: 'Conservar ambos' }));

    expect(renameFile).toHaveBeenLastCalledWith(FILE.id, {
      name: 'Actas.docx',
      onConflict: 'keep_both',
    });
    await waitFor(() =>
      expect(props.onRenamed).toHaveBeenCalledWith({ ...FILE_NODE, name: 'Actas (1).docx' }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('CA-4: «Cancelar» ante el nombre repetido no cambia nada', async () => {
    const renameFile = jest.fn().mockRejectedValueOnce(conflict('Actas (1).docx'));
    const props = renderDialog({ renameFile });

    await submit('Actas');
    const question = await screen.findByRole('alertdialog');
    await userEvent.click(within(question).getByRole('button', { name: 'Cancelar' }));

    expect(renameFile).toHaveBeenCalledTimes(1);
    expect(props.onRenamed).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('CA-2: sin nombre antes de la extensión no llama a la API', async () => {
    const props = renderDialog();

    await submit('');

    expect(screen.getByRole('alert').textContent).toBe('Completa este campo.');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(props.renameFile).not.toHaveBeenCalled();
  });

  it('CA-2: el 400 del servidor va en el campo y el foco vuelve a él', async () => {
    const renameFile = jest.fn(() =>
      Promise.reject(
        new StorageRequestError(400, STORAGE_ERROR_CODES.STORAGE_INVALID_NODE_REQUEST, {}, [
          { field: 'name', reason: 'NAME_TOO_LONG', message: 'x' },
        ]),
      ),
    );
    renderDialog({ renameFile });

    await submit('Informe');

    expect(await screen.findByText(/Usa un nombre de 255 caracteres o menos/)).toBeTruthy();
    expect(document.activeElement).toBe(nameInput());
  });

  it('CA-4: un 409 sin suggestedName no usa el texto de la carga de 005', async () => {
    renderDialog({
      renameFile: jest.fn(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      ),
    });

    await submit('Actas');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya tienes un archivo llamado «Actas.docx» aquí. Elige otro nombre.',
    );
  });

  it('error de red: aviso dentro del diálogo, sin cerrarlo', async () => {
    const props = renderDialog({ renameFile: jest.fn(() => Promise.reject(new TypeError('red'))) });

    await submit('Informe');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos cambiar el nombre. Revisa tu conexión e inténtalo de nuevo.',
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('404: avisa que ya no está y pide actualizar la lista', async () => {
    renderDialog({
      renameFile: jest.fn(() =>
        Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
      ),
    });

    await submit('Informe');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No encontramos «Informe_avance_RAG.docx». Puede que ya no esté en esta carpeta. Cierra y actualiza la lista.',
    );
  });

  it('CA-25: sin violaciones serias de axe a 360 y 1440 px', async () => {
    renderDialog();

    await expectNoBlockingViolations();
  });
});

describe('RenameDialog de una carpeta (CA-3, CA-4)', () => {
  it('CA-4: renombra la carpeta sin sufijo', async () => {
    const props = renderDialog({ node: FOLDER_NODE });

    expect(screen.getByRole('dialog', { name: 'Renombrar carpeta' })).toBeTruthy();
    expect(nameInput().value).toBe('Pruebas de recuperación');
    await submit('Pruebas');

    expect(props.renameFolder).toHaveBeenCalledWith(FOLDER.id, { name: 'Pruebas' });
    await waitFor(() =>
      expect(props.onRenamed).toHaveBeenCalledWith({ ...FOLDER_NODE, name: 'Pruebas' }),
    );
  });

  it('CA-2: vacío usa el texto de carpetas', async () => {
    renderDialog({ node: FOLDER_NODE });

    await submit('');

    expect(screen.getByRole('alert').textContent).toBe('Escribe un nombre para la carpeta.');
  });

  it('CA-3: el 409 va en el campo con el nombre como está guardado', async () => {
    const renameFolder = jest.fn(() =>
      Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
    );
    renderDialog({ node: FOLDER_NODE, renameFolder });

    await submit('prompts');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.',
    );
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    await userEvent.type(nameInput(), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA-25: con el error en el campo, sin violaciones serias de axe', async () => {
    renderDialog({ node: FOLDER_NODE });
    await submit('');

    await expectNoBlockingViolations();
  });
});
