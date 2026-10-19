import { randomUUID } from 'node:crypto';

import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AuditRecord } from '../../audit';
import type { AccountView, EnrollInternalCommand } from '../../identity';

import { AdminService } from './admin.service';
import type { InternalAction } from './internal-action.service';

const AT = new Date('2026-10-07T12:00:00.000Z');

const anAccount = (role: Role, overrides: Partial<AccountView> = {}): AccountView => ({
  id: randomUUID(),
  email: `${role.toLowerCase()}@nimbo.me`,
  fullName: 'Ana López',
  role,
  status: 'activa' as AccountView['status'],
  emailVerified: true,
  usedBytes: role === Role.CLIENT ? 2048n : null,
  createdAt: AT,
  isSelf: false,
  ...overrides,
});

interface SetupOptions {
  /** La «transacción» de `run` falla al confirmar (p. ej. el evento no se guarda). */
  readonly commitFails?: boolean;
  readonly accounts?: readonly AccountView[];
  readonly planNames?: ReadonlyMap<string, string>;
}

/**
 * `InternalActionService` en memoria que anota en la línea de tiempo la acción, el evento y el `commit` (o el
 * `rollback`); sus garantías reales (actor activo, candado, misma transacción) las prueba su spec.
 */
const setup = (options: SetupOptions = {}) => {
  const timeline: string[] = [];
  const recorded: AuditRecord[] = [];
  const logs: Record<string, unknown>[] = [];
  const accounts = options.accounts ?? [anAccount(Role.CLIENT)];
  const byId = (id: string): AccountView =>
    accounts.find((account) => account.id === id) ?? anAccount(Role.SUPPORT, { id });
  const internal = {
    read: <T>(_actor: Actor, work: () => Promise<T>): Promise<T> => work(),
    run: async <T>(_actor: Actor, action: InternalAction<T>): Promise<T> => {
      timeline.push(`run:locks=${String(action.locksAdminRoster)}`);
      const result = await action.work();
      recorded.push(action.event(result));
      if (options.commitFails === true) {
        timeline.push('rollback');
        throw new Error('no se pudo confirmar la transacción');
      }
      timeline.push('commit');
      return result;
    },
  };
  const directory = {
    list: jest.fn(() => Promise.resolve({ items: accounts, total: 42 })),
    get: jest.fn((_actor: Actor, id: string) => Promise.resolve(byId(id))),
  };
  const administration = {
    suspend: jest.fn(() =>
      Promise.resolve({
        logRevokedSessions: (): void => void timeline.push('log-revoked-sessions'),
      }),
    ),
    reactivate: jest.fn(() => Promise.resolve()),
  };
  const enrolledId = randomUUID();
  const enrollment = {
    enroll: jest.fn((_actor: Actor, command: EnrollInternalCommand) =>
      Promise.resolve({
        account: { id: enrolledId, role: command.role },
        deliverInvitation: () => {
          timeline.push('deliver');
          return Promise.resolve();
        },
      }),
    ),
  };
  const subscriptions = {
    planNamesFor: jest.fn(() => Promise.resolve(options.planNames ?? new Map<string, string>())),
  };
  const logger = { info: (payload: Record<string, unknown>): void => void logs.push(payload) };
  const service = new AdminService(
    internal,
    directory,
    administration,
    enrollment,
    subscriptions,
    logger,
  );
  const actor = createActor(randomUUID(), Role.ADMIN);
  return { timeline, recorded, logs, directory, subscriptions, enrolledId, service, actor };
};

const ENROLL: EnrollInternalCommand = {
  fullName: 'Sofía Ramírez',
  email: 'sofia@nimbo.me',
  employeeCode: 'SOP-014',
  role: Role.SUPPORT,
};

