/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FileSummary,
  type FolderContentsResponse,
  type FolderRef,
  type FolderSummary,
  type NodeSummary,
} from '@nimbo/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { StorageRequestError } from '../storage-request-error';

import { MoveDialog, type MoveDialogProps } from './move-dialog';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const VIEWPORTS = [360, 1440] as const;
const AT = '2026-09-30T10:00:00.000Z';

const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const LEGALES: FolderRef = {
  id: '1b2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Documentos Legales',
};
const ACTAS: FolderRef = { id: '2a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Actas' };
const DOCS: FolderRef = { id: '2b2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Documentación' };
const FASE3: FolderRef = { id: '2c2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Fase 3 · RAG' };
const PROMPTS: FolderRef = { id: '3a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Prompts' };
const NEW_FOLDER: FolderSummary = {
  id: '4a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Entregables',
  parentId: DOCS.id,
  createdAt: AT,
};

const FILE: FileSummary = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'Informe_avance_RAG.docx',
  sizeBytes: 1_200,
  kind: 'docx',
  folderId: FASE3.id,
  createdAt: AT,
};
const FILE_NODE: NodeSummary = { type: 'file', ...FILE };
const FASE3_NODE: NodeSummary = { type: 'folder', ...FASE3, parentId: ALPHA.id, createdAt: AT };

const TREE: Readonly<Record<string, readonly FolderRef[]>> = {
  root: [ALPHA, LEGALES],
  [ALPHA.id]: [ACTAS, DOCS, FASE3],
  [FASE3.id]: [PROMPTS],
  [DOCS.id]: [],
  [ACTAS.id]: [],
  [LEGALES.id]: [],
  [PROMPTS.id]: [],
};

function contentsOf(folderId: string | null): Promise<FolderContentsResponse> {
  const folders = TREE[folderId ?? 'root'] ?? [];
  return Promise.resolve({
    folder: null,
    breadcrumbs: [],
    items: [
      ...folders.map((folder) => ({
        type: 'folder' as const,
        ...folder,
        parentId: folderId,
        createdAt: AT,
      })),
      {
        type: 'file' as const,
        ...FILE,
        id: 'ffffffff-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
        name: 'otro.pdf',
      },
    ],
    nextCursor: null,
  });
}

function renderDialog(overrides: Partial<MoveDialogProps> = {}): MoveDialogProps {
  const props: MoveDialogProps = {
    node: FILE_NODE,
    breadcrumbs: [ALPHA, FASE3],
    folderContents: jest.fn(contentsOf),
    createFolder: jest.fn(() => Promise.resolve(NEW_FOLDER)),
    moveFile: jest.fn((_id, body) => Promise.resolve({ ...FILE, folderId: body.folderId })),
    moveFolder: jest.fn(() => Promise.resolve({ ...FASE3, parentId: null, createdAt: AT })),
    onMoved: jest.fn(),
    onFolderCreated: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<MoveDialog {...props} />);
  return props;
}

function item(name: string): HTMLElement {
  return screen.getByRole('treeitem', { name: new RegExp(`^${name}`) });
}

async function treeLoaded(name = 'Documentación'): Promise<void> {
  await screen.findByRole('treeitem', { name: new RegExp(`^${name}`) });
}

