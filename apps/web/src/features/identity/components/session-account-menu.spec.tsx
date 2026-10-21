/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { jsonResponse } from '../../../lib/test-http';
import { LOGIN_PATH } from '../routes';
import { SessionGate } from '../session/session-gate';
import { forgetSession, recallSession, rememberSession } from '../session/session-memory';
import { SessionProvider } from '../session/session-provider';
import { sessionFixture } from '../session/test-session';

import { SessionAccountMenu } from './session-account-menu';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

describe('SessionAccountMenu (CA-14)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  it('CA-14: muestra la cuenta de la sesión; al confirmar «Cerrar sesión» la cierra y va a iniciar sesión', async () => {
    rememberSession(sessionFixture());
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));
    const user = userEvent.setup();
    render(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <SessionGate>
          <SessionAccountMenu />
        </SessionGate>
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ana López (menú de la cuenta)' }));
    expect(screen.getByText('ana@ejemplo.com')).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LOGIN_PATH));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost/api/v1/auth/session/logout',
    );
    expect(recallSession(Date.now())).toBeNull();
  });

  it.each([
    ['CLIENT', '/actividad'],
    ['SUPPORT', '/interno/actividad'],
    ['ADMIN', '/interno/actividad'],
    ['OPERATOR', '/interno/actividad'],
  ] as const)('011 CA-17: con el rol %s, «Mi actividad» lleva a %s', async (role, path) => {
    rememberSession(sessionFixture({ role }));
    const user = userEvent.setup();
    render(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <SessionAccountMenu />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ana López (menú de la cuenta)' }));

    expect(screen.getByRole('menuitem', { name: 'Mi actividad' }).getAttribute('href')).toBe(path);
    expect(screen.getByRole('menuitem', { name: 'Seguridad' }).getAttribute('href')).toBe(
      '/cuenta/seguridad',
    );
  });

  it.each([
    ['CLIENT', true],
    ['SUPPORT', false],
    ['ADMIN', false],
    ['OPERATOR', false],
  ] as const)(
    '009 CA-7: con el rol %s, «Plan y facturación» se ofrece: %s',
    async (role, offered) => {
      rememberSession(sessionFixture({ role }));
      const user = userEvent.setup();
      render(
        <SessionProvider apiPublicUrl="http://localhost/api/v1">
          <SessionAccountMenu />
        </SessionProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Ana López (menú de la cuenta)' }));

      const item = screen.queryByRole('menuitem', { name: 'Plan y facturación' });
      expect(item?.getAttribute('href') ?? null).toBe(offered ? '/suscripcion' : null);
    },
  );
});
