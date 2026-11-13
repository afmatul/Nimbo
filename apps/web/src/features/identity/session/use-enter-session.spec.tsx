/**
 * @jest-environment jsdom
 */
import type { SessionUser } from '@nimbo/contracts';
import { renderHook } from '@testing-library/react';

import { forgetSession, recallSession } from './session-memory';
import { sessionFixture } from './test-session';
import { useEnterSession } from './use-enter-session';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

describe('useEnterSession', () => {
  beforeEach(() => {
    replace.mockReset();
    forgetSession();
  });

  it.each([
    ['CLIENT', '/archivos'],
    ['SUPPORT', '/interno'],
  ] as const)('CA-1: deja la sesión en memoria y lleva al inicio de %s', (role, home) => {
    const session = sessionFixture({ role, token: `token-${role}` });
    const { result } = renderHook(() => useEnterSession());

    result.current(session);

    expect(recallSession(Date.now())?.accessToken).toBe(`token-${role}`);
    expect(replace).toHaveBeenCalledWith(home);
  });

  it('Registro con plan de pago: si la cuenta tiene un plan pendiente, lleva a contratarlo', () => {
    const session = sessionFixture();
    const { result } = renderHook(() => useEnterSession());

    const user: SessionUser = { ...session.user, pendingPlanSlug: 'pro' };
    result.current({ ...session, user });

    expect(replace).toHaveBeenCalledWith('/planes/contratar?slug=pro');
  });

  it('Registro sin plan de pago: `pendingPlanSlug: null` lleva al inicio del rol', () => {
    const session = sessionFixture();
    const { result } = renderHook(() => useEnterSession());

    const user: SessionUser = { ...session.user, pendingPlanSlug: null };
    result.current({ ...session, user });

    expect(replace).toHaveBeenCalledWith('/archivos');
  });
});
