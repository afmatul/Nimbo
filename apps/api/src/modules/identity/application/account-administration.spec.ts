import { randomUUID } from 'node:crypto';

import { createActor, FixedClock, Role } from '../../../shared';
import { AccountStatus } from '../domain/account-status.enum';
import {
  AccountNotFoundError,
  AccountStateConflictError,
  ActorNotActiveError,
  CannotChangeOwnStatusError,
  LastActiveAdminError,
} from '../domain/errors';
import { Session } from '../domain/session.entity';
import type { User } from '../domain/user.entity';

import { AccountAdministration } from './account-administration';
import { aClientUser } from './testing/client-user.builder';
import { InMemorySessionRepository } from './testing/in-memory-session.repository';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { anInternalUser } from './testing/internal-user.builder';

const NOW = new Date('2026-10-09T15:00:00.000Z');
const DAY_MS = 86_400_000;

const anOpenSession = (userId: string): Session =>
  Session.open({
    id: randomUUID(),
    userId,
    deviceId: randomUUID(),
    secretHash: randomUUID(),
    now: new Date(NOW.getTime() - DAY_MS),
    maxLifetime: 30 * DAY_MS,
  });

const setup = () => {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const administration = new AccountAdministration(users, sessions, new FixedClock(NOW));
  const admin = anInternalUser().build();
  users.seed(admin);
  const actor = createActor(admin.id, Role.ADMIN);
  const seed = <T extends User>(user: T): T => {
    users.seed(user);
    return user;
  };
  const statusOf = async (id: string) => (await users.findById(id))?.status;
  return { users, sessions, administration, admin, actor, seed, statusOf };
};

describe('AccountAdministration (011 CA-2 a CA-4, RN-7)', () => {
  describe('suspend', () => {
    it('CA-2: suspende un cliente activo y revoca todas sus sesiones', async () => {
      const { administration, actor, sessions, seed, statusOf } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().build());
      sessions.seed(anOpenSession(client.id));
      sessions.seed(anOpenSession(client.id));

      const revoked = await administration.suspend(actor, client.id);

      expect(revoked).toBe(2);
      expect(await statusOf(client.id)).toBe(AccountStatus.SUSPENDED);
      expect(
        sessions.all().every((session) => session.revocadaEn?.getTime() === NOW.getTime()),
      ).toBe(true);
    });

    it('CA-2: suspende a otro Administrador si queda uno activo', async () => {
      const { administration, actor, seed, statusOf } = setup();
      const other = seed(anInternalUser().build());

      await administration.suspend(actor, other.id);

      expect(await statusOf(other.id)).toBe(AccountStatus.SUSPENDED);
    });

    it('CA-4: no se suspende a sí mismo y nada cambia', async () => {
      const { administration, actor, admin, seed, statusOf } = setup();
      seed(anInternalUser().build());

      await expect(administration.suspend(actor, admin.id)).rejects.toBeInstanceOf(
        CannotChangeOwnStatusError,
      );
      expect(await statusOf(admin.id)).toBe(AccountStatus.ACTIVE);
    });

    it('RN-7: no suspende al último Administrador activo', async () => {
      const { administration, admin, seed, statusOf } = setup();
      // Su token sigue vigente; `backoffice` lo detendría antes con `assertActorActive`, esta es la segunda barrera.
      const staleAdmin = seed(anInternalUser().suspended().build());

      await expect(
        administration.suspend(createActor(staleAdmin.id, Role.ADMIN), admin.id),
      ).rejects.toBeInstanceOf(LastActiveAdminError);
      expect(await statusOf(admin.id)).toBe(AccountStatus.ACTIVE);
    });

    it('CA-2: una cuenta ya suspendida → `AccountStateConflictError` y sus sesiones no cambian', async () => {
      const { administration, actor, sessions, seed } = setup();
      const support = seed(anInternalUser().withRole(Role.SUPPORT).suspended().build());
      sessions.seed(anOpenSession(support.id));

      await expect(administration.suspend(actor, support.id)).rejects.toBeInstanceOf(
        AccountStateConflictError,
      );
      expect(sessions.all()[0]?.revocadaEn).toBeNull();
    });

    it('CA-2: una cuenta inexistente → `AccountNotFoundError`', async () => {
      const { administration, actor } = setup();

      await expect(administration.suspend(actor, randomUUID())).rejects.toBeInstanceOf(
        AccountNotFoundError,
      );
    });

    it('RN-7: toma el candado del padrón antes de leer la cuenta', async () => {
      const { administration, actor, users, seed } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().build());
      const calls: string[] = [];
      jest.spyOn(users, 'lockAdminRoster').mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve();
      });
      const findForUpdate = users.findByIdForUpdate.bind(users);
      jest.spyOn(users, 'findByIdForUpdate').mockImplementation((id) => {
        calls.push('row');
        return findForUpdate(id);
      });

      await administration.suspend(actor, client.id);

      expect(calls).toEqual(['lock', 'row']);
    });
  });

  it.each(['suspend', 'reactivate'] as const)(
    'CA-4: `%s` sobre sí mismo se rechaza antes de bloquear la fila de la cuenta',
    async (operation) => {
      const { administration, actor, admin, users } = setup();
      const findForUpdate = jest.spyOn(users, 'findByIdForUpdate');

      await expect(administration[operation](actor, admin.id)).rejects.toBeInstanceOf(
        CannotChangeOwnStatusError,
      );
      expect(findForUpdate).not.toHaveBeenCalled();
    },
  );

  describe('reactivate', () => {
    it('CA-3: reactiva una cuenta suspendida sin devolverle sesiones', async () => {
      const { administration, actor, seed, statusOf, sessions } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().suspended().build());

      await administration.reactivate(actor, client.id);

      expect(await statusOf(client.id)).toBe(AccountStatus.ACTIVE);
      expect(sessions.all()).toEqual([]);
    });

    it('CA-4: no se reactiva a sí mismo, aunque esté activo', async () => {
      const { administration, actor, admin } = setup();

      await expect(administration.reactivate(actor, admin.id)).rejects.toBeInstanceOf(
        CannotChangeOwnStatusError,
      );
    });

    it('CA-3: una cuenta activa → `AccountStateConflictError`', async () => {
      const { administration, actor, seed } = setup();
      const operator = seed(anInternalUser().withRole(Role.OPERATOR).build());

      await expect(administration.reactivate(actor, operator.id)).rejects.toBeInstanceOf(
        AccountStateConflictError,
      );
    });

    it('CA-3: una cuenta inexistente → `AccountNotFoundError`', async () => {
      const { administration, actor } = setup();

      await expect(administration.reactivate(actor, randomUUID())).rejects.toBeInstanceOf(
        AccountNotFoundError,
      );
    });
  });

  describe('assertActorActive', () => {
    it('RN-7: un actor activo pasa', async () => {
      const { administration, actor } = setup();

      await expect(administration.assertActorActive(actor)).resolves.toBeUndefined();
    });

    it('RN-7, CA-14: un actor suspendido o inexistente → `ActorNotActiveError`', async () => {
      const { administration, seed } = setup();
      const suspended = seed(anInternalUser().withRole(Role.SUPPORT).suspended().build());

      await expect(
        administration.assertActorActive(createActor(suspended.id, Role.SUPPORT)),
      ).rejects.toBeInstanceOf(ActorNotActiveError);
      await expect(
        administration.assertActorActive(createActor(randomUUID(), Role.ADMIN)),
      ).rejects.toBeInstanceOf(ActorNotActiveError);
    });
  });
});
