/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  SHARED_ERROR_CODES,
  type ClientFilesResponse,
} from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactElement } from 'react';

import { ApiClientError } from '../../lib/api-error';
import { InternalAreaLayout } from '../access/components/internal-area-layout';
import { forgetSession, rememberSession } from '../identity/session/session-memory';
import { SessionProvider } from '../identity/session/session-provider';
import { sessionFixture } from '../identity/session/test-session';

import { SupportClientFiles } from './components/support-client-files';
import { clientFile, clientFilesPage, LAURA, TRASHED_PDF } from './test-client-files';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const VIEWPORTS = [360, 1440] as const;
type Outcome = ClientFilesResponse | Error | 'pending';

function apiError(status: number, code: string): ApiClientError {
  return new ApiClientError({ status, code, message: code, correlationId: 'corr-1' });
}

function loadOf(outcome: Outcome) {
  return () => {
    if (outcome === 'pending') return new Promise<ClientFilesResponse>(() => undefined);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
}

async function renderInFrame(screenElement: ReactElement): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role: 'SUPPORT' }));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternalAreaLayout>{screenElement}</InternalAreaLayout>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

async function expectNoViolations(container: HTMLElement): Promise<void> {
  for (const width of VIEWPORTS) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
    const results = await act(async () => axe(container));
    expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
  }
}

const SEARCH_OUTCOMES: readonly (readonly [string, Outcome])[] = [
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
    const container = await renderInFrame(<SupportClientFiles load={loadOf('pending')} />);

    await expectNoViolations(container);
  });

  it.each(SEARCH_OUTCOMES)(
    'CA-17: %s, sin violaciones de axe a 360 y 1440 px',
    async (_state, outcome) => {
      const container = await renderInFrame(<SupportClientFiles load={loadOf(outcome)} />);
      await userEvent.type(screen.getByLabelText('Correo del cliente'), LAURA.email);
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
      await act(async () => undefined);

      await expectNoViolations(container);
    },
  );
});
