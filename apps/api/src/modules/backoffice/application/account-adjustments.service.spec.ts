import { randomUUID } from 'node:crypto';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import type { SubscriptionLimits } from '../../billing';
import { AccountNotFoundError } from '../../identity';
import type { AccountView } from '../../identity';

import { AccountAdjustmentsService } from './account-adjustments.service';
import type { InternalAction } from './internal-action.service';

const ADMIN: Actor = createActor(randomUUID(), Role.ADMIN);
const UNTIL = new Date('2026-12-01T06:00:00.000Z');

const LIMITS: SubscriptionLimits = {
  planName: 'Equipo',
  isPersonal: false,
  status: 'vigente',
  expiresAt: new Date('2026-11-20T15:30:00.000Z'),
  planQuotaBytes: 1000n,
  extraQuotaBytes: 500n,
  extraQuotaUntil: UNTIL,
  usedBytes: 700n,
  totalQuotaBytes: 1500n,
};

const anAccount = (role: Role): AccountView => ({
  id: randomUUID(),
  email: 'ana@nimbo.me',
  fullName: 'Ana López',
  role,
  status: 'activa' as AccountView['status'],
  emailVerified: true,
  usedBytes: role === Role.CLIENT ? 700n : null,
  createdAt: new Date('2026-09-01T09:00:00.000Z'),
  isSelf: false,
});

interface SetupOptions {
  readonly account?: AccountView;
  readonly limits?: SubscriptionLimits | null;
}

/** `InternalActionService` en memoria: corre la acción y anota el evento; sus garantías las prueba su spec. */
const setup = (options: SetupOptions = {}) => {
  const account = options.account ?? anAccount(Role.CLIENT);
  const recorded: AuditRecord[] = [];
  const logs: Record<string, unknown>[] = [];
  const locks: boolean[] = [];
  const internal = {
    read: <T>(_actor: Actor, work: () => Promise<T>): Promise<T> => work(),
    run: async <T>(_actor: Actor, action: InternalAction<T>): Promise<T> => {
      locks.push(action.locksAdminRoster);
      const result = await action.work();
      recorded.push(action.event(result));
      return result;
    },
  };
  const directory = { get: jest.fn(() => Promise.resolve(account)) };
  const resolved = options.limits === undefined ? LIMITS : options.limits;
  const subscriptions = {
    limitsOf: jest.fn(() => Promise.resolve(resolved)),
    adjustQuota: jest.fn(() => Promise.resolve(LIMITS)),
  };
  const logger = { info: (payload: Record<string, unknown>): void => void logs.push(payload) };
  const service = new AccountAdjustmentsService(internal, directory, subscriptions, logger);
  return { service, account, recorded, logs, locks, subscriptions };
};

describe('AccountAdjustmentsService.limits (011b HU-5, CA-1, CA-3)', () => {
  it('HU-5: el usado de la cuenta y los límites de su suscripción', async () => {
    const { service, account } = setup();

    await expect(service.limits(ADMIN, account.id)).resolves.toEqual({
      usedBytes: 700n,
      subscription: LIMITS,
    });
  });

  it('CA-3: sin suscripción, `subscription` es `null` y el usado sigue', async () => {
    const { service, account } = setup({ limits: null });

    await expect(service.limits(ADMIN, account.id)).resolves.toEqual({
      usedBytes: 700n,
      subscription: null,
    });
  });

  it('CA-3: una cuenta interna es `404 IDENTITY_ACCOUNT_NOT_FOUND` y no se consulta `billing`', async () => {
    const { service, account, subscriptions } = setup({ account: anAccount(Role.SUPPORT) });

    await expect(service.limits(ADMIN, account.id)).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(subscriptions.limitsOf).not.toHaveBeenCalled();
  });
});

describe('AccountAdjustmentsService.adjustQuota (011b CA-1, CA-4, RN-4)', () => {
  it('CA-1: ajusta y deja `account.quota_adjusted` contra el cliente con el extra y su fin', async () => {
    const { service, account, recorded, locks, subscriptions } = setup();
    const cmd = { clientId: account.id, extra: { bytes: 500n, lastDay: '2026-11-30' } };

    await expect(service.adjustQuota(ADMIN, cmd)).resolves.toEqual({
      usedBytes: 700n,
      subscription: LIMITS,
    });

    expect(subscriptions.adjustQuota).toHaveBeenCalledWith(ADMIN, cmd);
    expect(locks).toEqual([false]);
    expect(recorded).toEqual([
      {
        action: AuditAction.ACCOUNT_QUOTA_ADJUSTED,
        actor: ADMIN,
        targetUserId: account.id,
        resourceId: account.id,
        attributes: { extraBytes: 500, until: UNTIL.toISOString() },
      },
    ]);
  });

  it('CA-4: al quitar el extra, el evento lleva `extraBytes: 0` y no lleva `until`', async () => {
    const { service, account, recorded, subscriptions } = setup();
    subscriptions.adjustQuota.mockResolvedValue({
      ...LIMITS,
      extraQuotaBytes: 0n,
      extraQuotaUntil: null,
    });

    await service.adjustQuota(ADMIN, { clientId: account.id, extra: null });

    expect(recorded[0]?.attributes).toEqual({ extraBytes: 0 });
  });

  it('RNF-17: la bitácora solo lleva ids', async () => {
    const { service, account, logs } = setup();

    await service.adjustQuota(ADMIN, { clientId: account.id, extra: null });

    expect(logs).toEqual([
      { event: 'backoffice.account.quota_adjusted', actorId: ADMIN.id, accountId: account.id },
    ]);
  });

  it('CA-3: una cuenta interna es `404` y no se ajusta ni se audita', async () => {
    const { service, account, recorded, subscriptions } = setup({
      account: anAccount(Role.ADMIN),
    });

    await expect(
      service.adjustQuota(ADMIN, { clientId: account.id, extra: null }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(subscriptions.adjustQuota).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });
});
