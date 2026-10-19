/** @jest-environment jsdom */
import { STORAGE_PREVIEW_FAILURE_CODES } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps } from 'react';

import { storageMessage } from '../../../../lib/error-catalog';
import type { PreviewState } from '../hooks/use-preview';
import type { PreviewFailureReason } from '../preview-failure';

import { PreviewStates } from './PreviewStates';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

function renderState(state: PreviewState) {
  const onRetry = jest.fn();
  const onDownload = jest.fn();
  const { container } = render(
    <main>
      <h1>Vista previa</h1>
      <PreviewStates
        state={state}
        onRetry={onRetry}
        onDownload={onDownload}
        returnHref="/archivos?foco=archivo-17"
      />
    </main>,
  );
  return { container, onRetry, onDownload };
}

const failed = (reason: PreviewFailureReason): PreviewState => ({
  status: 'failure',
  failure: { reason, correlationId: 'request-17' },
});

describe('estados permitidos T-06', () => {
  it.each([false, true])(
    'CA-9: loading prolongado=%s solo anuncia el texto inequívoco',
    (prolonged) => {
      renderState({ status: 'loading', prolonged });
      expect(screen.getByRole('status').textContent).toContain(
        prolonged ? 'Preparando la vista previa…' : 'Abriendo la vista previa…',
      );
      expect(screen.queryByText(/archivo grande/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
      if (prolonged)
        expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
    },
  );

  it('CA-7: no encontrado ofrece solo la vuelta a raíz', () => {
    renderState(failed('not-found'));
    expect(
      screen.getByRole('heading', { level: 2, name: 'No encontramos este archivo.' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos?foco=archivo-17',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-2: red muestra el texto aprobado y las dos acciones sin mensajes crudos', async () => {
    const { onRetry, onDownload } = renderState(failed('network'));
    expect(screen.getByRole('alert').textContent).toContain(
      'Revisa tu conexión e inténtalo de nuevo. Tus archivos siguen guardados y puedes descargar este mientras tanto.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('CA-2: unsupported reutiliza el catálogo existente y pone Descargar primero', () => {
    renderState(failed('unsupported'));
    expect(screen.getByText('Este tipo de archivo no tiene vista previa.')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Descargar',
      'Reintentar',
    ]);
  });

  it('CA-2: inesperado usa el mensaje genérico existente', () => {
    renderState(failed('unexpected'));
    expect(screen.getByRole('alert').textContent).toContain(
      'Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: request-17',
    );
  });

  it.each([
    ['protected', STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_PASSWORD_PROTECTED],
    ['corrupt', STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_CORRUPT],
    ['unavailable', STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_UNAVAILABLE],
    ['memory', STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_UNAVAILABLE],
    ['expired', STORAGE_PREVIEW_FAILURE_CODES.STORAGE_PREVIEW_EXPIRED],
  ] as const)(
    'CA-2: %s usa catálogo y acciones manuales en el orden aprobado',
    async (reason, code) => {
      const { onRetry, onDownload } = renderState(failed(reason));
      const message = storageMessage(code);
      if (message === null) throw new Error('Falta catálogo aprobado');
      expect(screen.getByRole('heading', { name: message.cause })).toBeTruthy();
      expect(screen.getByText(message.fix)).toBeTruthy();
      expect(screen.getByRole(reason === 'corrupt' ? 'alert' : 'status')).toBeTruthy();
      const order =
        reason === 'expired' ? ['Reintentar', 'Descargar'] : ['Descargar', 'Reintentar'];
      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(order);
      expect(onRetry).toHaveBeenCalledTimes(0);
      await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onDownload).toHaveBeenCalledTimes(1);
    },
  );

  it('Guardia complementaria (017 CA-12): límite de emisión usa warning y solo callbacks manuales', () => {
    renderState(failed('rate-limited'));
    expect(screen.getByRole('status').textContent).toContain('Hiciste demasiadas solicitudes.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['forbidden', 'unauthenticated'] as const)(
    'CA-7: %s muestra acceso público sin Descargar',
    (reason) => {
      renderState(failed(reason));
      expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Ir a Mis archivos' })).toBeTruthy();
    },
  );

  it.each([
    'network',
    'unexpected',
    'not-found',
    'unsupported',
    'rate-limited',
    'forbidden',
    'unauthenticated',
    'protected',
    'corrupt',
    'unavailable',
    'expired',
    'memory',
  ] as const)('CA-9: jest-axe no encuentra violaciones en %s', async (reason) => {
    const { container } = renderState(failed(reason));
    expect((await axe(container)).violations).toEqual([]);
  });

  it.each([false, true])('CA-9: jest-axe pasa en loading prolongado=%s', async (prolonged) => {
    const { container } = renderState({ status: 'loading', prolonged });
    expect((await axe(container)).violations).toEqual([]);
  });
});