function note(): string {
  return screen.getByRole('status').textContent ?? '';
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

async function openNewFolderIn(name: string): Promise<HTMLInputElement> {
  await userEvent.click(item(name));
  await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
  return screen.getByLabelText<HTMLInputElement>('Nombre de la nueva carpeta');
}

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

describe('MoveDialog de un archivo (CA-7)', () => {
  it('CA-7: abre «Mis archivos» con la ruta actual y deshabilita la ubicación actual', async () => {
    const props = renderDialog();
    await treeLoaded();

    expect(screen.getByRole('dialog', { name: 'Mover «Informe_avance_RAG.docx»' })).toBeTruthy();
    expect(item('Mis archivos').getAttribute('aria-expanded')).toBe('true');
    expect(item('Proyecto Alpha').getAttribute('aria-expanded')).toBe('true');
    expect(item('Fase 3 · RAG').getAttribute('aria-disabled')).toBe('true');
    expect(item('Fase 3 · RAG').textContent).toContain('Ubicación actual');
    expect(props.folderContents).toHaveBeenCalledWith(null);
    expect(props.folderContents).toHaveBeenCalledWith(ALPHA.id);
    expect(screen.queryByRole('treeitem', { name: /^otro\.pdf/ })).toBeNull();
  });

  it('CA-7: elige un destino, lo anuncia y mueve el archivo allí', async () => {
    const props = renderDialog();
    await treeLoaded();

    await userEvent.click(item('Documentación'));
    expect(item('Documentación').getAttribute('aria-selected')).toBe('true');
    expect(note()).toBe('Se moverá a Proyecto Alpha / Documentación.');
    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect(props.moveFile).toHaveBeenCalledWith(FILE.id, { folderId: DOCS.id, onConflict: 'ask' });
    await waitFor(() =>
      expect(props.onMoved).toHaveBeenCalledWith({ ...FILE_NODE, folderId: DOCS.id }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('CA-7: un clic en la ubicación actual no la elige', async () => {
    renderDialog();
    await treeLoaded();

    await userEvent.click(item('Fase 3 · RAG'));

    expect(item('Fase 3 · RAG').getAttribute('aria-selected')).toBe('false');
  });

  it('CA-7: con nombre repetido pregunta «Conservar ambos» y reintenta con keep_both', async () => {
    const moveFile = jest
      .fn()
      .mockRejectedValueOnce(
        new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT, {
          suggestedName: 'Informe_avance_RAG (1).docx',
        }),
      )
      .mockResolvedValueOnce({ ...FILE, folderId: null, name: 'Informe_avance_RAG (1).docx' });
    const props = renderDialog({ moveFile });
    await treeLoaded();

    await userEvent.click(item('Mis archivos'));
    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));
    const question = await screen.findByRole('alertdialog', { name: '¿Conservar ambos archivos?' });
    expect(question.textContent).toContain('«Informe_avance_RAG (1).docx»');
    await userEvent.click(within(question).getByRole('button', { name: 'Conservar ambos' }));

    expect(moveFile).toHaveBeenLastCalledWith(FILE.id, { folderId: null, onConflict: 'keep_both' });
    await waitFor(() => expect(props.onMoved).toHaveBeenCalled());
  });

  it('CA-7: un 409 sin suggestedName no usa el texto de la carga de 005', async () => {
    renderDialog({
      moveFile: jest.fn(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      ),
    });
    await treeLoaded();

    await userEvent.click(item('Documentación'));
    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya tienes un archivo llamado «Informe_avance_RAG.docx» en Documentación. Elige otro destino.',
    );
  });

  it('error de red: aviso dentro del diálogo, que sigue abierto', async () => {
    const props = renderDialog({ moveFile: jest.fn(() => Promise.reject(new TypeError('red'))) });
    await treeLoaded();

    await userEvent.click(item('Documentación'));
    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos mover «Informe_avance_RAG.docx». Revisa tu conexión e inténtalo de nuevo.',
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('teclado: flechas recorren, → abre con carga perezosa y Enter elige; lo deshabilitado no se elige', async () => {
    const props = renderDialog();
    await treeLoaded();
    item('Mis archivos').focus();

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(item('Actas'));
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await waitFor(() => expect(props.folderContents).toHaveBeenCalledWith(DOCS.id));
    await userEvent.keyboard('{Enter}');
    expect(item('Documentación').getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(document.activeElement).toBe(item('Fase 3 · RAG'));
    expect(item('Documentación').getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowLeft}{End}');
    expect(document.activeElement).toBe(item('Documentos Legales'));
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(item('Mis archivos'));
  });

  it('CA-25: sin violaciones serias de axe a 360 y 1440 px', async () => {
    renderDialog();
    await treeLoaded();

    await expectNoBlockingViolations();
  });
});

describe('MoveDialog de una carpeta (CA-3, CA-7, CA-8, CA-9)', () => {
  const renderFolder = (overrides: Partial<MoveDialogProps> = {}): MoveDialogProps =>
    renderDialog({ node: FASE3_NODE, breadcrumbs: [ALPHA], ...overrides });

  it('CA-8: deshabilita la carpeta que se mueve y lo que hay dentro, con el motivo', async () => {
    renderFolder();
    await treeLoaded();
    await userEvent.click(item('Fase 3 · RAG'));
    await userEvent.keyboard('{ArrowRight}');
    await treeLoaded('Prompts');

    expect(screen.getByRole('dialog', { name: 'Mover la carpeta «Fase 3 · RAG»' })).toBeTruthy();
    expect(
      screen.getByText('No puedes mover una carpeta dentro de sí misma ni de sus subcarpetas.'),
    ).toBeTruthy();
    expect(item('Proyecto Alpha').textContent).toContain('Ubicación actual');
    expect(item('Fase 3 · RAG').textContent).toContain('Carpeta que mueves');
    expect(item('Prompts').textContent).toContain('Dentro de la carpeta');
    expect(item('Prompts').getAttribute('aria-disabled')).toBe('true');
    expect(item('Mis archivos').getAttribute('aria-selected')).toBe('true');
    expect(note()).toBe('Se moverá a Mis archivos.');
  });

  it('CA-7: mueve la carpeta a la raíz', async () => {
    const props = renderFolder();
    await treeLoaded();

    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect(props.moveFolder).toHaveBeenCalledWith(FASE3.id, { parentId: null });
    await waitFor(() =>
      expect(props.onMoved).toHaveBeenCalledWith({ ...FASE3_NODE, parentId: null }),
    );
  });

  it('CA-3: el 409 dice el nombre y el destino, y el diálogo sigue abierto', async () => {
    const moveFolder = jest.fn(() =>
      Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
    );
    const props = renderFolder({ moveFolder });
    await treeLoaded();

    await userEvent.click(item('Documentación'));
    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya existe una carpeta llamada «Fase 3 · RAG» en Documentación. Elige otro destino o cambia el nombre de la carpeta.',
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('CA-8: el 422 de ciclo se explica dentro del diálogo', async () => {
    renderFolder({
      moveFolder: jest.fn(() =>
        Promise.reject(new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_INVALID_MOVE)),
      ),
    });
    await treeLoaded();

    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No puedes mover una carpeta dentro de sí misma.',
    );
  });

  it('CA-9: el 422 de profundidad dice el máximo de niveles', async () => {
    renderFolder({
      moveFolder: jest.fn(() =>
        Promise.reject(
          new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
            maxDepth: 10,
          }),
        ),
      ),
    });
    await treeLoaded();

    await userEvent.click(screen.getByRole('button', { name: 'Mover aquí' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Llegaste al máximo de 10 niveles de carpetas. Crea la carpeta en otro lugar.',
    );
  });
});

describe('«Nueva carpeta» dentro de «Mover a…» (CA-1, CA-2, CA-3, CA-7, CA-9)', () => {
  it('CA-7: crea la carpeta en el destino elegido y la deja elegida y con el foco', async () => {
    const props = renderDialog();
    await treeLoaded();

    const field = await openNewFolderIn('Documentación');
    expect(document.activeElement).toBe(field);
    expect(screen.getByText('Se creará en Documentación.')).toBeTruthy();
    await userEvent.type(field, 'Entregables{Enter}');

    expect(props.createFolder).toHaveBeenCalledWith({ name: 'Entregables', parentId: DOCS.id });
    await waitFor(() => expect(props.onFolderCreated).toHaveBeenCalledWith(NEW_FOLDER));
    await waitFor(() => expect(document.activeElement).toBe(item('Entregables')));
    expect(item('Entregables').getAttribute('aria-selected')).toBe('true');
    expect(note()).toBe('Se moverá a Proyecto Alpha / Documentación / Entregables.');
    expect(screen.queryByLabelText('Nombre de la nueva carpeta')).toBeNull();
  });

  it('CA-7: también crea con el botón ✓', async () => {
    const props = renderDialog();
    await treeLoaded();

    const field = await openNewFolderIn('Documentación');
    await userEvent.type(field, 'Entregables');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(props.createFolder).toHaveBeenCalledTimes(1);
  });

  it('CA-2: vacío: error debajo del campo sin llamar a la API', async () => {
    const props = renderDialog();
    await treeLoaded();

    const field = await openNewFolderIn('Documentación');
    await userEvent.type(field, '{Enter}');

    expect(screen.getByRole('alert').textContent).toBe('Escribe un nombre para la carpeta.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(props.createFolder).not.toHaveBeenCalled();
  });

  it('CA-3: el 409 usa el nombre guardado del destino y se borra al escribir', async () => {
    renderDialog({
      createFolder: jest.fn(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      ),
    });
    await treeLoaded();

    const field = await openNewFolderIn('Proyecto Alpha');
    await userEvent.type(field, 'actas{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ya existe una carpeta llamada «Actas» aquí. Elige otro nombre.',
    );
    await userEvent.type(field, 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA-9: el 422 de profundidad va debajo del campo', async () => {
    renderDialog({
      createFolder: jest.fn(() =>
        Promise.reject(
          new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
            maxDepth: 10,
          }),
        ),
      ),
    });
    await treeLoaded();

    await userEvent.type(await openNewFolderIn('Documentación'), 'Anexos{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Llegaste al máximo de 10 niveles de carpetas. Crea la carpeta en otro lugar.',
    );
  });

  it('error de red: el texto aprobado debajo del campo', async () => {
    renderDialog({ createFolder: jest.fn(() => Promise.reject(new TypeError('red'))) });
    await treeLoaded();

    await userEvent.type(await openNewFolderIn('Documentación'), 'Anexos{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos crear la carpeta. Inténtalo de nuevo.',
    );
  });

  it('Esc cancela el campo sin cerrar el diálogo y el foco vuelve al destino', async () => {
    const props = renderDialog();
    await treeLoaded();

    await openNewFolderIn('Documentación');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByLabelText('Nombre de la nueva carpeta')).toBeNull();
    expect(document.activeElement).toBe(item('Documentación'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('«Nueva carpeta» con el campo abierto lleva el foco al campo', async () => {
    renderDialog();
    await treeLoaded();

    const field = await openNewFolderIn('Documentación');
    item('Mis archivos').focus();
    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));

    expect(document.activeElement).toBe(field);
    expect(screen.getAllByLabelText('Nombre de la nueva carpeta')).toHaveLength(1);
  });

  it('CA-25: con el campo y su error, sin violaciones serias de axe', async () => {
    renderDialog();
    await treeLoaded();
    await userEvent.type(await openNewFolderIn('Documentación'), '{Enter}');

    await expectNoBlockingViolations();
  });
});
