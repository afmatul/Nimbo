/**
 * @jest-environment jsdom
 */
import {
  SHARED_ERROR_CODES,
  SHARING_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type AccessList,
  type ReceivedShares,
} from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';

import { ApiClientError } from '../../lib/api-error';
import { PREPARING_DELAY_MS } from '../../lib/use-preparing-download';
import { SpaceProvider } from '../storage/components/space-provider';
import { UploadsProvider } from '../storage/components/uploads-provider';
import { StorageRequestError } from '../storage/storage-request-error';
import { sidebarApiFake } from '../storage/test-sidebar-api';
import { GB, spaceSummaryWith } from '../storage/test-space-summary';

import { PublicLinkVisitView } from './components/public-link-visit';
import { ReceivedSharesView } from './components/received-shares-view';
import { ShareDialog } from './components/share-dialog';
import type { PublicLinkVisitorApi } from './public-link-visitor-api';
import type { SharingApi } from './sharing-api';
import { PUBLIC_LINK_DETAILS, SIGNED_DOWNLOAD } from './test-public-link';
import {
  directEntry,
  fakeSharingApi,
  INHERITED_ENTRY,
  never,
  NODE_ID,
  PUBLIC_LINK_URL,
  publicLink,
  RECEIVED_FOLDER,
  receivedShare,
} from './test-sharing';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const VIEWPORTS = [360, 1440] as const;
const TARGET = { nodeType: 'file', nodeId: NODE_ID, name: 'Propuesta comercial v3.pdf' } as const;
const DOCX = 'Informe_trimestral_Q3.docx';

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

