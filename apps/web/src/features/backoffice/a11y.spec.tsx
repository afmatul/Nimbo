/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  IDENTITY_ERROR_CODES,
  SHARED_ERROR_CODES,
  type AccountListItem,
  type AccountListResponse,
  type ClientFilesResponse,
  type EnrollInternalAccountRequest,
  type RoleName,
} from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactElement } from 'react';

import { InternalAreaLayout } from '../access/components/internal-area-layout';
import { forgetSession, rememberSession } from '../identity/session/session-memory';
import { SessionProvider } from '../identity/session/session-provider';
import { sessionFixture } from '../identity/session/test-session';

import type { AccountsRequest, ClientFilesRequest } from './api';
import { AccountProfile } from './components/account-profile';
import { AdminAccounts } from './components/admin-accounts';
import { AdminClientFiles } from './components/admin-client-files';
import { EnrollAccount } from './components/enroll-account';
import { SupportClientFiles } from './components/support-client-files';
import { accountItem, accountsPage, ANDREA, DIEGO, MONICA } from './test-accounts';
import { clientFile, clientFilesPage, LAURA, TRASHED_PDF } from './test-client-files';
import { always, apiError, enrollmentConflict, loadOf, type Outcome } from './test-loads';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const VIEWPORTS = [360, 1440] as const;
async function renderInFrame(
  screenElement: ReactElement,
  role: RoleName = 'SUPPORT',
): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternalAreaLayout>{screenElement}</InternalAreaLayout>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

/** Con un diálogo abierto se revisa todo el documento: Radix lo monta fuera del contenedor. */
async function expectNoViolations(container: HTMLElement): Promise<void> {
  for (const width of VIEWPORTS) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
    const results = await act(async () => axe(container));
    expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
  }
}

const SEARCH_OUTCOMES: readonly (readonly [string, Outcome<ClientFilesResponse>])[] = [
  ['default', clientFilesPage([clientFile(), TRASHED_PDF], { total: 214 })],
  ['vacio', clientFilesPage([])],
  ['cargando', 'pending'],
  ['no-encontrado', apiError(404, BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND)],
  ['error', new TypeError('Failed to fetch')],
  ['sin permiso', apiError(403, SHARED_ERROR_CODES.FORBIDDEN)],
];

describe('Accesibilidad de los metadatos de un cliente (011 CA-17)', () => {
  beforeAll(() => {
    document.documentElement.lang = 'es';
    document.title = 'Metadatos de archivos · Nimbo';
  });

  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    forgetSession();
  });

  it('CA-17: inicial, sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderInFrame(
      <SupportClientFiles load={always<ClientFilesRequest, ClientFilesResponse>('pending')} />,
    );

    await expectNoViolations(container);
  });

  it.each(SEARCH_OUTCOMES)(
    'CA-17: %s, sin violaciones de axe a 360 y 1440 px',
    async (_state, outcome) => {
      const container = await renderInFrame(<SupportClientFiles load={always(outcome)} />);
      await userEvent.type(screen.getByLabelText('Correo del cliente'), LAURA.email);
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
      await act(async () => undefined);

      await expectNoViolations(container);
    },
  );

  it.each([
    ['desde-admin', clientFilesPage([clientFile(), TRASHED_PDF], { total: 11 })],
    ['desde-admin vacio', clientFilesPage([])],
    ['desde-admin cargando', 'pending'],
  ] as const)('CA-17: %s, sin violaciones de axe a 360 y 1440 px', async (_state, files) => {
    const api = {
      getAccount: always<string, AccountListItem>(accountItem()),
      listClientFiles: always<ClientFilesRequest, ClientFilesResponse>(files),
    };
    const container = await renderInFrame(
      <AdminClientFiles accountId={LAURA.id} api={api} />,
      'ADMIN',
    );

    await expectNoViolations(container);
  });
});

const ACCOUNT_LISTS: readonly (readonly [string, Outcome<AccountListResponse>])[] = [
  ['default', accountsPage([accountItem(), ANDREA, DIEGO, MONICA], { total: 11 })],
  ['vacio', accountsPage([])],
  ['cargando', 'pending'],
  ['error', new TypeError('Failed to fetch')],
  ['sin permiso', apiError(403, SHARED_ERROR_CODES.FORBIDDEN)],
];

/** La ficha de `account`; suspender y reactivar responden `change`. */
function profileApi(account: AccountListItem | Error, change: AccountListItem = accountItem()) {
  return {
    getAccount: always<string, AccountListItem>(account),
    suspendAccount: always<string, AccountListItem>(change),
    reactivateAccount: always<string, AccountListItem>(change),
  };
}

