/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { StorageRequestError } from '../storage-request-error';
import { pruneWarning, versionFixture } from '../test-versions';

import {
  RESTORING_DELAY_MS,
  RestoreVersionDialog,
  type RestoreTarget,
  type RestoreVersionDialogProps,
} from './restore-version-dialog';

const V4 = versionFixture({
  number: 4,
  origin: 'restauracion',
  sizeBytes: 2_400_000,
  deltaBytes: '-100000',
  restoredFromNumber: 2,
  createdAt: '2026-10-07T23:20:00.000Z',
});

const WITH_ROOM: RestoreTarget = {
  version: V4,
  byline: 'ayer, 17:20 · Tú',
  currentNumber: 5,
  retainedVersions: 3,
  prunedNumber: null,
};
const AT_LIMIT: RestoreTarget = { ...WITH_ROOM, prunedNumber: 3 };

function renderDialog(
  target: RestoreTarget,
  overrides: Partial<RestoreVersionDialogProps> = {},
): RestoreVersionDialogProps {
  const props: RestoreVersionDialogProps = {
    target,
    onConfirm: jest.fn(() => Promise.resolve()),
    onClose: jest.fn(),
    ...overrides,
  };
  render(<RestoreVersionDialog {...props} />);
  return props;
}

function never(): Promise<void> {
  return new Promise<void>(() => undefined);
}

function rejecting(error: unknown): () => Promise<void> {
  return jest.fn(() => Promise.reject(error));
}

describe('RestoreVersionDialog (014 CA-9, CA-12, CA-15, CA-20)', () => {
  afterEach(() => jest.useRealTimers());

  it('CA-20: dice qué se crea y el espacio que usará; el foco empieza en «Restaurar versión 4»', () => {
    renderDialog(WITH_ROOM);

    const dialog = screen.getByRole('alertdialog', { name: '¿Restaurar la versión 4?' });
    expect(dialog.textContent).toContain(
      'Se creará una versión nueva con el contenido de la versión 4. Usará 2,4 MB de tu espacio.',
    );
    expect(dialog.textContent).toContain('ayer, 17:20 · Tú');
    expect(dialog.textContent).toContain('Versión 5 · se conserva en el historial');
    expect(dialog.textContent).not.toContain('Se eliminará');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Restaurar versión 4' }),
    );
  });

  it('CA-15: en el límite avisa qué versión se eliminará y el foco pasa a «Cancelar»', () => {
    renderDialog(AT_LIMIT);

    const dialog = screen.getByRole('alertdialog');
    const warning = pruneWarning(dialog);
    expect(warning.textContent).toBe(
      'Se eliminará la versión 3. Tu plan conserva 3 versiones. Al continuar se eliminará la versión 3, la más antigua.',
    );
    expect(dialog.getAttribute('aria-describedby')?.split(' ')).toContain(warning.id);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('CA-9: al confirmar restaura y cierra', async () => {
    const props = renderDialog(WITH_ROOM);

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('CA-20: si tarda más de 2 s, «Restaurando…», botones deshabilitados y anuncio', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const props = renderDialog(WITH_ROOM, { onConfirm: jest.fn(never) });

    await user.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));
    await act(async () => {
      jest.advanceTimersByTime(RESTORING_DELAY_MS);
    });

    expect(screen.getByRole('button', { name: 'Restaurando…' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Restaurando la versión 4…').getAttribute('role')).toBe('status');
    await user.keyboard('{Escape}');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('CA-15: sin confirmar no ocurre nada', async () => {
    const props = renderDialog(AT_LIMIT);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('CA-12: sin espacio dice cuánto falta, ofrece «Liberar espacio» y el foco pasa a «Cerrar»', async () => {
    const quota = new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED, {
      missingBytes: 1_600_000,
    });
    renderDialog(WITH_ROOM, { onConfirm: rejecting(quota) });

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'No pudimos restaurar la versión 4. Te faltan 1,6 MB de espacio para restaurar esta versión. Libera espacio o cambia de plan.',
    );
    expect(screen.getByRole('link', { name: 'Liberar espacio' }).getAttribute('href')).toBe(
      '/espacio',
    );
    expect(screen.queryByRole('button', { name: 'Restaurar versión 4' })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' })),
    );
  });

  it('un corte de red pide reintentar y deja confirmar de nuevo', async () => {
    const onConfirm = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(undefined);
    const props = renderDialog(WITH_ROOM, { onConfirm });

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos restaurar la versión 4. Revisa tu conexión e inténtalo de nuevo.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('un 429 pide esperar', async () => {
    const tooMany = new StorageRequestError(429, STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS);
    renderDialog(WITH_ROOM, { onConfirm: rejecting(tooMany) });

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    );
  });

  it('CA-15, CA-20: sin violaciones de axe', async () => {
    renderDialog(AT_LIMIT);

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});