describe('AdminService (011 CA-1 a CA-6, RN-2)', () => {
  describe('list y get (CA-1)', () => {
    it('CA-1: pide la página con el tamaño del backoffice y el prefijo del correo', async () => {
      const { service, directory, actor } = setup();

      const page = await service.list(actor, { email: 'ana', page: 3 });

      expect(directory.list).toHaveBeenCalledWith(actor, {
        emailPrefix: 'ana',
        page: 3,
        pageSize: BACKOFFICE_PAGE_SIZE,
      });
      expect(page).toMatchObject({ page: 3, total: 42 });
    });

    it('CA-1: sin prefijo no filtra por correo', async () => {
      const { service, directory, actor } = setup();

      await service.list(actor, { email: undefined, page: 1 });

      expect(directory.list).toHaveBeenCalledWith(actor, {
        page: 1,
        pageSize: BACKOFFICE_PAGE_SIZE,
      });
    });

    it('CA-1: el plan sale de `billing` solo para los clientes; internas y clientes sin suscripción dan `null`', async () => {
      const subscribed = anAccount(Role.CLIENT);
      const unsubscribed = anAccount(Role.CLIENT);
      const internal = anAccount(Role.OPERATOR);
      const { service, subscriptions, actor } = setup({
        accounts: [subscribed, unsubscribed, internal],
        planNames: new Map([[subscribed.id, 'Equipo']]),
      });

      const page = await service.list(actor, { email: undefined, page: 1 });

      expect(subscriptions.planNamesFor).toHaveBeenCalledWith(actor, [
        subscribed.id,
        unsubscribed.id,
      ]);
      expect(page.items.map((item) => [item.id, item.planName])).toEqual([
        [subscribed.id, 'Equipo'],
        [unsubscribed.id, null],
        [internal.id, null],
      ]);
    });

    it('CA-1: la ficha de un cliente trae su plan', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, actor } = setup({
        accounts: [client],
        planNames: new Map([[client.id, 'Pro']]),
      });

      expect(await service.get(actor, client.id)).toMatchObject({ id: client.id, planName: 'Pro' });
    });
  });

  describe('suspend y reactivate (CA-2 a CA-4)', () => {
    it('CA-2, RN-7: suspende con el candado del padrón, audita sobre la cuenta y devuelve su ficha', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, timeline, recorded, actor } = setup({ accounts: [client] });

      const account = await service.suspend(actor, client.id);

      expect(account.id).toBe(client.id);
      expect(timeline.slice(0, 2)).toEqual(['run:locks=true', 'commit']);
      expect(recorded).toEqual([
        { action: 'account.suspended', actor, targetUserId: client.id, resourceId: client.id },
      ]);
    });

    it('RNF-17: tras suspender, la bitácora de `backoffice` lleva solo ids, nunca el correo', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, logs, actor } = setup({ accounts: [client] });

      await service.suspend(actor, client.id);

      expect(logs).toEqual([
        { event: 'backoffice.account.suspended', actorId: actor.id, accountId: client.id },
      ]);
      expect(JSON.stringify(logs)).not.toContain(client.email);
    });

    it('002 D-10: pide a `identity` la bitácora de sesiones revocadas después del commit', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, timeline, actor } = setup({ accounts: [client] });

      await service.suspend(actor, client.id);

      expect(timeline).toEqual(['run:locks=true', 'commit', 'log-revoked-sessions']);
    });

    it('CA-3: reactiva con el candado del padrón, audita y deja su bitácora', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, timeline, recorded, logs, actor } = setup({ accounts: [client] });

      await service.reactivate(actor, client.id);

      expect(timeline).toEqual(['run:locks=true', 'commit']);
      expect(recorded).toMatchObject([{ action: 'account.reactivated', targetUserId: client.id }]);
      expect(logs).toEqual([
        { event: 'backoffice.account.reactivated', actorId: actor.id, accountId: client.id },
      ]);
    });

    it('002 D-10: si la transacción se revierte, no deja bitácoras de éxito ni pide la de sesiones revocadas', async () => {
      const client = anAccount(Role.CLIENT);
      const { service, timeline, logs, actor } = setup({ accounts: [client], commitFails: true });

      await expect(service.suspend(actor, client.id)).rejects.toThrow('no se pudo confirmar');
      expect(logs).toEqual([]);
      expect(timeline).not.toContain('log-revoked-sessions');
    });
  });

  describe('enroll (CA-5, CA-6)', () => {
    it('CA-5: da de alta con el candado, audita con el rol y envía el correo después del commit', async () => {
      const { service, timeline, recorded, logs, enrolledId, actor } = setup();

      const account = await service.enroll(actor, ENROLL);

      expect(account.id).toBe(enrolledId);
      expect(timeline).toEqual(['run:locks=true', 'commit', 'deliver']);
      expect(recorded).toEqual([
        {
          action: 'account.internal_created',
          actor,
          targetUserId: enrolledId,
          resourceId: enrolledId,
          attributes: { role: Role.SUPPORT },
        },
      ]);
      expect(logs).toEqual([
        {
          event: 'backoffice.account.enrolled',
          actorId: actor.id,
          accountId: enrolledId,
          role: Role.SUPPORT,
        },
      ]);
    });

    it('plan R-4: si la transacción se revierte, no envía el correo', async () => {
      const { service, timeline, actor } = setup({ commitFails: true });

      await expect(service.enroll(actor, ENROLL)).rejects.toThrow('no se pudo confirmar');
      expect(timeline).not.toContain('deliver');
    });
  });
});
