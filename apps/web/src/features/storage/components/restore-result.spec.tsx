/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type RestoreResponse, type TrashItem } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { StorageRequestError } from '../storage-request-error';

import {
  RestoreResult,
  restoreFailureLine,
  restoreResultTitle,
  restoreSuccessLine,
  type RestoreLine,
} from './restore-result';

const AT = '2026-09-30T10:00:00.000Z';
const FASE3 = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };

function trashItem(name: string, type: TrashItem['type'] = 'file'): TrashItem {
  return {
    id: `id-${name}`,
    type,
    name,
    sizeBytes: 1_000,
    originalFolder: FASE3,
    deletedAt: AT,
    purgeAt: AT,
  };
}

function restored(
  name: string,
  outcome: RestoreResponse['outcome'],
  originalName = name,
): RestoreResponse {
  return {
    item: {
      type: 'file',
      id: `id-${originalName}`,
      name,
      sizeBytes: 1_000,
      kind: 'xlsx',
      folderId: outcome === 'moved_to_root' ? null : FASE3.id,
      createdAt: AT,
    },
    outcome,
    originalName,
  };
}

describe('resultado de restaurar (CA-13, CA-14, CA-15, CA-17)', () => {
  it('CA-13: en su lugar, «volvió a {carpeta}»', () => {
    const line = restoreSuccessLine(trashItem('Render.mp4'), restored('Render.mp4', 'restored'));

    expect(line).toEqual({
      id: 'id-Render.mp4',
      status: 'restored',
      text: '«Render.mp4» volvió a Fase 3 · RAG.',
    });
  });

  it('CA-14: con «(n)», dice el nombre nuevo y por qué', () => {
    const line = restoreSuccessLine(
      trashItem('Presupuesto.xlsx'),
      restored('Presupuesto (1).xlsx', 'renamed', 'Presupuesto.xlsx'),
    );

    expect(line.status).toBe('changed');
    expect(line.text).toBe(
      'Restauramos «Presupuesto.xlsx» como «Presupuesto (1).xlsx» porque ya existía uno con ese nombre.',
    );
  });

  it('CA-15: sin carpeta original, vuelve a Mis archivos con el aviso', () => {
    const line = restoreSuccessLine(
      trashItem('Entrevistas'),
      restored('Entrevistas', 'moved_to_root'),
    );

    expect(line).toMatchObject({
      status: 'changed',
      text: 'La carpeta original ya no está disponible. Restauramos «Entrevistas» en Mis archivos.',
    });
  });

  it('CA-14, CA-15: a la raíz y con «(n)» a la vez, dice las dos cosas', () => {
    const line = restoreSuccessLine(
      trashItem('Acta.pdf'),
      restored('Acta (1).pdf', 'moved_to_root', 'Acta.pdf'),
    );

    expect(line.text).toBe(
      'La carpeta original ya no está disponible. Restauramos «Acta.pdf» en Mis archivos como «Acta (1).pdf» porque ya existía uno con ese nombre.',
    );
  });

  it('CA-15: el 422 por profundidad dice el máximo y cómo resolverlo', () => {
    const error = new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
      maxDepth: 10,
    });

    expect(restoreFailureLine(trashItem('Capturas_v1', 'folder'), error)).toEqual({
      id: 'id-Capturas_v1',
      status: 'failed',
      text: 'No podemos restaurar «Capturas_v1» aquí porque superaría 10 niveles de carpetas. Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.',
    });
  });

  it('CA-16: un 404 dice que puede que ya se haya eliminado definitivamente', () => {
    const error = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);

    expect(restoreFailureLine(trashItem('Acta.pdf'), error).text).toBe(
      'No encontramos «Acta.pdf» en la papelera. Puede que ya se haya eliminado definitivamente.',
    );
  });

  it('CA-17: un corte de red pide revisar la conexión', () => {
    expect(restoreFailureLine(trashItem('Acta.pdf'), new TypeError('fetch')).text).toBe(
      'No pudimos restaurar «Acta.pdf». Revisa tu conexión e inténtalo de nuevo.',
    );
  });

  it('CA-17: el título cuenta lo restaurado del total', () => {
    const ok: RestoreLine = { id: 'a', status: 'restored', text: '' };
    const changed: RestoreLine = { id: 'b', status: 'changed', text: '' };
    const failed: RestoreLine = { id: 'c', status: 'failed', text: '' };

    expect(restoreResultTitle([ok, changed, ok, failed])).toBe('Restauramos 3 de 4 elementos');
    expect(restoreResultTitle([changed])).toBe('Restauramos 1 elemento');
    expect(restoreResultTitle([ok, changed])).toBe('Restauramos 2 elementos');
    expect(restoreResultTitle([failed])).toBe('No pudimos restaurar el elemento');
  });

  it('CA-17, CA-25: panel role="status" con una línea por elemento, rótulo de texto y «Cerrar resultado»', async () => {
    const onDismiss = jest.fn();
    const lines: RestoreLine[] = [
      { id: 'a', status: 'restored', text: '«A» volvió a Fase 3 · RAG.' },
      { id: 'b', status: 'changed', text: 'Restauramos «B» como «B (1)».' },
      { id: 'c', status: 'failed', text: 'No podemos restaurar «C» aquí.' },
    ];
    const { container } = render(<RestoreResult lines={lines} onDismiss={onDismiss} />);

    const panel = screen.getByRole('status', { name: 'Restauramos 2 de 3 elementos' });
    const items = within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      'Restaurado. «A» volvió a Fase 3 · RAG.',
      'Restaurado con cambios. Restauramos «B» como «B (1)».',
      'No restaurado. No podemos restaurar «C» aquí.',
    ]);
    await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar resultado' }));
    expect(onDismiss).toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
