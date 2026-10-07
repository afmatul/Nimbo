/**
 * @jest-environment jsdom
 */
import type { SpaceSummaryResponse } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SpaceApi } from '../space-api';
import { GB, spaceSummaryWith } from '../test-space-summary';

import { SpaceProvider, useSpace } from './space-provider';

interface Deferred {
  readonly promise: Promise<SpaceSummaryResponse>;
  readonly resolve: (summary: SpaceSummaryResponse) => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve: Deferred['resolve'] = () => undefined;
  let reject: Deferred['reject'] = () => undefined;
  const promise = new Promise<SpaceSummaryResponse>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Muestra el estado del resumen y expone `refresh()` con un botón. */
function Probe(): React.JSX.Element {
  const { state, refresh } = useSpace();
  const label =
    state.status === 'ready' ? `listo ${String(state.summary.usedBytes)}` : state.status;
  return (
    <>
      <output>{label}</output>
      <button type="button" onClick={refresh}>
        Refrescar
      </button>
    </>
  );
}

function fakeApi(...responses: Promise<SpaceSummaryResponse>[]): jest.Mocked<SpaceApi> {
  const spaceSummary = jest.fn<Promise<SpaceSummaryResponse>, []>();
  responses.forEach((response) => spaceSummary.mockReturnValueOnce(response));
  return { spaceSummary };
}

function renderProvider(api: SpaceApi, uploadedCount = 0): ReturnType<typeof render> {
  return render(
    <SpaceProvider api={api} uploadedCount={uploadedCount}>
      <Probe />
    </SpaceProvider>,
  );
}

function shown(): string {
  return screen.getByRole('status').textContent ?? '';
}

describe('SpaceProvider (CA-4, CA-8, D-15, D-16)', () => {
  it('D-15: una sola lectura compartida; mientras llega muestra «cargando» y luego el resumen', async () => {
    const first = deferred();
    const api = fakeApi(first.promise);
    render(
      <SpaceProvider api={api} uploadedCount={0}>
        <Probe />
        <Probe />
      </SpaceProvider>,
    );

    expect(screen.getAllByRole('status').map((node) => node.textContent)).toEqual([
      'loading',
      'loading',
    ]);
    await act(async () => first.resolve(spaceSummaryWith(4.8 * GB)));

    expect(api.spaceSummary).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('status')[0]?.textContent).toBe(`listo ${String(4.8 * GB)}`);
  });

  it('CA-8: si falla queda en «error» y refresh() vuelve a «cargando» hasta la respuesta', async () => {
    const retry = deferred();
    const api = fakeApi(Promise.reject(new TypeError('Failed to fetch')), retry.promise);
    renderProvider(api);
    await act(async () => undefined);
    expect(shown()).toBe('error');

    await userEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(shown()).toBe('loading');
    await act(async () => retry.resolve(spaceSummaryWith(GB)));

    expect(shown()).toBe(`listo ${String(GB)}`);
  });

  it('CA-4: refresh() conserva la cifra visible mientras llega la nueva', async () => {
    const second = deferred();
    const api = fakeApi(Promise.resolve(spaceSummaryWith(2 * GB)), second.promise);
    renderProvider(api);
    await act(async () => undefined);

    await userEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(shown()).toBe(`listo ${String(2 * GB)}`);
    await act(async () => second.resolve(spaceSummaryWith(3 * GB)));

    expect(shown()).toBe(`listo ${String(3 * GB)}`);
  });

  it('CA-4: completar una carga vuelve a pedir el resumen; el montaje no lo pide dos veces', async () => {
    const api = fakeApi(
      Promise.resolve(spaceSummaryWith(2 * GB)),
      Promise.resolve(spaceSummaryWith(2.5 * GB)),
    );
    const { rerender } = renderProvider(api);
    await act(async () => undefined);
    expect(api.spaceSummary).toHaveBeenCalledTimes(1);

    rerender(
      <SpaceProvider api={api} uploadedCount={1}>
        <Probe />
      </SpaceProvider>,
    );
    await act(async () => undefined);

    expect(api.spaceSummary).toHaveBeenCalledTimes(2);
    expect(shown()).toBe(`listo ${String(2.5 * GB)}`);
  });

  it('CA-4: una respuesta vieja que llega tarde no pisa la más reciente', async () => {
    const stale = deferred();
    const api = fakeApi(stale.promise, Promise.resolve(spaceSummaryWith(3 * GB)));
    renderProvider(api);

    await userEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    await act(async () => stale.resolve(spaceSummaryWith(GB)));

    expect(shown()).toBe(`listo ${String(3 * GB)}`);
  });

  it('useSpace fuera del proveedor avisa del error de uso', () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useSpace debe usarse dentro de <SpaceProvider>.');
    quiet.mockRestore();
  });
});
