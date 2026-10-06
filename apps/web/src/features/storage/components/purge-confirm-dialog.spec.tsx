/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type TrashItem } from '@nimbo/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { StorageRequestError } from '../storage-request-error';

import {
  PURGING_DELAY_MS,
  PurgeConfirmDialog,
  type PurgeConfirmDialogProps,
  type PurgeTarget,
} from './purge-confirm-dialog';

const AT = '2026-09-30T10:00:00.000Z';
const RENDER: TrashItem = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  type: 'file',
  name: 'Render_pruebas_animacion.mp4',
  kind: 'otro',
  sizeBytes: 980_000_000,
  originalFolder: null,
  deletedAt: AT,
  purgeAt: AT,
};
const CAPTURAS: TrashItem = {
  ...RENDER,
  type: 'folder',
  name: 'Capturas_v1',
  sizeBytes: 1_400_000_000,
};

function renderDialog(
  target: PurgeTarget,
  overrides: Partial<PurgeConfirmDialogProps> = {},
): PurgeConfirmDialogProps {
  const props: PurgeConfirmDialogProps = {
    target,
    onConfirm: jest.fn(() => Promise.resolve()),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<PurgeConfirmDialog {...props} />);
  return props;
}

function never(): Promise<void> {
  return new Promise<void>(() => undefined);
}

describe('PurgeConfirmDialog (CA-18)', () => {
  afterEach(() => jest.useRealTimers());

  it('CA-18: un archivo: consecuencia y espacio que se libera, con el foco en «Cancelar»', () => {
    renderDialog({ scope: 'item', item: RENDER });

    const dialog = screen.getByRole('alertdialog', {
      name: '¿Eliminar definitivamente «Render_pruebas_animacion.mp4»?',
    });
    expect(dialog.textContent).toContain(
      'Esta acción no se puede deshacer. Liberarás 980 MB de espacio.',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('CA-18: una carpeta avisa que se va con todo su contenido', () => {
    renderDialog({ scope: 'item', item: CAPTURAS });

    const dialog = screen.getByRole('alertdialog', {
      name: '¿Eliminar definitivamente la carpeta «Capturas_v1»?',
    });
    expect(dialog.textContent).toContain(
      'Se eliminará también todo su contenido. Esta acción no se puede deshacer. Liberarás 1,4 GB de espacio.',
    );
  });

  it('CA-18: vaciar dice cuántos elementos y el total', () => {
    renderDialog({ scope: 'all', itemCount: 6, totalBytes: 2_700_000_000 });

    const dialog = screen.getByRole('alertdialog', { name: '¿Vaciar la papelera?' });
    expect(dialog.textContent).toContain(
      'Se eliminarán definitivamente los 6 elementos. Esta acción no se puede deshacer. Liberarás 2,7 GB de espacio.',
    );
    expect(screen.getByRole('button', { name: 'Vaciar papelera' })).toBeTruthy();
  });

  it('CA-18: sin confirmar no ocurre nada', async () => {
    const props = renderDialog({ scope: 'item', item: RENDER });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('CA-18: al confirmar elimina y cierra', async () => {
    const props = renderDialog({ scope: 'item', item: RENDER });

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('CA-18: si tarda más de 2 s, el botón pasa a «Eliminando…» y no se repite', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const props = renderDialog({ scope: 'item', item: RENDER }, { onConfirm: jest.fn(never) });

    await user.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }));
    await act(async () => {
      jest.advanceTimersByTime(PURGING_DELAY_MS);
    });

    const busy = screen.getByRole('button', { name: 'Eliminando…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('CA-16: un 404 se explica dentro del diálogo, que sigue abierto', async () => {
    renderDialog(
      { scope: 'item', item: RENDER },
      {
        onConfirm: jest.fn(() =>
          Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
        ),
      },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No encontramos «Render_pruebas_animacion.mp4» en la papelera. Puede que ya se haya eliminado definitivamente.',
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('CA-18: un corte de red al vaciar pide reintentar', async () => {
    renderDialog(
      { scope: 'all', itemCount: 2, totalBytes: 10 },
      { onConfirm: jest.fn(() => Promise.reject(new TypeError('fetch'))) },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Vaciar papelera' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos vaciar la papelera. Revisa tu conexión e inténtalo de nuevo.',
    );
  });

  it('CA-25: sin violaciones de axe', async () => {
    renderDialog({ scope: 'item', item: RENDER });

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});
