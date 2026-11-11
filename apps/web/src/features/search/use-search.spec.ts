/**
 * @jest-environment jsdom
 */
import type { SearchResponse } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { createStorageHttp } from '../storage/storage-http';

import { fileHit, folderHit, searchPage } from './test-search-hit';
import {
  fetchSearchPage,
  useSearch,
  type LoadSearch,
  type SearchLocation,
  type SearchRequest,
} from './use-search';

interface Deferred {
  readonly resolve: (response: SearchResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly request: SearchRequest;
}

/** Cada llamada queda pendiente hasta que la prueba la resuelve. */
function deferredLoader(): {
  readonly load: jest.MockedFunction<LoadSearch>;
  readonly calls: Deferred[];
} {
  const calls: Deferred[] = [];
  const load = jest.fn<ReturnType<LoadSearch>, Parameters<LoadSearch>>(
    (request) =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject, request });
      }),
  );
  return { load, calls };
}

/** La dirección de la página: `navigate` la cambia y vuelve a pintar, como `router.push`. */
function renderSearch(initial: string, load: LoadSearch) {
  const navigate = jest.fn<
    ReturnType<SearchLocation['navigate']>,
    Parameters<SearchLocation['navigate']>
  >();
  const hook = renderHook(
    ({ search }: { search: string }) => useSearch(load, { search, navigate }),
    {
      initialProps: { search: initial },
    },
  );
  navigate.mockImplementation((search) => hook.rerender({ search }));
  return { ...hook, navigate };
}

async function settle(call: Deferred | undefined, response: SearchResponse): Promise<void> {
  await act(async () => call?.resolve(response));
}

async function fail(call: Deferred | undefined): Promise<void> {
  await act(async () => call?.reject(new TypeError('Failed to fetch')));
}

type Listing = ReturnType<typeof useSearch>['listing'];

const idsOf = (listing: Listing): readonly string[] =>
  listing.status === 'data' ? listing.items.map((item) => item.id) : [];

/** Medianoche local del día dado, como instante UTC. */
const localMidnight = (year: number, monthIndex: number, day: number): string =>
  new Date(year, monthIndex, day).toISOString();