async function blockingViolations(): Promise<string[]> {
  const results = await act(async () => axe(document.body));
  return results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html}`));
}

/** Corre axe a 360 y 1440 px sobre lo que ya está montado (CA-7). */
async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    expect({ width, violations: await blockingViolations() }).toEqual({ width, violations: [] });
  }
}

const accessOf = (...entries: AccessList['entries']) =>
  jest.fn(() => Promise.resolve({ entries }) as Promise<AccessList>);
const receivedOf = (...entries: ReceivedShares['entries']) =>
  jest.fn(() => Promise.resolve({ entries }) as Promise<ReceivedShares>);
const rejectWith = (status: number, code: string, details = {}) =>
  jest.fn(() => Promise.reject(new StorageRequestError(status, code, details)));

function Providers({
  readOnly = false,
  children,
}: {
  readonly readOnly?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const summary = { ...spaceSummaryWith(3 * GB), readOnly };
  const storage = sidebarApiFake({ downloadUrl: jest.fn(() => new Promise(() => undefined)) });
  return (
    <UploadsProvider api={storage}>
      <SpaceProvider api={{ spaceSummary: () => Promise.resolve(summary) }} uploadedCount={0}>
        {children}
      </SpaceProvider>
    </UploadsProvider>
  );
}

/** El diálogo se abre desde un botón, como desde el menú: así se comprueba que el foco vuelve a él. */
function DialogHarness({ api }: { readonly api: SharingApi }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <main>
      <h1>Mis archivos</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir compartir
      </button>
      <ShareDialog api={api} target={open ? TARGET : null} onClose={() => setOpen(false)} />
    </main>
  );
}

async function openDialog(api: SharingApi, readOnly = false): Promise<HTMLElement> {
  render(
    <Providers readOnly={readOnly}>
      <DialogHarness api={api} />
    </Providers>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrir compartir' }));
  await act(async () => undefined);
  return screen.getByRole('dialog');
}

async function shareWith(email: string): Promise<void> {
  const dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: 'Correo de la persona' }),
    email,
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Compartir' }));
}

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Compartir · Nimbo';
});

afterEach(() => jest.useRealTimers());

describe('Accesibilidad del diálogo «Compartir» a 360 y 1440 px (spec 012b CA-7)', () => {
  it('CA-7: foco: entra al correo, Escape cierra y vuelve al disparador', async () => {
    const dialog = await openDialog(fakeSharingApi());

    expect(document.activeElement).toBe(
      within(dialog).getByRole('textbox', { name: 'Correo de la persona' }),
    );
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir compartir' }));
  });

  it('CA-7: cargando', async () => {
    await openDialog(fakeSharingApi());
    await expectNoBlockingViolations();
  });

  it('CA-7: vacía', async () => {
    await openDialog(fakeSharingApi({ listAccess: accessOf() }));
    await screen.findByText('Todavía no compartiste esto con nadie.');
    await expectNoBlockingViolations();
  });

  it('CA-7: lista de accesos con uno directo y uno heredado', async () => {
    await openDialog(fakeSharingApi({ listAccess: accessOf(directEntry(), INHERITED_ENTRY) }));
    await screen.findByText(/Viene de «Proyecto Alpha»/);
    await expectNoBlockingViolations();
  });

  it('CA-7: error de carga', async () => {
    await openDialog(fakeSharingApi({ listAccess: jest.fn(() => Promise.reject(new Error())) }));
    await screen.findByText(/No pudimos cargar quién tiene acceso/);
    await expectNoBlockingViolations();
  });

  it('CA-7: compartiendo: «Compartiendo…» pasados 2 s', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    render(
      <Providers>
        <DialogHarness api={fakeSharingApi({ listAccess: accessOf() })} />
      </Providers>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir compartir' }));
    await user.type(screen.getByRole('textbox', { name: 'Correo de la persona' }), 'juan@nimbo.gt');
    await user.click(screen.getByRole('button', { name: 'Compartir' }));
    act(() => jest.advanceTimersByTime(2_000));

    expect(screen.getByRole('button', { name: 'Compartiendo…' })).toBeTruthy();
    jest.useRealTimers();
    await expectNoBlockingViolations();
  });

  it('CA-7: éxito', async () => {
    const share = jest.fn(() => Promise.resolve(directEntry()));
    await openDialog(fakeSharingApi({ listAccess: accessOf(), share }));
    await shareWith('juan@nimbo.gt');
    await screen.findByText(/Listo: Juan Cortés ya tiene acceso/);
    await expectNoBlockingViolations();
  });

  it.each([
    ['destinatario no encontrado', 422, SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND, {}],
    ['contigo mismo', 422, SHARING_ERROR_CODES.SHARING_CANNOT_SHARE_WITH_SELF, {}],
    ['solo lectura', 403, STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY, {}],
    ['demasiados intentos', 429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 60 }],
  ])('CA-7: %s: el error se anuncia con su acción', async (_state, status, code, details) => {
    await openDialog(
      fakeSharingApi({ listAccess: accessOf(), share: rejectWith(status, code, details) }),
    );
    await shareWith('juan@nimbo.gt');
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeTruthy();
    await expectNoBlockingViolations();
  });

  it('CA-7: nivel cambiado', async () => {
    const share = jest.fn(() => Promise.resolve(directEntry({ level: 'VIEWER' })));
    await openDialog(fakeSharingApi({ listAccess: accessOf(directEntry()), share }));
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Nivel de Juan Cortés' }),
      'VIEWER',
    );
    await screen.findByText('Juan Cortés ahora es Lector.');
    await expectNoBlockingViolations();
  });

  it('CA-7: solo lectura de la cuenta: solo se ofrece bajar a Lector', async () => {
    await openDialog(fakeSharingApi({ listAccess: accessOf(directEntry()) }), true);
    await screen.findByRole('combobox', { name: 'Nivel de Juan Cortés' });
    await expectNoBlockingViolations();
  });

  it('CA-7: confirmar quitar y quitando', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    render(
      <Providers>
        <DialogHarness api={fakeSharingApi({ listAccess: accessOf(directEntry()) })} />
      </Providers>,
    );
    await user.click(screen.getByRole('button', { name: 'Abrir compartir' }));
    await user.click(await screen.findByRole('button', { name: 'Quitar acceso de Juan Cortés' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Quitar acceso' }),
    );
    act(() => jest.advanceTimersByTime(2_000));

    expect(screen.getByRole('button', { name: 'Quitando…' })).toBeTruthy();
    jest.useRealTimers();
    await expectNoBlockingViolations();
  });
});

const linkOf = (link: ReturnType<typeof publicLink> | null) =>
  jest.fn(() => Promise.resolve({ link }));
const EXPIRED_LINK = publicLink({ status: 'expired', expiresAt: '2026-11-03T15:15:00.000Z' });

/** Diálogo de un archivo con el enlace `link` y la lista de accesos vacía (013c §6). */
function linkApi(link: ReturnType<typeof publicLink> | null, overrides: Partial<SharingApi> = {}) {
  return fakeSharingApi({ listAccess: accessOf(), currentPublicLink: linkOf(link), ...overrides });
}

const createdLink = () =>
  jest.fn(() => Promise.resolve({ link: publicLink(), url: PUBLIC_LINK_URL }));

async function clickInDialog(name: string): Promise<void> {
  await userEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name }));
}

async function generateFrom(api: SharingApi): Promise<void> {
  await openDialog(api);
  await clickInDialog('Crear enlace público');
  await clickInDialog('Generar enlace');
}

describe('Accesibilidad de la sección «Enlace público» a 360 y 1440 px (spec 013c CA-15)', () => {
  it('CA-15: enlace-cargando', async () => {
    await openDialog(fakeSharingApi({ listAccess: accessOf() }));
    await screen.findByText('Cargando el enlace público…');
    await expectNoBlockingViolations();
  });

  it.each([
    ['enlace-sin-enlace', null, 'Crear enlace público'],
    ['enlace-activo', publicLink({ hasPassword: true }), 'Generar otro enlace'],
    ['enlace-vencido', EXPIRED_LINK, 'Revocar enlace'],
  ])('CA-15: %s', async (_state, link, button) => {
    await openDialog(linkApi(link));
    await within(screen.getByRole('dialog')).findByRole('button', { name: button });
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-formulario y enlace-contrasena-invalida', async () => {
    await openDialog(linkApi(null));
    await clickInDialog('Crear enlace público');
    await expectNoBlockingViolations();
    await userEvent.type(screen.getByLabelText('Contraseña (opcional)'), 'abc12');
    await clickInDialog('Generar enlace');
    await screen.findByText('Escribe una contraseña de 8 a 128 caracteres.');
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-generado', async () => {
    await generateFrom(
      linkApi(null, {
        createPublicLink: createdLink(),
      }),
    );
    await screen.findByRole('textbox', { name: 'Enlace generado' });
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-copiado', async () => {
    await generateFrom(linkApi(null, { createPublicLink: createdLink() }));
    await clickInDialog('Copiar enlace');
    await screen.findByRole('button', { name: 'Enlace copiado' });
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-copia-fallida', async () => {
    await generateFrom(linkApi(null, { createPublicLink: createdLink() }));
    const writeText = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('NotAllowedError'));
    await clickInDialog('Copiar enlace');
    await screen.findByText('No pudimos copiar el enlace. Selecciónalo y cópialo a mano.');
    await expectNoBlockingViolations();
    writeText.mockRestore();
  });

  it.each([
    ['enlace-error-red', jest.fn(() => Promise.reject(new TypeError('Failed to fetch')))],
    [
      'enlace-limite',
      rejectWith(429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 900 }),
    ],
    [
      'enlace-solo-lectura (403 tardío)',
      rejectWith(403, STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY),
    ],
  ])('CA-15: %s', async (_state, createPublicLink) => {
    await generateFrom(linkApi(null, { createPublicLink }));
    await screen.findByText(
      /Hiciste demasiados intentos|No pudimos completar|No puedes generar enlaces/,
    );
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-confirmar-reemplazo', async () => {
    await openDialog(linkApi(publicLink()));
    await clickInDialog('Generar otro enlace');
    await screen.findByText('El enlace actual dejará de funcionar para quien lo tenga.');
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-reemplazando', async () => {
    const dialog = await openDialog(
      linkApi(publicLink(), { createPublicLink: jest.fn((): Promise<never> => never()) }),
    );
    await clickInDialog('Generar otro enlace');
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    await user.click(within(dialog).getByRole('button', { name: 'Generar otro enlace' }));
    act(() => jest.advanceTimersByTime(2_000));

    expect(within(dialog).getByRole('button', { name: 'Generando…' })).toBeTruthy();
    jest.useRealTimers();
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-confirmar-revocar y enlace-revocando', async () => {
    await openDialog(
      linkApi(publicLink(), { revokePublicLink: jest.fn((): Promise<void> => never()) }),
    );
    await clickInDialog('Revocar enlace');
    const confirm = screen.getByRole('group', { name: /¿Revocar el enlace\?/ });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancelar' }));
    await expectNoBlockingViolations();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-revocado', async () => {
    const currentPublicLink = jest
      .fn()
      .mockResolvedValueOnce({ link: publicLink() })
      .mockResolvedValue({ link: null });
    await openDialog(
      linkApi(null, { currentPublicLink, revokePublicLink: jest.fn(() => Promise.resolve()) }),
    );
    await clickInDialog('Revocar enlace');
    const confirm = screen.getByRole('group', { name: /¿Revocar el enlace\?/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    await screen.findByText('Revocamos el enlace. Ya no sirve para descargar el archivo.');
    await expectNoBlockingViolations();
  });

  it.each([
    ['enlace-error-carga', jest.fn(() => Promise.reject(new TypeError('Failed to fetch')))],
    ['enlace-archivo-no-encontrado', rejectWith(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)],
  ])('CA-15: %s', async (_state, currentPublicLink) => {
    await openDialog(fakeSharingApi({ listAccess: accessOf(), currentPublicLink }));
    await within(screen.getByRole('dialog')).findByRole('alert');
    await expectNoBlockingViolations();
  });

  it('CA-15: enlace-no-existe', async () => {
    await openDialog(
      linkApi(publicLink(), {
        revokePublicLink: rejectWith(404, SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND),
      }),
    );
    await clickInDialog('Revocar enlace');
    const confirm = screen.getByRole('group', { name: /¿Revocar el enlace\?/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revocar enlace' }));
    await within(screen.getByRole('dialog')).findByRole('button', { name: 'Actualizar' });
    await expectNoBlockingViolations();
  });

  it.each([
    ['enlace-solo-lectura-sin-enlace', null],
    ['enlace-solo-lectura-con-enlace', publicLink()],
  ])('CA-15: %s', async (_state, link) => {
    await openDialog(linkApi(link), true);
    await screen.findByText('No puedes generar enlaces. Para hacerlo, renueva tu plan.');
    await expectNoBlockingViolations();
  });
});

async function renderReceived(api: SharingApi, readOnly = false): Promise<void> {
  render(
    <Providers readOnly={readOnly}>
      <ReceivedSharesView api={api} openUrl={jest.fn()} />
    </Providers>,
  );
  await act(async () => undefined);
}

const withTwo = (overrides: Partial<SharingApi> = {}): SharingApi =>
  fakeSharingApi({ listReceived: receivedOf(receivedShare(), RECEIVED_FOLDER), ...overrides });

async function chooseLeave(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: `Acciones de ${DOCX}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Salir' }));
  return screen.getByRole('alertdialog');
}

