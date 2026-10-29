/**
 * @jest-environment jsdom
 */
import { formatBytes, type SearchResponse } from '@nimbo/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { dayLabel } from '../../../lib/format-date';
import { SessionProvider } from '../../identity/session/session-provider';
import { SpaceProvider } from '../../storage/components/space-provider';
import { fileDetailPath, folderPath } from '../../storage/routes';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import { fileHit, folderHit, LOGISTICA, searchPage } from '../test-search-hit';
import type { LoadSearch, SearchRequest } from '../use-search';

import { SearchView } from './search-view';

type LoadMock = jest.Mock<Promise<SearchResponse>, [SearchRequest]>;

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

/** Responde en orden: cada página o error una vez; después, nunca. */
function loadOf(...pages: readonly (SearchResponse | Error)[]): LoadMock {
  const load: LoadMock = jest.fn((_request: SearchRequest) => never());
  for (const page of pages) {
    load.mockImplementationOnce(() =>
      page instanceof Error ? Promise.reject(page) : Promise.resolve(page),
    );
  }
  return load;
}

/** La dirección de la página en memoria: `navigate` la cambia como `router.push`. */
function Harness({
  initial,
  load,
  navigate,
}: {
  readonly initial: string;
  readonly load: LoadSearch;
  readonly navigate: (search: string) => void;
}): React.JSX.Element {
  const [search, setSearch] = React.useState(initial);
  const location = {
    search,
    navigate: (next: string) => {
      navigate(next);
      setSearch(next);
    },
  };
  return <SearchView load={load} location={location} />;
}

async function renderView(initial: string, load: LoadSearch): Promise<jest.Mock> {
  const navigate = jest.fn();
  const spaceSummary = jest.fn(() => Promise.resolve(spaceSummaryWith(3 * GB)));
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceProvider api={{ spaceSummary }} uploadedCount={0}>
        <Harness initial={initial} load={load} navigate={navigate} />
      </SpaceProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return navigate;
}

const searchField = (): HTMLInputElement =>
  screen.getByRole('searchbox', { name: 'Nombre del archivo o carpeta' });

const results = (): HTMLElement => screen.getByRole('table', { name: /Resultados para/ });