describe('useSearch: estado en la dirección y páginas de la búsqueda (018 CA-3, CA-6, CA-8, CA-9, CA-12)', () => {
  it('CA-6: sin texto en la dirección no consulta y queda en la entrada', () => {
    const { load } = deferredLoader();
    const { result } = renderSearch('', load);

    expect(result.current.listing.status).toBe('idle');
    expect(result.current.q).toBe('');
    expect(load).not.toHaveBeenCalled();
  });

  it('CA-6: enviar vacío o solo espacios no busca ni cambia la dirección', () => {
    const { load } = deferredLoader();
    const { result, navigate } = renderSearch('', load);

    let accepted = true;
    act(() => {
      accepted = result.current.submit('   ');
    });

    expect(accepted).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('CA-12: enviar el texto lo guarda recortado en la dirección y consulta', async () => {
    const { load, calls } = deferredLoader();
    const { result, navigate } = renderSearch('', load);

    act(() => {
      result.current.submit('  informe camion ');
    });

    expect(navigate).toHaveBeenCalledWith('q=informe+camion');
    expect(result.current.listing.status).toBe('loading');
    expect(calls[0]?.request).toEqual({ q: 'informe camion' });
    await settle(calls[0], searchPage([folderHit(1), fileHit(2)]));
    expect(idsOf(result.current.listing)).toEqual([folderHit(1).id, fileHit(2).id]);
  });

  it('CA-12: al recargar o volver atrás, la dirección repite la búsqueda con sus filtros', () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch(
      'q=camion&tipo=documents&fecha=rango&desde=2026-09-30&hasta=2026-10-05',
      load,
    );

    expect(result.current.q).toBe('camion');
    expect(result.current.filters).toEqual({
      type: 'documents',
      date: 'rango',
      fromDay: '2026-09-30',
      toDay: '2026-10-05',
    });
    expect(calls[0]?.request).toEqual({
      q: 'camion',
      type: 'documents',
      from: localMidnight(2026, 8, 30),
      to: localMidnight(2026, 9, 6),
    });
  });

  it('CA-12: valores desconocidos en la dirección se leen como sin filtro', () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion&tipo=videos&fecha=ayer&desde=30-09-2026', load);

    expect(result.current.filters).toEqual({
      type: 'all',
      date: 'cualquiera',
      fromDay: '',
      toDay: '',
    });
    expect(calls[0]?.request).toEqual({ q: 'camion' });
  });

  it('CA-8: un mismo día en «Desde» y «Hasta» abarca ese día entero', () => {
    const { load, calls } = deferredLoader();
    renderSearch('q=camion&fecha=rango&desde=2026-10-05&hasta=2026-10-05', load);

    expect(calls[0]?.request).toEqual({
      q: 'camion',
      from: localMidnight(2026, 9, 5),
      to: localMidnight(2026, 9, 6),
    });
  });

  it('CA-8: solo «Desde» o solo «Hasta» acota un extremo', () => {
    const { load, calls } = deferredLoader();
    const { navigate, result } = renderSearch('q=camion&fecha=rango&desde=2026-10-05', load);
    expect(calls[0]?.request).toEqual({ q: 'camion', from: localMidnight(2026, 9, 5) });

    act(() => result.current.changeFilters({ fromDay: '', toDay: '2026-10-05' }));

    expect(navigate).toHaveBeenLastCalledWith('q=camion&fecha=rango&hasta=2026-10-05');
    expect(calls[1]?.request).toEqual({ q: 'camion', to: localMidnight(2026, 9, 6) });
  });

  describe('CA-8: cada atajo de fecha equivale a su rango de días locales', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date(2026, 9, 28, 15, 30),
        doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'queueMicrotask'],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      ['ultimos-7-dias', localMidnight(2026, 9, 22)],
      ['ultimos-30-dias', localMidnight(2026, 8, 29)],
      ['este-anio', localMidnight(2026, 0, 1)],
    ])('«%s» va del inicio de su primer día al inicio de mañana', (date, from) => {
      const { load, calls } = deferredLoader();
      renderSearch(`q=camion&fecha=${date}`, load);

      expect(calls[0]?.request).toEqual({ q: 'camion', from, to: localMidnight(2026, 9, 29) });
    });

    it('«Cualquier fecha» no acota y no viaja en la dirección', () => {
      const { load, calls } = deferredLoader();
      const { result, navigate } = renderSearch('q=camion&fecha=ultimos-7-dias', load);

      act(() => result.current.changeFilters({ date: 'cualquiera' }));

      expect(navigate).toHaveBeenLastCalledWith('q=camion');
      expect(calls.at(-1)?.request).toEqual({ q: 'camion' });
    });

    it('un atajo ignora los días de un rango anterior', () => {
      const { load, calls } = deferredLoader();
      const { result, navigate } = renderSearch(
        'q=camion&fecha=rango&desde=2026-10-01&hasta=2026-10-05',
        load,
      );

      act(() => result.current.changeFilters({ date: 'este-anio' }));

      expect(navigate).toHaveBeenLastCalledWith('q=camion&fecha=este-anio');
      expect(calls.at(-1)?.request.from).toBe(localMidnight(2026, 0, 1));
    });
  });

  it('CA-7: cambiar el tipo consulta de nuevo con el mismo texto', () => {
    const { load, calls } = deferredLoader();
    const { result, navigate } = renderSearch('q=camion', load);

    act(() => result.current.changeFilters({ type: 'images' }));

    expect(navigate).toHaveBeenLastCalledWith('q=camion&tipo=images');
    expect(result.current.listing.status).toBe('loading');
    expect(calls[1]?.request).toEqual({ q: 'camion', type: 'images' });
  });

  it('CA-9: un rango inválido no consulta y conserva la lista anterior, marcada como desactualizada', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion', load);
    await settle(calls[0], searchPage([fileHit(1)]));

    act(() =>
      result.current.changeFilters({ date: 'rango', fromDay: '2026-10-20', toDay: '2026-10-01' }),
    );

    expect(result.current.invalidRange).toBe(true);
    expect(result.current.stale).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(idsOf(result.current.listing)).toEqual([fileHit(1).id]);
    expect(result.current.filters).toMatchObject({ fromDay: '2026-10-20', toDay: '2026-10-01' });
  });

  it('CA-9: al corregir el rango vuelve a consultar y la lista deja de estar desactualizada', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion&fecha=rango&desde=2026-10-20&hasta=2026-10-01', load);
    expect(load).not.toHaveBeenCalled();

    act(() => result.current.changeFilters({ toDay: '2026-10-25' }));
    await settle(calls[0], searchPage([fileHit(1)]));

    expect(result.current).toMatchObject({ invalidRange: false, stale: false });
    expect(idsOf(result.current.listing)).toEqual([fileHit(1).id]);
  });

  it('CA-11: cuenta los filtros activos; un rango sin días no cuenta', () => {
    const { load } = deferredLoader();
    const cases: [string, number][] = [
      ['q=a', 0],
      ['q=a&tipo=documents', 1],
      ['q=a&tipo=other&fecha=ultimos-30-dias', 2],
      ['q=a&fecha=rango', 0],
      ['q=a&fecha=rango&hasta=2026-10-01', 1],
    ];
    for (const [search, count] of cases) {
      const { result } = renderSearch(search, load);
      expect({ search, count: result.current.activeFilters }).toEqual({ search, count });
    }
  });

  it('CA-11: «Quitar filtros» deja solo el texto', () => {
    const { load, calls } = deferredLoader();
    const { result, navigate } = renderSearch('q=camion&tipo=other&fecha=ultimos-7-dias', load);

    act(() => result.current.clearFilters());

    expect(navigate).toHaveBeenLastCalledWith('q=camion');
    expect(calls.at(-1)?.request).toEqual({ q: 'camion' });
    expect(result.current.activeFilters).toBe(0);
  });

  it('CA-11: sin coincidencias el estado es «empty»', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=zzz', load);

    await settle(calls[0], searchPage([]));

    expect(result.current.listing.status).toBe('empty');
  });

  it('CA-11: un error de carga se reintenta con la misma consulta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion', load);
    await fail(calls[0]);
    expect(result.current.listing.status).toBe('error');

    act(() => result.current.retry());

    expect(result.current.listing.status).toBe('loading');
    expect(calls[1]?.request).toEqual({ q: 'camion' });
  });

  it('CA-12: enviar el mismo texto vuelve a buscar sin repetir la dirección', () => {
    const { load, calls } = deferredLoader();
    const { result, navigate } = renderSearch('q=camion', load);

    act(() => {
      result.current.submit('camion');
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
  });

  it('CA-12: la respuesta de una búsqueda anterior se descarta', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion', load);
    act(() => {
      result.current.submit('informe');
    });

    await settle(calls[1], searchPage([fileHit(2)]));
    await settle(calls[0], searchPage([fileHit(1)]));

    expect(idsOf(result.current.listing)).toEqual([fileHit(2).id]);
  });

  it('CA-3: «Cargar más» suma la página siguiente con el cursor y los mismos filtros', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion&tipo=documents', load);
    await settle(calls[0], searchPage([fileHit(1), fileHit(2)], 'c-2'));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    act(() => result.current.loadMore());

    expect(result.current.more).toBe('loading');
    expect(load).toHaveBeenCalledTimes(2);
    expect(calls[1]?.request).toEqual({ q: 'camion', type: 'documents', cursor: 'c-2' });
    await settle(calls[1], searchPage([fileHit(3)]));
    expect(idsOf(result.current.listing)).toEqual([1, 2, 3].map((n) => fileHit(n).id));
    expect(result.current).toMatchObject({ more: 'idle', hasMore: false, added: 1 });
  });

  it('CA-3: si falla «Cargar más» la lista se conserva y se puede reintentar o descartar el aviso', async () => {
    const { load, calls } = deferredLoader();
    const { result } = renderSearch('q=camion', load);
    await settle(calls[0], searchPage([fileHit(1)], 'c-2'));
    act(() => result.current.loadMore());
    await fail(calls[1]);

    expect(result.current.more).toBe('error');
    expect(idsOf(result.current.listing)).toEqual([fileHit(1).id]);
    act(() => result.current.dismissMoreError());
    expect(result.current.more).toBe('idle');

    act(() => result.current.loadMore());
    expect(calls[2]?.request).toEqual({ q: 'camion', cursor: 'c-2' });
  });
});

describe('fetchSearchPage (018 plan §4)', () => {
  it('CA-8: pide GET /search con los parámetros presentes y valida la respuesta', async () => {
    const authFetch = jest.fn(() => Promise.resolve(searchPage([fileHit(1)])));
    const http = createStorageHttp('http://localhost/api/v1/', authFetch);

    const page = await fetchSearchPage(http, {
      q: 'informe camión',
      type: 'documents',
      to: '2026-10-06T06:00:00.000Z',
      cursor: 'c-2',
    });

    expect(page.items).toHaveLength(1);
    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost/api/v1/search?q=informe+cami%C3%B3n&type=documents&to=2026-10-06T06%3A00%3A00.000Z&cursor=c-2',
      { method: 'GET' },
    );
  });

  it('CA-11: una respuesta fuera del contrato se rechaza', async () => {
    const http = createStorageHttp('http://localhost/api/v1', () =>
      Promise.resolve({ items: 'x' }),
    );

    await expect(fetchSearchPage(http, { q: 'camion' })).rejects.toMatchObject({ status: 500 });
  });
});
