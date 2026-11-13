/**
 * @jest-environment jsdom
 */
import type { QuickAccessItem, QuickAccessList } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AppLayout } from '../../../components/nimbo/app-layout';
import { recordQuickAccessOpen, useQuickAccess } from '../hooks/use-quick-access';
import type { QuickAccessApi, QuickAccessNodeType } from '../quick-access-api';

import { QuickAccessSection } from './quick-access-section';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const VIEWPORTS = [360, 1440] as const;

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const folderItem = (n: number, name: string): QuickAccessItem => ({
  type: 'folder',
  id: uuid(n),
  name,
});
const fileItem = (n: number, name: string, kind: QuickAccessItem['kind']): QuickAccessItem => ({
  type: 'file',
  id: uuid(n),
  name,
  kind,
});

const PINNED: readonly QuickAccessItem[] = [
  folderItem(1, 'Proyecto Alpha'),
  fileItem(2, 'Propuesta_Nimbo_v3.docx', 'docx'),
  folderItem(3, 'Finanzas'),
  fileItem(4, 'Matriz_Requisitos_RF.xlsx', 'xlsx'),
  folderItem(5, 'Entregables'),
];
const RECENT: readonly QuickAccessItem[] = [
  folderItem(6, 'Fase 3 · RAG'),
  fileItem(7, 'Informe_avance_RAG.docx', 'docx'),
  fileItem(8, 'Informe_final_de_resultados_septiembre.docx', 'docx'),
];

function list(overrides: Partial<QuickAccessList> = {}): QuickAccessList {
  return { pinned: [...PINNED], recent: [...RECENT], hasMoreRecent: false, ...overrides };
}

/** API en memoria: quitar un fijado lo saca de la lista que devuelve `GET /quick-access`. */
function memoryApi(initial: QuickAccessList): jest.Mocked<QuickAccessApi> {
  let current = initial;
  return {
    quickAccess: jest.fn(() => Promise.resolve(current)),
    pin: jest.fn((_type: QuickAccessNodeType, _id: string) => new Promise<never>(() => undefined)),
    unpin: jest.fn((_type, id) => {
      current = { ...current, pinned: current.pinned.filter((item) => item.id !== id) };
      return Promise.resolve();
    }),
    recordRecent: jest.fn((_type: QuickAccessNodeType, _id: string) => Promise.resolve()),
  };
}

interface HarnessProps {
  readonly api: QuickAccessApi;
  readonly onOpenFile?: (item: QuickAccessItem) => void;
}

function Harness({ api, onOpenFile = jest.fn() }: HarnessProps): React.JSX.Element {
  const quickAccess = useQuickAccess(api, null, () => undefined);
  return (
    <main>
      <nav aria-label="Navegación principal">
        <a href="/archivos">Mis archivos</a>
        <QuickAccessSection quickAccess={quickAccess} onOpenFile={onOpenFile} />
      </nav>
    </main>
  );
}

async function renderSection(initial: QuickAccessList, props: Partial<HarnessProps> = {}) {
  const api = memoryApi(initial);
  render(<Harness api={api} {...props} />);
  await act(async () => undefined);
  return api;
}

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    const results = await act(async () => axe(document.body));
    const blocking = results.violations
      .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
      .map((violation) => violation.id);
    expect({ width, blocking }).toEqual({ width, blocking: [] });
  }
}

function group(name: 'Fijados' | 'Recientes'): HTMLElement {
  return screen.getByRole('list', { name: `Accesos rápidos ${name}` });
}

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