describe('SearchView: pantalla /buscar (018 CA-2, CA-6, CA-9 a CA-12)', () => {
  it('CA-12: al entrar el foco va al campo y se ve la invitación, sin filtros ni lista', async () => {
    const load = loadOf();
    await renderView('', load);

    expect(document.activeElement).toBe(searchField());
    expect(screen.getByRole('heading', { level: 1, name: 'Buscar' })).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByText('Escribe qué quieres buscar.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Filtros' })).toBeNull();
    expect(searchField().maxLength).toBe(255);
    expect(load).not.toHaveBeenCalled();
  });

  it('CA-6: enviar solo espacios no busca y devuelve el foco al campo', async () => {
    const load = loadOf();
    const navigate = await renderView('', load);
    const user = userEvent.setup();

    await user.type(searchField(), '   ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(navigate).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(searchField());
    expect(screen.getByText('Escribe qué quieres buscar.')).toBeTruthy();
  });

  it('CA-12: enviar el texto lo lleva a la dirección y busca', async () => {
    const load = loadOf(searchPage([fileHit(2)]));
    const navigate = await renderView('', load);
    const user = userEvent.setup();

    await user.type(searchField(), 'informe camion{Enter}');

    expect(navigate).toHaveBeenCalledWith('q=informe+camion');
    expect(load).toHaveBeenCalledWith({ q: 'informe camion' });
    expect(
      await screen.findByRole('heading', { name: 'Resultados para «informe camion»' }),
    ).toBeTruthy();
  });

  it('CA-6: «Borrar el texto» vacía el campo y deja el foco en él', async () => {
    await renderView('q=camion', loadOf(searchPage([fileHit(2)])));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Borrar el texto' }));

    expect(searchField().value).toBe('');
    expect(document.activeElement).toBe(searchField());
  });

  it('CA-2, CA-10: carpetas y archivos con ubicación, tamaño y fecha es-GT; cada uno abre lo suyo', async () => {
    const folder = folderHit(1, 'Camiones');
    const file = fileHit(2, 'Camión_Ventas.docx');
    await renderView('q=camion', loadOf(searchPage([folder, file])));

    const rows = within(results()).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('link')[0]?.textContent)).toEqual([
      'Camiones',
      'Camión_Ventas.docx',
    ]);
    const [folderRow, fileRow] = rows as [HTMLElement, HTMLElement];
    expect(within(folderRow).getByRole('link', { name: 'Camiones' }).getAttribute('href')).toBe(
      folderPath(folder.id),
    );
    expect(
      within(fileRow).getByRole('link', { name: 'Camión_Ventas.docx' }).getAttribute('href'),
    ).toBe(fileDetailPath(file.id));
    expect(
      within(folderRow).getAllByRole('link', { name: LOGISTICA.name })[0]?.getAttribute('href'),
    ).toBe(folderPath(LOGISTICA.id));
    expect(
      within(fileRow).getAllByRole('link', { name: 'Mis archivos' })[0]?.getAttribute('href'),
    ).toBe('/archivos');
    expect(within(fileRow).getAllByText(formatBytes(file.sizeBytes)).length).toBeGreaterThan(0);
    expect(within(fileRow).getAllByText(dayLabel(file.updatedAt)).length).toBeGreaterThan(0);
    expect(dayLabel(file.updatedAt)).toBe('20 oct 2026');
    expect(screen.queryByText(/coincidencias/)).toBeNull();
  });

  it('CA-11: mientras busca se anuncia «Buscando «texto»…»', async () => {
    await renderView('q=camion', loadOf());

    expect(screen.getByText('Buscando «camion»…').closest('[role="status"]')).not.toBeNull();
  });

  it('CA-11: ante un error, «Reintentar» repite la búsqueda', async () => {
    const load = loadOf(new TypeError('Failed to fetch'), searchPage([fileHit(2)]));
    await renderView('q=camion', load);

    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('No pudimos buscar.')).toBeTruthy();
    expect(within(alert).getByText('Revisa tu conexión y vuelve a intentarlo.')).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(2);
    expect(results()).toBeTruthy();
  });

  it('CA-11: sin resultados y con filtros ofrece «Quitar filtros», que deja solo el texto', async () => {
    const navigate = await renderView('q=camion&tipo=other', loadOf(searchPage([])));

    expect(screen.getByRole('heading', { name: 'No encontramos nada con «camion».' })).toBeTruthy();
    expect(screen.getByText('Revisa lo que escribiste o quita los filtros.')).toBeTruthy();
    const actions = screen.getAllByRole('button', { name: 'Quitar filtros' });
    fireEvent.click(actions[actions.length - 1] as HTMLElement);

    expect(navigate).toHaveBeenLastCalledWith('q=camion');
  });

  it('CA-11: sin resultados y sin filtros no ofrece acción', async () => {
    await renderView('q=camion', loadOf(searchPage([])));

    expect(screen.getByRole('heading', { name: 'No encontramos nada con «camion».' })).toBeTruthy();
    expect(screen.getByText('Revisa lo que escribiste.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull();
  });

  it('CA-7: elegir un tipo vuelve a buscar y explica que las carpetas no aparecen', async () => {
    const load = loadOf(searchPage([fileHit(2)]), searchPage([fileHit(2)]));
    const navigate = await renderView('q=camion', load);

    fireEvent.click(screen.getByRole('radio', { name: 'Documentos' }));
    await act(async () => undefined);

    expect(navigate).toHaveBeenLastCalledWith('q=camion&tipo=documents');
    expect(load).toHaveBeenLastCalledWith({ q: 'camion', type: 'documents' });
    expect(screen.getByText(/Con un tipo elegido solo ves archivos/)).toBeTruthy();
  });

  it('CA-8: «Rango personalizado» muestra «Desde» y «Hasta»; los atajos no', async () => {
    const navigate = await renderView('q=camion', loadOf(searchPage([fileHit(2)])));
    expect(screen.queryByLabelText('Desde')).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Modificado' }), {
      target: { value: 'rango' },
    });

    expect(navigate).toHaveBeenLastCalledWith('q=camion&fecha=rango');
    expect(screen.getByLabelText('Desde')).toBeTruthy();
    expect(screen.getByLabelText('Hasta')).toBeTruthy();
  });

  it('CA-9: con un rango inválido avisa junto a los campos, que siguen editables, y atenúa la lista anterior', async () => {
    const load = loadOf(searchPage([fileHit(2)]));
    await renderView('q=camion&fecha=rango&desde=2026-10-20', load);
    expect(results()).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });

    expect(screen.getByRole('alert').textContent).toBe(
      'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para buscar.',
    );
    for (const label of ['Desde', 'Hasta']) {
      const field = screen.getByLabelText(label) as HTMLInputElement;
      expect(field.disabled).toBe(false);
      expect(field.getAttribute('aria-invalid')).toBe('true');
    }
    const stale = screen.getByTestId('resultados-desactualizados');
    expect(stale.hasAttribute('inert')).toBe(true);
    expect(stale.className).toContain('opacity-');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('CA-11: a 360 px los filtros van plegados, con el número de filtros activos', async () => {
    await renderView(
      'q=camion&tipo=documents&fecha=ultimos-7-dias',
      loadOf(searchPage([fileHit(2)])),
    );

    const toggle = screen.getByRole('button', { name: 'Filtros, 2 activos' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.className).toContain('sm:hidden');
    expect(panel?.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(panel?.className).toContain('sm:block');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('CA-3: «Cargar más» suma la página siguiente y, si falla, ofrece «Reintentar»', async () => {
    const load = loadOf(searchPage([fileHit(1)], 'c-2'), new TypeError('Failed to fetch'));
    await renderView('q=camion', load);

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await act(async () => undefined);

    expect(load).toHaveBeenLastCalledWith({ q: 'camion', cursor: 'c-2' });
    expect(screen.getByText('No pudimos cargar más elementos.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(within(results()).getAllByRole('row')).toHaveLength(2);
  });

  it('CA-3: mientras carga más, el botón dice «Cargando más…» y la lista se conserva', async () => {
    await renderView('q=camion', loadOf(searchPage([fileHit(1)], 'c-2')));

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(
      screen.getByRole('button', { name: 'Cargando más…' }).getAttribute('aria-disabled'),
    ).toBe('true');
    expect(within(results()).getAllByRole('row')).toHaveLength(2);
  });
});
