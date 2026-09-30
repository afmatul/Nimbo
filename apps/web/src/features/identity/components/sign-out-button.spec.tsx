/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { jsonResponse } from '../../../lib/test-http';
import { forgetSession, recallSession, rememberSession } from '../session/session-memory';
import { SessionProvider } from '../session/session-provider';
import { sessionFixture } from '../session/test-session';

import { SignOutButton } from './sign-out-button';

describe('SignOutButton', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  it('cierra la sesión en la API y la olvida de la memoria', async () => {
    rememberSession(sessionFixture());
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));
    const user = userEvent.setup();
    render(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <SignOutButton />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => {
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'http://localhost/api/v1/auth/session/logout',
      );
    });
    expect(recallSession(Date.now())).toBeNull();
  });
});
