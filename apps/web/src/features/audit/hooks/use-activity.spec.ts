/**
 * @jest-environment jsdom
 */
import {
  listAuditEventsResponseSchema,
  type AuditEventResponse,
  type ListAuditEventsQuery,
  type ListAuditEventsResponse,
} from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { ApiClientError } from '../../../lib/api-error';

import { useActivity, type LoadActivity } from './use-activity';

function auditEvent(n: number): AuditEventResponse {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    occurredAt: '2026-10-05T15:15:00.000Z',
    action: 'file.upload_completed',
    origin: 'self',
    actorRole: 'CLIENT',
    resourceType: 'file',
    itemCount: null,
    sizeBytes: 1_024,
  };
}

/** Respuesta simulada validada con el esquema de `contracts` (la API, PR-A, aún no está). */
function page(ns: readonly number[], nextCursor: string | null): ListAuditEventsResponse {
  return listAuditEventsResponseSchema.parse({ items: ns.map(auditEvent), nextCursor });
}

interface Deferred {
  readonly resolve: (response: ListAuditEventsResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly query: ListAuditEventsQuery;
}

/** Cada llamada queda pendiente hasta que la prueba la resuelve. */
function deferredLoader(): {
  readonly load: jest.MockedFunction<LoadActivity>;
  readonly calls: Deferred[];
} {
  const calls: Deferred[] = [];
  const load = jest.fn<ReturnType<LoadActivity>, Parameters<LoadActivity>>(
    (query) =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject, query });
      }),
  );
  return { load, calls };
}

async function settle(
  call: Deferred | undefined,
  response: ListAuditEventsResponse,
): Promise<void> {
  await act(async () => call?.resolve(response));
}

async function fail(call: Deferred | undefined, error: unknown): Promise<void> {
  await act(async () => call?.reject(error));
}

type Listing = ReturnType<typeof useActivity>['listing'];

function itemIds(listing: Listing): readonly string[] {
  return listing.status === 'data' ? listing.items.map((item) => item.id) : [];
}

/** Medianoche local del día dado, como instante UTC. */
function localMidnight(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toISOString();
}

describe('useActivity: datos de «Mi actividad» (004 CA-7, CA-9 a CA-11, CA-15)', () => {
  it('CA-7: arranca cargando y sin filtros pide la primera página sin parámetros', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));

    expect(result.current.listing.status).toBe('loading');
    expect(calls[0]?.query).toEqual({});
    await settle(calls[0], page([1, 2], null));

    expect(itemIds(result.current.listing)).toEqual([auditEvent(1).id, auditEvent(2).id]);
    expect(result.current).toMatchObject({ hasMore: false, hasFilters: false, more: 'idle' });
  });

  it('CA-11: sin eventos y sin filtros el estado es «empty»', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));

    await settle(calls[0], page([], null));

    expect(result.current.listing.status).toBe('empty');
  });

  it('CA-10: con filtros y sin resultados el estado es «filteredEmpty», distinto del vacío', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], null));

    act(() => result.current.changeFilters({ origin: 'staff' }));

    expect(result.current.listing.status).toBe('loading');
    expect(calls[1]?.query).toEqual({ origin: 'staff' });
    await settle(calls[1], page([], null));
    expect(result.current.listing.status).toBe('filteredEmpty');
    expect(result.current.hasFilters).toBe(true);
  });

  it('CA-10: los días locales «Desde» y «Hasta» se piden como instantes UTC, «Hasta» incluido', () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));

    act(() => result.current.changeFilters({ fromDay: '2026-09-30', toDay: '2026-10-05' }));

    expect(calls.at(-1)?.query).toEqual({
      from: localMidnight(2026, 8, 30),
      to: localMidnight(2026, 9, 6),
    });
    expect(new Date(calls.at(-1)?.query.from ?? '').getHours()).toBe(0);
  });

  it('CA-10: «Desde» y «Hasta» el mismo día es un rango válido de un día', () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));

    act(() => result.current.changeFilters({ fromDay: '2026-10-05', toDay: '2026-10-05' }));

    expect(result.current.invalidRange).toBe(false);
    expect(calls.at(-1)?.query).toEqual({
      from: localMidnight(2026, 9, 5),
      to: localMidnight(2026, 9, 6),
    });
  });

  it('CA-10: un rango inválido no consulta y conserva lo visible', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], null));

    act(() => result.current.changeFilters({ fromDay: '2026-10-05', toDay: '2026-10-01' }));

    expect(result.current.invalidRange).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(itemIds(result.current.listing)).toEqual([auditEvent(1).id]);
    expect(result.current.filters).toEqual({
      origin: 'all',
      fromDay: '2026-10-05',
      toDay: '2026-10-01',
    });
  });

  it('CA-10: «Limpiar filtros» vuelve a la consulta sin parámetros', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], null));
    act(() => result.current.changeFilters({ origin: 'self', fromDay: '2026-10-01' }));

    act(() => result.current.clearFilters());

    expect(calls.at(-1)?.query).toEqual({});
    expect(result.current).toMatchObject({ hasFilters: false, invalidRange: false });
  });

  it('CA-9: «Cargar más» acumula la página siguiente con el cursor y los mismos filtros', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    act(() => result.current.changeFilters({ origin: 'self' }));
    await settle(calls[1], page([1, 2], 'c-2'));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());

    expect(result.current.more).toBe('loading');
    expect(calls[2]?.query).toEqual({ origin: 'self', cursor: 'c-2' });
    await settle(calls[2], page([3], null));
    expect(itemIds(result.current.listing)).toEqual([1, 2, 3].map((n) => auditEvent(n).id));
    expect(result.current).toMatchObject({ more: 'idle', hasMore: false });
  });

  it('CA-9: mientras pide la página siguiente, otro «Cargar más» no pide nada', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], 'c-2'));

    act(() => result.current.loadMore());
    act(() => result.current.loadMore());

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('CA-15: si falla «Cargar más» lo visible se conserva y volver a pulsarlo reintenta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], 'c-2'));
    act(() => result.current.loadMore());

    await fail(calls[1], new Error('red'));

    expect(result.current.more).toBe('error');
    expect(itemIds(result.current.listing)).toEqual([auditEvent(1).id]);
    act(() => result.current.loadMore());
    expect(calls[2]?.query).toEqual({ cursor: 'c-2' });
  });

  it('CA-15: un error de carga expone el correlationId y «Reintentar» vuelve a cargar', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    const error = new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: 'x',
      correlationId: 'corr-1',
    });

    await fail(calls[0], error);
    expect(result.current.listing).toEqual({ status: 'error', correlationId: 'corr-1' });

    act(() => result.current.retry());
    expect(result.current.listing.status).toBe('loading');
    await settle(calls[1], page([1], null));
    expect(result.current.listing.status).toBe('data');
  });

  it('CA-10: la respuesta de un filtro anterior que llega tarde se descarta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));

    act(() => result.current.changeFilters({ origin: 'staff' }));
    await settle(calls[1], page([2], null));
    await settle(calls[0], page([1], null));

    expect(itemIds(result.current.listing)).toEqual([auditEvent(2).id]);
  });

  it('CA-9: una página siguiente de un filtro anterior no se agrega al nuevo', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderHook(() => useActivity(load));
    await settle(calls[0], page([1], 'c-2'));

    act(() => result.current.loadMore());
    act(() => result.current.changeFilters({ origin: 'self' }));
    await settle(calls[2], page([5], null));
    await settle(calls[1], page([2], null));

    expect(itemIds(result.current.listing)).toEqual([auditEvent(5).id]);
    expect(result.current.more).toBe('idle');
  });
});
