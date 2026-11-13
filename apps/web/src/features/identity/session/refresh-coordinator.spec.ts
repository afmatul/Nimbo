import type { SessionResponse } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';

import {
  REFRESH_LOCK_NAME,
  createRefreshCoordinator,
  type LockRequester,
} from './refresh-coordinator';

const SESSION: SessionResponse = {
  accessToken: 'token-nuevo',
  accessTokenExpiresAt: '2026-09-30T12:15:00.000Z',
  user: {
    id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d',
    fullName: 'Ana López',
    email: 'ana@ejemplo.com',
    role: 'CLIENT',
    pendingPlanSlug: null,
  },
};

function apiError(code: string): ApiClientError {
  return new ApiClientError({ code, message: code, correlationId: 'c-1' });
}

/** Candado simulado: serializa las llamadas como `navigator.locks` con un mismo nombre. */
function fakeLocks(): { readonly locks: LockRequester; readonly names: string[] } {
  const names: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const locks: LockRequester = {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => {
      names.push(name);
      const run = tail.then(callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
  return { locks, names };
}

describe('refresh-coordinator', () => {
  it('CA-7: dos renovaciones simultáneas en la pestaña hacen una sola petición', async () => {
    const refresh = jest.fn().mockResolvedValue(SESSION);
    const coordinator = createRefreshCoordinator({ refresh, onSessionEnded: jest.fn() });

    const [first, second] = await Promise.all([coordinator.run(), coordinator.run()]);

    expect(first).toEqual(SESSION);
    expect(second).toEqual(SESSION);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('CA-7: terminada una renovación, la siguiente vuelve a pedir', async () => {
    const refresh = jest.fn().mockResolvedValue(SESSION);
    const coordinator = createRefreshCoordinator({ refresh, onSessionEnded: jest.fn() });

    await coordinator.run();
    await coordinator.run();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('RN-4: entre pestañas serializa con el candado nimbo-refresh', async () => {
    const { locks, names } = fakeLocks();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const firstTab = jest.fn(
      () =>
        new Promise<SessionResponse>((resolve) => {
          order.push('a:inicio');
          release = () => {
            order.push('a:fin');
            resolve(SESSION);
          };
        }),
    );
    const secondTab = jest.fn(() => {
      order.push('b:inicio');
      return Promise.resolve(SESSION);
    });
    const tabA = createRefreshCoordinator({ refresh: firstTab, onSessionEnded: jest.fn(), locks });
    const tabB = createRefreshCoordinator({ refresh: secondTab, onSessionEnded: jest.fn(), locks });

    const runA = tabA.run();
    const runB = tabB.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['a:inicio']);
    release();
    await Promise.all([runA, runB]);

    expect(order).toEqual(['a:inicio', 'a:fin', 'b:inicio']);
    expect(names).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME]);
    expect(REFRESH_LOCK_NAME).toBe('nimbo-refresh');
  });

  it('CA-9: IDENTITY_REFRESH_INVALID se reintenta una sola vez', async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(apiError('IDENTITY_REFRESH_INVALID'))
      .mockResolvedValueOnce(SESSION);
    const onSessionEnded = jest.fn();
    const coordinator = createRefreshCoordinator({ refresh, onSessionEnded });

    await expect(coordinator.run()).resolves.toEqual(SESSION);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('CA-9: si el reintento también es IDENTITY_REFRESH_INVALID, falla sin marcar la sesión como terminada', async () => {
    const refresh = jest.fn().mockRejectedValue(apiError('IDENTITY_REFRESH_INVALID'));
    const onSessionEnded = jest.fn();
    const coordinator = createRefreshCoordinator({ refresh, onSessionEnded });

    await expect(coordinator.run()).rejects.toMatchObject({ code: 'IDENTITY_REFRESH_INVALID' });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it.each(['IDENTITY_SESSION_EXPIRED', 'IDENTITY_SESSION_REVOKED'])(
    'CA-8: %s termina la sesión sin reintentar',
    async (code) => {
      const refresh = jest.fn().mockRejectedValue(apiError(code));
      const onSessionEnded = jest.fn();
      const coordinator = createRefreshCoordinator({ refresh, onSessionEnded });

      await expect(coordinator.run()).rejects.toMatchObject({ code });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onSessionEnded).toHaveBeenCalledTimes(1);
    },
  );

  it('DT-16: sin navigator.locks sigue funcionando', async () => {
    const refresh = jest.fn().mockResolvedValue(SESSION);
    const coordinator = createRefreshCoordinator({
      refresh,
      onSessionEnded: jest.fn(),
      locks: undefined,
    });

    await expect(coordinator.run()).resolves.toEqual(SESSION);
  });
});