describe('Accesibilidad de «Compartidos conmigo» a 360 y 1440 px (spec 012b CA-7)', () => {
  it('CA-7: cargando', async () => {
    await renderReceived(fakeSharingApi());
    await expectNoBlockingViolations();
  });

  it('CA-7: con elementos', async () => {
    await renderReceived(withTwo());
    await expectNoBlockingViolations();
  });

  it('CA-7: vacía', async () => {
    await renderReceived(fakeSharingApi({ listReceived: receivedOf() }));
    await expectNoBlockingViolations();
  });

  it('CA-7: error de carga', async () => {
    await renderReceived(
      fakeSharingApi({ listReceived: jest.fn(() => Promise.reject(new Error())) }),
    );
    await expectNoBlockingViolations();
  });

  it('CA-7: menú de la fila abierto', async () => {
    await renderReceived(withTwo());
    await userEvent.click(screen.getByRole('button', { name: `Acciones de ${DOCX}` }));
    await expectNoBlockingViolations();
  });

  it('CA-7: confirmar salir: el foco empieza en «Cancelar»', async () => {
    await renderReceived(withTwo());
    const dialog = await chooseLeave();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await expectNoBlockingViolations();
  });

  it('CA-7: cancelar salir devuelve el foco al ⋮ de la fila', async () => {
    await renderReceived(withTwo());
    const dialog = await chooseLeave();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Acciones de ${DOCX}` }),
    );
  });

  it('CA-7: saliendo', async () => {
    await renderReceived(withTwo());
    await userEvent.click(within(await chooseLeave()).getByRole('button', { name: 'Salir' }));
    await expectNoBlockingViolations();
  });

  it('CA-7: salió', async () => {
    await renderReceived(withTwo({ leave: jest.fn(() => Promise.resolve()) }));
    await userEvent.click(within(await chooseLeave()).getByRole('button', { name: 'Salir' }));
    await screen.findByText(`Saliste de «${DOCX}».`);
    await expectNoBlockingViolations();
  });

  it.each([
    ['acceso inexistente', rejectWith(404, SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND)],
    ['sin conexión', jest.fn(() => Promise.reject(new TypeError('Failed to fetch')))],
  ])('CA-7, CA-11: error al salir: %s', async (_state, leave) => {
    await renderReceived(withTwo({ leave }));
    await userEvent.click(within(await chooseLeave()).getByRole('button', { name: 'Salir' }));
    await screen.findByRole('alert');
    await expectNoBlockingViolations();
  });

  it('CA-7: solo lectura', async () => {
    await renderReceived(withTwo(), true);
    await screen.findByText('Tu cuenta está en solo lectura.');
    await expectNoBlockingViolations();
  });
});

const visitorError = (code: string, retryAfterSeconds?: number) =>
  new ApiClientError({ code, message: code, correlationId: 'c-1', retryAfterSeconds });
const PROTECTED_LINK = { ...PUBLIC_LINK_DETAILS, requiresPassword: true };
const pending = () => new Promise<never>(() => undefined);

function visitorApi(overrides: Partial<PublicLinkVisitorApi> = {}): PublicLinkVisitorApi {
  return {
    open: jest.fn().mockResolvedValue(PUBLIC_LINK_DETAILS),
    download: jest.fn().mockResolvedValue(SIGNED_DOWNLOAD),
    ...overrides,
  };
}

/** La página dentro del `<main>` del marco público (`(public)/layout.tsx`). */
function renderVisit(api: PublicLinkVisitorApi): void {
  render(
    <main>
      <PublicLinkVisitView api={api} openUrl={jest.fn()} />
    </main>,
  );
}

/** Ficha abierta y «Descargar» pulsado, con la contraseña si el enlace la pide. */
async function downloadFrom(api: PublicLinkVisitorApi, password = ''): Promise<void> {
  renderVisit(api);
  await screen.findByRole('heading', { level: 1, name: /compartió un archivo contigo/ });
  if (password !== '') {
    await userEvent.type(screen.getByLabelText('Contraseña del enlace'), password);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
}

/** CA-11 pide cero violaciones de axe, no solo las bloqueantes. */
async function expectNoViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    const results = await act(async () => axe(document.body));
    const violations = results.violations.map((violation) => violation.id);
    expect({ width, violations }).toEqual({ width, violations: [] });
  }
}

describe('Accesibilidad de la página del enlace público a 360 y 1440 px (spec 013b CA-11)', () => {
  beforeEach(() => window.history.replaceState(null, '', '/enlace#AbC-123_xyz'));

  it('CA-11: cargando', async () => {
    renderVisit(visitorApi({ open: jest.fn(pending) }));
    await expectNoViolations();
  });

  it('CA-11: sin-contrasena', async () => {
    renderVisit(visitorApi());
    await screen.findByRole('button', { name: 'Descargar' });
    await expectNoViolations();
  });

  it('CA-11: con-contrasena', async () => {
    renderVisit(visitorApi({ open: jest.fn().mockResolvedValue(PROTECTED_LINK) }));
    await screen.findByLabelText('Contraseña del enlace');
    await expectNoViolations();
  });

  it('CA-11: contrasena-incorrecta (y el campo vacío)', async () => {
    const download = jest
      .fn()
      .mockRejectedValue(visitorError(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID));
    await downloadFrom(
      visitorApi({ open: jest.fn().mockResolvedValue(PROTECTED_LINK), download }),
      'no-es-esta',
    );
    await screen.findByRole('alert');
    await expectNoViolations();
  });

  it('CA-11: bloqueado', async () => {
    const download = jest
      .fn()
      .mockRejectedValue(visitorError(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 900));
    await downloadFrom(
      visitorApi({ open: jest.fn().mockResolvedValue(PROTECTED_LINK), download }),
      'la-correcta',
    );
    await screen.findByText(/Hubo demasiados intentos/);
    await expectNoViolations();
  });

  it('CA-11: descargando', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    await downloadFrom(visitorApi({ download: jest.fn(pending) }));
    act(() => jest.advanceTimersByTime(PREPARING_DELAY_MS));
    await screen.findByRole('button', { name: 'Preparando descarga…' });
    await expectNoViolations();
  });

  it('CA-11: descarga-iniciada', async () => {
    await downloadFrom(visitorApi());
    await screen.findByText('Tu descarga comenzó. Si no empieza, vuelve a intentarlo.');
    await expectNoViolations();
  });

  it('CA-11: descarga-error-red', async () => {
    await downloadFrom(visitorApi({ download: jest.fn().mockRejectedValue(visitorError('X')) }));
    await screen.findByRole('button', { name: 'Reintentar' });
    await expectNoViolations();
  });

  it.each([
    ['no-disponible', visitorError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE)],
    ['error-carga', visitorError('INTERNAL_ERROR')],
    ['error-carga-limite', visitorError(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 120)],
  ])('CA-11: %s', async (_state, error) => {
    renderVisit(visitorApi({ open: jest.fn().mockRejectedValue(error) }));
    await screen.findByRole('heading', { level: 2 });
    await expectNoViolations();
  });
});
