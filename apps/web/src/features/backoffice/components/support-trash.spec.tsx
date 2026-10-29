/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  BACKOFFICE_FIELD_MESSAGES,
  SHARED_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type ClientTrashResponse,
  type RestoreResponse,
} from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiClientError } from '../../../lib/api-error';
import { dayText } from '../backoffice-dates';
import type { ClientTrashRequest } from '../hooks/use-client-trash';
import { LAURA } from '../test-client-files';
import {
  clientTrashPage,
  restored,
  TRASH_FOLDER,
  TRASH_PDF,
  TRASH_SHEET,
} from '../test-client-trash';
import { apiError, loadOf as loadInOrder } from '../test-loads';

import { SupportTrash, type RestoreClientNode } from './support-trash';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

type LoadMock = jest.Mock<Promise<ClientTrashResponse>, [ClientTrashRequest]>;

const loadOf = (...results: readonly (ClientTrashResponse | Error)[]): LoadMock =>
  loadInOrder<ClientTrashRequest, ClientTrashResponse>(...results);

const REASON = '  El cliente pidió recuperar el presupuesto para revisarlo.  ';
const DAY_MS = 86_400_000;

function restoreOf(
  ...results: readonly (RestoreResponse | Error)[]
): jest.MockedFunction<RestoreClientNode> {
  return loadInOrder(...results) as jest.MockedFunction<RestoreClientNode>;
}

