/**
 * @jest-environment jsdom
 */
import type { SearchResponse } from '@nimbo/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { SessionProvider } from '../identity/session/session-provider';
import { SpaceProvider } from '../storage/components/space-provider';
import { GB, spaceSummaryWith } from '../storage/test-space-summary';

import { SearchView } from './components/search-view';
import { fileHit, folderHit, searchPage } from './test-search-hit';

const VIEWPORTS = [360, 1440] as const;
/** Como en `audit/a11y.spec.tsx`: las violaciones que bloquean. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

async function renderSearch(search: string, respond: () => Promise<SearchResponse>): Promise<void> {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceProvider
        api={{ spaceSummary: () => Promise.resolve(spaceSummaryWith(3 * GB)) }}
        uploadedCount={0}
      >
        <SearchView load={respond} location={{ search, navigate: () => undefined }} />
      </SpaceProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    const results = await act(async () => axe(document.body));
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
    expect({ width, violations: blocking }).toEqual({ width, violations: [] });
  }
}

const RESULTS = searchPage([folderHit(1, 'Camiones'), fileHit(2, 'Camión_Ventas.docx')], 'c-2');

describe('Accesibilidad de la búsqueda (018 CA-11)', () => {
  beforeAll(() => {
    document.documentElement.lang = 'es';
    document.title = 'Buscar · Nimbo';
  });

  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  it('CA-11: la entrada, sin violaciones de axe a 360 y 1440 px', async () => {
    await renderSearch('', () => new Promise(() => undefined));

    await expectNoBlockingViolations();
  });

  it('CA-11: resultados con filtros abiertos, sin violaciones a 360 y 1440 px', async () => {
    await renderSearch('q=camion&fecha=rango&desde=2026-10-01', () => Promise.resolve(RESULTS));
    fireEvent.click(screen.getByRole('button', { name: 'Filtros, 1 activo' }));

    await expectNoBlockingViolations();
  });

  it('CA-11: rango inválido sin lista previa, sin violaciones a 360 y 1440 px', async () => {
    await renderSearch(
      'q=camion&tipo=documents&fecha=rango&desde=2026-10-20&hasta=2026-10-01',
      () => Promise.resolve(RESULTS),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Filtros, 2 activos' }));

    await expectNoBlockingViolations();
  });

  it('018b CA-8: resultados con la marca de contenido y la nota de alcance, sin violaciones a 360 y 1440 px', async () => {
    const byContent = searchPage([
      folderHit(1, 'Camiones'),
      fileHit(2, 'Camión_Ventas.docx'),
      { ...fileHit(3, 'Acta.docx'), matchedBy: 'content' },
    ]);
    await renderSearch('q=camion', () => Promise.resolve(byContent));

    expect(screen.getByText('Coincide en el contenido')).toBeTruthy();
    await expectNoBlockingViolations();
  });

  it.each<[string, () => Promise<SearchResponse>]>([
    ['cargando', () => new Promise(() => undefined)],
    ['sin resultados', () => Promise.resolve(searchPage([]))],
    ['error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('CA-11: %s, sin violaciones a 360 y 1440 px', async (_state, respond) => {
    await renderSearch('q=camion&tipo=other', respond);

    await expectNoBlockingViolations();
  });
});