describe('Accesos rápidos de la barra lateral (006 CA-27, CA-28)', () => {
  it('CA-27 fijados-y-recientes: 5 fijados y 3 recientes, carpetas y archivos mezclados, sin desglose', async () => {
    await renderSection(list());

    expect(screen.getByText('Accesos rápidos')).toBeTruthy();
    expect(within(group('Fijados')).getAllByRole('listitem')).toHaveLength(5);
    expect(within(group('Recientes')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Proyecto Alpha, carpeta' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${uuid(1)}`,
    );
    expect(
      screen.getByRole('button', { name: 'Propuesta_Nimbo_v3.docx, archivo, se descarga' }),
    ).toBeTruthy();
    expect(document.querySelector('[aria-expanded="true"], [aria-controls^="fila"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver más/ })).toBeNull();
    await expectNoBlockingViolations();
  });

  it('CA-27: el nombre largo conserva la extensión visible y el nombre completo en title', async () => {
    await renderSection(list());

    const long = screen.getByRole('button', {
      name: 'Informe_final_de_resultados_septiembre.docx, archivo, se descarga',
    });
    expect(long.getAttribute('title')).toBe('Informe_final_de_resultados_septiembre.docx');
    expect(within(long).getByText('.docx')).toBeTruthy();
    expect(within(long).getByText('Informe_final_de_resultados_septiembre').className).toContain(
      'truncate',
    );
  });

  it('CA-27 solo-recientes: sin fijados no se dibuja el grupo «Fijados»', async () => {
    await renderSection(list({ pinned: [] }));

    expect(screen.queryByRole('list', { name: 'Accesos rápidos Fijados' })).toBeNull();
    expect(within(group('Recientes')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('CA-27 solo-fijados: sin recientes no se dibuja el grupo «Recientes»', async () => {
    await renderSection(list({ pinned: PINNED.slice(0, 3), recent: [] }));

    expect(screen.queryByRole('list', { name: 'Accesos rápidos Recientes' })).toBeNull();
    expect(within(group('Fijados')).getAllByRole('listitem')).toHaveLength(3);
  });

  it('CA-27 con-ver-mas: con más recientes que los visibles, «Ver más» lleva a Mis archivos', async () => {
    await renderSection(list({ hasMoreRecent: true }));

    expect(screen.getByRole('link', { name: 'Ver más en Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    await expectNoBlockingViolations();
  });

  it('CA-27 sin-accesos: sin fijados ni recientes la sección se oculta', async () => {
    await renderSection(list({ pinned: [], recent: [] }));

    expect(screen.queryByText('Accesos rápidos')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('CA-27: un archivo abierto en otra parte de la pestaña (vista previa, ficha) aparece primero en «Recientes»', async () => {
    const [first] = RECENT;
    if (first === undefined) throw new Error('Sin recientes de ejemplo');
    const api = await renderSection(list({ pinned: [], recent: [first] }));
    const opened = fileItem(9, 'Acta_reunion.docx', 'docx');
    const recordApi = {
      recordRecent: jest.fn(() => {
        api.quickAccess.mockResolvedValueOnce(list({ pinned: [], recent: [opened, first] }));
        return Promise.resolve();
      }),
    };

    await act(async () => recordQuickAccessOpen(recordApi, { type: 'file', id: opened.id }));

    expect(recordApi.recordRecent).toHaveBeenCalledWith('file', opened.id);
    const newest = within(group('Recientes')).getAllByRole('button')[0];
    expect(newest?.getAttribute('aria-label')).toBe('Acta_reunion.docx, archivo, se descarga');
  });

  it('mientras carga no dibuja nada; si falla, un aviso discreto con «Reintentar» vuelve a pedirla', async () => {
    const api = memoryApi(list());
    api.quickAccess.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<Harness api={api} />);
    expect(screen.queryByText('Accesos rápidos')).toBeNull();
    await act(async () => undefined);

    expect(screen.getByText('No pudimos cargar tus accesos rápidos.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar accesos rápidos' }));

    expect(await screen.findByRole('link', { name: 'Proyecto Alpha, carpeta' })).toBeTruthy();
  });

  it('CA-27: un archivo se descarga al activarlo (como en 005); una carpeta es un enlace a su página', async () => {
    const onOpenFile = jest.fn();
    await renderSection(list(), { onOpenFile });

    await userEvent.click(
      screen.getByRole('button', { name: 'Informe_avance_RAG.docx, archivo, se descarga' }),
    );

    expect(onOpenFile).toHaveBeenCalledWith(RECENT[1]);
  });

  it('CA-27: solo los fijados tienen menú ⋮, con un único ítem «Quitar de la barra lateral»', async () => {
    await renderSection(list());

    const triggers = screen.getAllByRole('button', { name: /^Acciones de / });
    expect(triggers).toHaveLength(5);
    expect(triggers[0]?.getAttribute('aria-haspopup')).toBe('menu');
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Finanzas' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Quitar de la barra lateral',
    ]);
    await expectNoBlockingViolations();
  });

  it('CA-27 teclado: Enter abre el ⋮ con el foco en «Quitar…» y Escape lo cierra y devuelve el foco', async () => {
    await renderSection(list());
    const trigger = screen.getByRole('button', { name: 'Acciones de Finanzas' });
    trigger.focus();

    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Quitar de la barra lateral' }),
    );
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('CA-27: al quitar un fijado sale de la lista, el foco pasa al siguiente y se anuncia', async () => {
    const api = await renderSection(list());
    screen.getByRole('button', { name: 'Acciones de Finanzas' }).focus();
    await userEvent.keyboard('{Enter}');

    await userEvent.keyboard('{Enter}');

    expect(api.unpin).toHaveBeenCalledWith('folder', uuid(3));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Matriz_Requisitos_RF.xlsx, archivo, se descarga' }),
      ),
    );
    expect(screen.queryByRole('link', { name: 'Finanzas, carpeta' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Finanzas ya no está en la barra lateral');
  });

  it('CA-27: al quitar el último fijado, el foco pasa al anterior', async () => {
    await renderSection(list());
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Entregables' }));

    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar de la barra lateral' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Matriz_Requisitos_RF.xlsx, archivo, se descarga' }),
      ),
    );
  });

  it('CA-27: en escritorio el ⋮ aparece con el puntero o el foco; sin puntero (hover: none) siempre', async () => {
    await renderSection(list());

    const trigger = screen.getByRole('button', { name: 'Acciones de Finanzas' });
    expect(trigger.className).toMatch(/\bopacity-0\b/);
    expect(trigger.className).toContain('group-hover:opacity-100');
    expect(trigger.className).toContain('group-focus-within:opacity-100');
    expect(trigger.className).toContain('hover-none:opacity-100');
  });
});

describe('Accesos rápidos en el cajón móvil (006 CA-27)', () => {
  function DrawerHarness({ api }: { readonly api: QuickAccessApi }): React.JSX.Element {
    const quickAccess = useQuickAccess(api, null, () => undefined);
    return (
      <AppLayout
        initialMobileMenuOpen
        sidebarSection={<QuickAccessSection quickAccess={quickAccess} onOpenFile={jest.fn()} />}
      >
        <h1>Mis archivos</h1>
      </AppLayout>
    );
  }

  async function renderDrawer(initial: QuickAccessList): Promise<HTMLElement> {
    render(<DrawerHarness api={memoryApi(initial)} />);
    await act(async () => undefined);
    return screen.getByRole('dialog', { name: 'Menú de navegación' });
  }

  it('CA-27 movil-cajon-con-accesos: la misma sección en el cajón, con ⋮ siempre visible de 44 px', async () => {
    const drawer = await renderDrawer(list({ hasMoreRecent: true }));

    expect(within(drawer).getByText('Accesos rápidos')).toBeTruthy();
    const trigger = within(drawer).getByRole('button', { name: 'Acciones de Finanzas' });
    expect(trigger.className).not.toMatch(/\bopacity-0\b/);
    expect(trigger.className).toMatch(/\bh-11\b/);
    expect(trigger.className).toMatch(/\bw-11\b/);
    expect(within(drawer).getByRole('link', { name: 'Ver más en Mis archivos' })).toBeTruthy();
    await expectNoBlockingViolations();
  });

  it('CA-27 movil-cajon-fijado-menu-abierto: Escape dentro del ⋮ cierra solo el menú, no el cajón', async () => {
    const drawer = await renderDrawer(list());
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Acciones de Matriz_Requisitos_RF.xlsx' }),
    );
    expect(screen.getByRole('menuitem', { name: 'Quitar de la barra lateral' })).toBeTruthy();
    await expectNoBlockingViolations();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Menú de navegación' })).toBeTruthy();
  });

  it('CA-27: elegir una carpeta en el cajón lo cierra', async () => {
    const drawer = await renderDrawer(list());
    // jsdom no navega: se cancela la navegación del enlace y solo se mira el cajón.
    const stayHere = (event: MouseEvent): void => event.preventDefault();
    window.addEventListener('click', stayHere, { capture: true });

    await userEvent.click(within(drawer).getByRole('link', { name: 'Proyecto Alpha, carpeta' }));
    window.removeEventListener('click', stayHere, { capture: true });

    expect(screen.queryByRole('dialog', { name: 'Menú de navegación' })).toBeNull();
  });
});
