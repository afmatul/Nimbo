/**
 * @jest-environment jsdom
 */
import type { IndexingReason, IndexingStatusResponse } from '@nimbo/contracts';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { RetryControl } from '../hooks/use-indexing-status';
import { FAILED, INDEXING, indexingStatus, NOT_INDEXED_TYPE } from '../test-indexing';

import { IndexingBanner } from './indexing-banner';

function retryControl(overrides: Partial<RetryControl> = {}): RetryControl {
  return { pending: false, failed: false, run: jest.fn(() => Promise.resolve(true)), ...overrides };
}

function renderBanner(status: IndexingStatusResponse | null, retry = retryControl()): HTMLElement {
  render(<IndexingBanner status={status} retry={retry} />);
  return screen.getByRole('status');
}

const notIndexable = (reason: IndexingReason): IndexingStatusResponse =>
  indexingStatus({ state: 'no_indexable', reason });

describe('IndexingBanner (019 CA-4, CA-5, CA-7, CA-12 a CA-14, CA-19)', () => {
  it('CA-14: `pendiente` e `indexando` dicen lo mismo, con tono informativo', () => {
    for (const state of ['pendiente', 'indexando'] as const) {
      const region = renderBanner(indexingStatus({ state, updatedAt: null }));
      expect(region.textContent).toContain('Indexando… ya puedes seguir trabajando.');
      expect(region.textContent).toContain('Este aviso se actualiza solo cuando termine.');
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
    }
  });

  it('CA-4: PDF sin texto: se busca solo por nombre y sugiere reemplazarlo por una versión con texto', () => {
    const region = renderBanner(notIndexable('sin_texto'));

    expect(region.textContent).toContain(
      'No pudimos leer el texto de este PDF. Se busca solo por nombre.',
    );
    expect(region.textContent).toContain('súbela con el mismo nombre y elige «Reemplazar»');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-5: el contenido no corresponde al formato', () => {
    const region = renderBanner(notIndexable('formato_no_soportado'));

    expect(region.textContent).toContain('No pudimos leer el contenido de este archivo.');
    expect(region.textContent).toContain('Se busca solo por nombre');
  });

  it('CA-7: demasiado grande para indexarlo', () => {
    const region = renderBanner(notIndexable('demasiado_grande'));

    expect(region.textContent).toContain('Este archivo es demasiado grande para indexarlo.');
    expect(region.textContent).toContain('Se busca solo por nombre');
  });

  it('CA-12, CA-13: `fallido` con permiso muestra «Reintentar»', () => {
    const region = renderBanner(FAILED);

    expect(region.textContent).toContain('No pudimos indexar este archivo.');
    expect(region.textContent).toContain('Reintenta ahora o inténtalo más tarde.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('CA-13, CA-19: sin `canRetry` (lector) no hay «Reintentar» y explica quién puede', () => {
    const region = renderBanner({ ...FAILED, canRetry: false });

    expect(region.textContent).toContain('Solo quien puede editarlo puede reintentarlo.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('CA-13: mientras responde, «Reintentando…» deshabilitado y anunciado; no reintenta dos veces', async () => {
    const run = jest.fn(() => Promise.resolve(true));
    renderBanner(FAILED, retryControl({ pending: true, run }));

    const button = screen.getByRole('button', { name: 'Reintentando…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Reintentando la indexación…')).toBeTruthy();
    await userEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it('CA-13: tras reintentar con éxito, el foco pasa al aviso y no se pierde', async () => {
    const run = jest.fn(() => Promise.resolve(true));
    const region = renderBanner(FAILED, retryControl({ run }));

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(region);
  });

  it('CA-13: si el reintento falla lo dice y «Reintentar» sigue disponible', () => {
    const region = renderBanner(FAILED, retryControl({ failed: true }));

    expect(region.textContent).toContain('No pudimos reintentar la indexación.');
    expect(region.textContent).toContain('Tu archivo no cambió.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it.each([
    ['indexado', indexingStatus()],
    ['tipo que no se indexa', NOT_INDEXED_TYPE],
    ['sin estado leído', null],
  ] as const)('CA-14: %s: el contenedor en vivo existe vacío', (_, status) => {
    expect(renderBanner(status).textContent).toBe('');
  });

  it.each([360, 1440])('sin violaciones de axe a %i px', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    renderBanner(FAILED);
    expect((await act(async () => axe(document.body))).violations).toEqual([]);
    cleanup();

    renderBanner(INDEXING);
    expect((await act(async () => axe(document.body))).violations).toEqual([]);
  });
});