async function searchFor(load: LoadMock, restore: RestoreClientNode = restoreOf()): Promise<void> {
  render(<SupportTrash load={load} restore={restore} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Correo del cliente'), LAURA.email);
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  await act(async () => undefined);
}

/** Abre «Restaurar» de una fila de la lista por el nombre del elemento. */
async function openRestore(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Restaurar ${name}` }));
}

async function confirmWith(reason: string): Promise<void> {
  const dialog = screen.getByRole('dialog');
  if (reason !== '') {
    await userEvent.click(within(dialog).getByLabelText('Motivo de la restauración'));
    await userEvent.paste(reason);
  }
  await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar' }));
  await act(async () => undefined);
}

describe('SupportTrash: la papelera de un cliente (011b CA-10, CA-12, CA-17)', () => {
  it('CA-17: inicial, con el aviso de privacidad, la ayuda del campo y qué verá', () => {
    render(<SupportTrash load={loadOf()} restore={restoreOf()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Papelera de archivos' })).toBeTruthy();
    expect(screen.getByText(/nunca abrirlas, descargarlas, editarlas ni borrarlas/)).toBeTruthy();
    expect(
      screen.getByLabelText('Correo del cliente').getAttribute('aria-describedby'),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Busca a un cliente para ver su papelera' }),
    ).toBeTruthy();
  });

  it('CA-10: default, con el cliente, el aviso de auditoría con el rol y una fila por raíz', async () => {
    const load = loadOf(clientTrashPage([TRASH_FOLDER, TRASH_SHEET, TRASH_PDF]));
    await searchFor(load);

    expect(load).toHaveBeenCalledWith({ email: LAURA.email });
    expect(screen.getByRole('heading', { level: 2, name: 'Laura Barrios' })).toBeTruthy();
    expect(screen.getByText('Cada restauración queda en la auditoría de Laura.')).toBeTruthy();
    expect(
      screen.getByText(/Verá la fecha, el motivo que escribas y tu rol \(Soporte\)/),
    ).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByText('Mis archivos / Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mis archivos').length).toBeGreaterThan(0);
  });

  it('RN-3: la única acción de cada fila es «Restaurar»; nada se abre, descarga ni previsualiza', async () => {
    await searchFor(loadOf(clientTrashPage([TRASH_FOLDER, TRASH_PDF])));

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /^Restaurar / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Descargar|Abrir|Eliminar|Vaciar/ })).toBeNull();
  });

  it('CA-10: «Cargar más» pide el cursor y suma la página sin duplicar lo que ya se ve', async () => {
    const load = loadOf(
      clientTrashPage([TRASH_FOLDER], 'cursor-2'),
      clientTrashPage([TRASH_FOLDER, TRASH_PDF]),
    );
    await searchFor(load);

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await act(async () => undefined);

    expect(load).toHaveBeenLastCalledWith({ email: LAURA.email, cursor: 'cursor-2' });
    expect(screen.getAllByRole('button', { name: /^Restaurar / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('CA-17: si «Cargar más» falla, lo ya visible sigue y se puede reintentar', async () => {
    const load = loadOf(clientTrashPage([TRASH_FOLDER], 'cursor-2'), new TypeError('x'));
    await searchFor(load);

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await act(async () => undefined);

    expect(screen.getByText('No pudimos cargar más elementos.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Restaurar / })).toBeTruthy();
  });

  it('CA-17: vacía: «La papelera de Laura Barrios está vacía.»', async () => {
    await searchFor(loadOf(clientTrashPage([])));

    expect(
      screen.getByRole('heading', { name: 'La papelera de Laura Barrios está vacía.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('CA-17: cargando: esqueleto y «Buscando la cuenta y su papelera…»', async () => {
    await searchFor(loadOf());

    expect(screen.getByRole('status').textContent).toContain('Buscando la cuenta y su papelera…');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('CA-12: un correo que no es de un cliente es el mismo «No encontramos…», con «Limpiar búsqueda»', async () => {
    await searchFor(loadOf(apiError(404, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND)));

    expect(
      screen.getByRole('heading', {
        name: `No encontramos una cuenta de cliente con «${LAURA.email}».`,
      }),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect((screen.getByLabelText('Correo del cliente') as HTMLInputElement).value).toBe('');
    expect(
      screen.getByRole('heading', { name: 'Busca a un cliente para ver su papelera' }),
    ).toBeTruthy();
  });

  it('CA-17: error: «No pudimos cargar la papelera.» y «Reintentar» repite la misma búsqueda', async () => {
    const load = loadOf(new TypeError('Failed to fetch'), clientTrashPage([TRASH_PDF]));
    await searchFor(load);
    expect(screen.getByRole('heading', { name: 'No pudimos cargar la papelera.' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('CA-14: un 403 es la pantalla común «Sin permiso»', async () => {
    await searchFor(loadOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN)));

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    expect(screen.queryByLabelText('Correo del cliente')).toBeNull();
  });
});

describe('SupportTrash: restaurar con motivo (011b CA-11, CA-12)', () => {
  it('CA-11: confirmar dice el elemento, el destino, qué pasa si el nombre está ocupado y de quién es la auditoría', async () => {
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])));

    await openRestore(TRASH_SHEET.name);

    const dialog = screen.getByRole('dialog', { name: 'Restaurar «Presupuesto_Q4_borrador.xlsx»' });
    expect(
      within(dialog).getByText(/El archivo volverá a «Mis archivos \/ Finanzas»/),
    ).toBeTruthy();
    expect(within(dialog).getByText(/Si ya existe uno con ese nombre/)).toBeTruthy();
    expect(within(dialog).getByText('0/500')).toBeTruthy();
    expect(
      within(dialog).getByText(
        /El motivo queda en la auditoría de Laura\. Verá la fecha, el motivo y tu rol \(Soporte\), no tu nombre\./,
      ),
    ).toBeTruthy();
  });

  it('CA-11: una carpeta dice «La carpeta volverá a…»', async () => {
    await searchFor(loadOf(clientTrashPage([TRASH_FOLDER])));

    await openRestore(TRASH_FOLDER.name);

    expect(
      within(screen.getByRole('dialog')).getByText(/La carpeta volverá a «Mis archivos \/ Alpha»/),
    ).toBeTruthy();
  });

  it('CA-11: «Cancelar» cierra sin llamar a la API y devuelve el foco a «Restaurar»', async () => {
    const restore = restoreOf();
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restore);
    await openRestore(TRASH_SHEET.name);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Restaurar ${TRASH_SHEET.name}` }),
    );
  });

  it('CA-11: motivo inválido: resumen y error de campo, nada se envía y la fila sigue', async () => {
    const restore = restoreOf();
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restore);
    await openRestore(TRASH_SHEET.name);

    await confirmWith('   ');

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/Escribe un motivo para restaurar\. Nada cambió\./),
    ).toBeTruthy();
    expect(
      within(dialog).getAllByText(BACKOFFICE_FIELD_MESSAGES.NOTE_REQUIRED).length,
    ).toBeGreaterThan(1);
    expect(
      within(dialog).getByLabelText('Motivo de la restauración').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(restore).not.toHaveBeenCalled();
  });

  it('CA-11: un motivo de más de 500 caracteres tampoco se envía', async () => {
    const restore = restoreOf();
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restore);
    await openRestore(TRASH_SHEET.name);

    await confirmWith('a'.repeat(501));

    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByText('501/500')).toBeTruthy();
    expect(screen.getAllByText(BACKOFFICE_FIELD_MESSAGES.NOTE_TOO_LONG).length).toBeGreaterThan(1);
  });

  it('CA-11: el contador cuenta el motivo recortado: 500 caracteres y espacios al final dan 500/500 y se envía', async () => {
    const restore = restoreOf(restored(TRASH_SHEET));
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restore);
    await openRestore(TRASH_SHEET.name);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Motivo de la restauración'));
    await userEvent.paste(`${'a'.repeat(500)}     `);

    expect(within(dialog).getByText('500/500')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar' }));
    await act(async () => undefined);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('CA-11: restaurando: botón ocupado, motivo conservado y campo de solo lectura', async () => {
    const restore = jest.fn(() => new Promise<RestoreResponse>(() => undefined));
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restore);
    await openRestore(TRASH_SHEET.name);

    await confirmWith(REASON);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Restaurando…' })).toBeTruthy();
    const field = within(dialog).getByLabelText('Motivo de la restauración') as HTMLTextAreaElement;
    expect(field.value).toBe(REASON);
    expect(field.readOnly).toBe(true);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('CA-11: restaurado: envía el correo, el tipo y el motivo recortado; la fila sale y el aviso dice dónde quedó', async () => {
    const restore = restoreOf(restored(TRASH_SHEET));
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET, TRASH_PDF])), restore);
    await openRestore(TRASH_SHEET.name);

    await confirmWith(REASON);

    expect(restore).toHaveBeenCalledWith({
      email: LAURA.email,
      nodeId: TRASH_SHEET.id,
      type: 'file',
      note: REASON.trim(),
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByText('Restauramos «Presupuesto_Q4_borrador.xlsx» en Mis archivos / Finanzas.'),
    ).toBeTruthy();
    expect(screen.getByText('El motivo quedó en la auditoría de Laura.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Restaurar ${TRASH_SHEET.name}` })).toBeNull();
    expect(screen.getByRole('button', { name: `Restaurar ${TRASH_PDF.name}` })).toBeTruthy();
  });

  it('CA-11: el aviso recibe el foco y «Entendido» lo cierra', async () => {
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restoreOf(restored(TRASH_SHEET)));
    await openRestore(TRASH_SHEET.name);
    await confirmWith(REASON);

    const notice = screen.getByText(/^Restauramos «/).closest('[tabindex="-1"]');
    expect(document.activeElement).toBe(notice);

    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));

    expect(screen.queryByText(/^Restauramos «/)).toBeNull();
  });

  it('CA-11: una carpeta se envía con `type: folder`', async () => {
    const restore = restoreOf(restored(TRASH_FOLDER));
    await searchFor(loadOf(clientTrashPage([TRASH_FOLDER])), restore);
    await openRestore(TRASH_FOLDER.name);

    await confirmWith(REASON);

    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'folder', nodeId: TRASH_FOLDER.id }),
    );
  });

  it('CA-11: renombrado: dice el nombre nuevo y por qué', async () => {
    const response = restored(TRASH_PDF, 'renamed', 'Contrato_servicios_Alpha (1).pdf');
    await searchFor(loadOf(clientTrashPage([TRASH_PDF])), restoreOf(response));
    await openRestore(TRASH_PDF.name);

    await confirmWith(REASON);

    expect(
      screen.getByText(
        'Restauramos «Contrato_servicios_Alpha.pdf» como «Contrato_servicios_Alpha (1).pdf» porque ya existía uno con ese nombre.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Quedó en «Mis archivos»\./)).toBeTruthy();
  });

  it('CA-11: movido a la raíz: «La carpeta original ya no está disponible…»', async () => {
    const response = restored(TRASH_FOLDER, 'moved_to_root');
    await searchFor(loadOf(clientTrashPage([TRASH_FOLDER])), restoreOf(response));
    await openRestore(TRASH_FOLDER.name);

    await confirmWith(REASON);

    expect(
      screen.getByText(
        'La carpeta original ya no está disponible. Restauramos «Contratos 2026» en Mis archivos.',
      ),
    ).toBeTruthy();
  });

  it('CA-12: retención vencida (404): la fila sale, el aviso lo explica y nada más cambia', async () => {
    const expired = { ...TRASH_PDF, purgeAt: new Date(Date.now() - DAY_MS).toISOString() };
    const gone = apiError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);
    await searchFor(loadOf(clientTrashPage([expired, TRASH_SHEET])), restoreOf(gone));
    await openRestore(expired.name);

    await confirmWith(REASON);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByText('Ya no se puede restaurar «Contrato_servicios_Alpha.pdf».'),
    ).toBeTruthy();
    expect(
      screen.getByText(`Su retención venció el ${dayText(expired.purgeAt)}. Nada cambió.`),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Restaurar ${expired.name}` })).toBeNull();
    expect(screen.getByRole('button', { name: `Restaurar ${TRASH_SHEET.name}` })).toBeTruthy();
  });

  it('CA-12: 404 con retención vigente (ya restaurado o vaciado): no dice «venció» con una fecha futura', async () => {
    const pending = { ...TRASH_PDF, purgeAt: new Date(Date.now() + DAY_MS).toISOString() };
    const gone = apiError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);
    await searchFor(loadOf(clientTrashPage([pending])), restoreOf(gone));
    await openRestore(pending.name);

    await confirmWith(REASON);

    expect(screen.getByText('Ya no está en la papelera de Laura. Nada cambió.')).toBeTruthy();
    expect(screen.queryByText(/venció/)).toBeNull();
  });

  it('CA-12: 422 de profundidad: el diálogo sigue abierto, con el límite y qué debe hacer el cliente', async () => {
    const tooDeep = new ApiClientError({
      status: 422,
      code: STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED,
      message: 'depth',
      correlationId: 'corr-1',
      details: { maxDepth: 10 },
    });
    await searchFor(loadOf(clientTrashPage([TRASH_FOLDER])), restoreOf(tooDeep));
    await openRestore(TRASH_FOLDER.name);

    await confirmWith(REASON);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No pudimos restaurar.')).toBeTruthy();
    expect(
      within(dialog).getByText(
        /«Contratos 2026» superaría 10 niveles de carpetas en «Mis archivos \/ Alpha»\. Nada cambió\. Pídele a Laura que mueva la carpeta original a un nivel más alto/,
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Crea la carpeta en otro lugar/)).toBeNull();
  });

  it('CA-17: otro rechazo deja el diálogo abierto, con el aviso y el motivo escrito', async () => {
    const failed = apiError(500, 'SHARED_INTERNAL_ERROR');
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restoreOf(failed));
    await openRestore(TRASH_SHEET.name);

    await confirmWith(REASON);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No pudimos restaurar.')).toBeTruthy();
    expect(
      (within(dialog).getByLabelText('Motivo de la restauración') as HTMLTextAreaElement).value,
    ).toBe(REASON);
    expect(
      screen.getByRole('button', { name: `Restaurar ${TRASH_SHEET.name}`, hidden: true }),
    ).toBeTruthy();
  });

  it('RNF-17: el motivo y los nombres no salen de la pantalla (ni a la URL ni al almacenamiento)', async () => {
    await searchFor(loadOf(clientTrashPage([TRASH_SHEET])), restoreOf(restored(TRASH_SHEET)));
    await openRestore(TRASH_SHEET.name);
    await confirmWith(REASON);

    expect(window.location.href).not.toContain('presupuesto');
    expect(JSON.stringify(window.localStorage)).not.toContain('presupuesto');
  });
});