async function fillEnrollment(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nombre completo'), ANDREA.fullName);
  await userEvent.type(screen.getByLabelText('Correo'), ANDREA.email);
  await userEvent.type(screen.getByLabelText('Código de empleado'), 'EMP-0118');
  await userEvent.click(screen.getByRole('radio', { name: /^Soporte/ }));
}

const ENROLL_OUTCOMES: readonly (readonly [string, Outcome<AccountListItem>])[] = [
  ['enviando', 'pending'],
  ['exito', ANDREA],
];

describe('Accesibilidad de cuentas y alta interna (011 CA-17)', () => {
  beforeAll(() => {
    document.documentElement.lang = 'es';
    document.title = 'Cuentas · Nimbo';
  });

  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    forgetSession();
  });

  it.each(ACCOUNT_LISTS)(
    'CA-17: cuentas %s, sin violaciones de axe a 360 y 1440 px',
    async (_state, outcome) => {
      const load = always<AccountsRequest, AccountListResponse>(outcome);
      const container = await renderInFrame(<AdminAccounts load={load} />, 'ADMIN');

      await expectNoViolations(container);
    },
  );

  it.each([
    ['ficha', accountItem()],
    ['ficha suspendida', accountItem({ status: 'suspended' })],
    ['propia-cuenta', MONICA],
    ['ficha no encontrada', apiError(404, IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND)],
    ['ficha con error', new TypeError('Failed to fetch')],
  ] as const)('CA-17: %s, sin violaciones de axe a 360 y 1440 px', async (_state, account) => {
    const api = profileApi(account);
    const container = await renderInFrame(
      <AccountProfile accountId={LAURA.id} api={api} />,
      'ADMIN',
    );

    await expectNoViolations(container);
  });

  it.each([
    ['confirmar-suspender', accountItem(), 'Suspender cuenta'],
    ['confirmar-reactivar', accountItem({ status: 'suspended' }), 'Reactivar cuenta'],
  ] as const)(
    'CA-17: %s, sin violaciones de axe a 360 y 1440 px',
    async (_state, account, label) => {
      await renderInFrame(
        <AccountProfile accountId={LAURA.id} api={profileApi(account)} />,
        'ADMIN',
      );
      await userEvent.click(screen.getByRole('button', { name: label }));

      await expectNoViolations(document.body);
    },
  );

  it('CA-17: suspendida, con su aviso, sin violaciones de axe a 360 y 1440 px', async () => {
    const api = profileApi(accountItem(), accountItem({ status: 'suspended' }));
    const container = await renderInFrame(
      <AccountProfile accountId={LAURA.id} api={api} />,
      'ADMIN',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Suspender cuenta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suspender cuenta' }));
    await act(async () => undefined);

    expect(
      screen.getByText('Esta cuenta quedó suspendida y se cerraron sus sesiones.'),
    ).toBeTruthy();
    await expectNoViolations(container);
  });

  it('CA-17: alta interna default, sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderInFrame(<EnrollAccount enroll={loadOf()} />, 'ADMIN');

    await expectNoViolations(container);
  });

  it('CA-17: alta interna error-campos, sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderInFrame(<EnrollAccount enroll={loadOf()} />, 'ADMIN');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await expectNoViolations(container);
  });

  it.each(ENROLL_OUTCOMES)(
    'CA-17: alta interna %s, sin violaciones de axe a 360 y 1440 px',
    async (_state, outcome) => {
      const enroll = always<EnrollInternalAccountRequest, AccountListItem>(outcome);
      const container = await renderInFrame(<EnrollAccount enroll={enroll} />, 'ADMIN');
      await fillEnrollment();
      await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
      await act(async () => undefined);

      await expectNoViolations(container);
    },
  );

  it('CA-17: alta interna error-conflicto (409 con campos), sin violaciones de axe a 360 y 1440 px', async () => {
    const enroll = always<EnrollInternalAccountRequest, AccountListItem>(enrollmentConflict());
    const container = await renderInFrame(<EnrollAccount enroll={enroll} />, 'ADMIN');
    await fillEnrollment();
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await act(async () => undefined);

    expect(screen.getByRole('alert').textContent).toContain(
      'No creamos la cuenta: el correo y el código de empleado ya están en uso.',
    );
    expect(screen.getByLabelText('Correo').getAttribute('aria-invalid')).toBe('true');
    await expectNoViolations(container);
  });
});
