/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render } from '@testing-library/react';

import {
  forgetSession,
  rememberSession,
} from '../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../features/identity/session/test-session';

import InternoPage from './page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

async function renderPage(role: RoleName): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternoPage />
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

describe('área interna (/interno)', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    forgetSession();
  });

  it.each([
    ['SUPPORT', '/soporte/metadatos'],
    ['ADMIN', '/admin/cuentas'],
    ['OPERATOR', '/operacion/metricas'],
  ] as const)('011 CA-17: %s va al inicio de su área, %s, sin dibujar nada', async (role, path) => {
    const container = await renderPage(role);

    expect(replace).toHaveBeenCalledWith(path);
    expect(container.textContent).toBe('');
  });
});
