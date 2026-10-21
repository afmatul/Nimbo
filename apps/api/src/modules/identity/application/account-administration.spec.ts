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
import { OpaqueToken } from '../domain/opaque-token.vo';
import { Session } from '../domain/session.entity';
import type { User } from '../domain/user.entity';
import { VerificationToken } from '../domain/verification-token.entity';

import { AccountAdministration } from './account-administration';
import { aClientUser } from './testing/client-user.builder';
import { InMemorySessionRepository } from './testing/in-memory-session.repository';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
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

/** Enlace de alta vigente para `userId`, emitido hace una hora. */
const aSetupToken = (userId: string): VerificationToken =>
  VerificationToken.issue({
    id: randomUUID(),
    userId,
    type: 'alta_interna',
    tokenHash: OpaqueToken.generate().hash(),
    createdAt: new Date(NOW.getTime() - DAY_MS / 24),
    expiresAt: new Date(NOW.getTime() + DAY_MS),
  });

const setup = () => {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const logs: Record<string, unknown>[] = [];
  const logger = { info: (payload: Record<string, unknown>): void => void logs.push(payload) };
  const administration = new AccountAdministration(
    users,
    sessions,
    tokens,
    new FixedClock(NOW),
    logger,
  );
  const admin = anInternalUser().build();
  users.seed(admin);
  const actor = createActor(admin.id, Role.ADMIN);
  const seed = <T extends User>(user: T): T => {
    users.seed(user);
    return user;
  };
  const statusOf = async (id: string) => (await users.findById(id))?.status;
  return { users, sessions, tokens, logs, administration, admin, actor, seed, statusOf };
};

describe('AccountAdministration (011 CA-2 a CA-4, RN-7)', () => {
  describe('suspend', () => {
    it('CA-2: suspende un cliente activo y revoca todas sus sesiones', async () => {
      const { administration, actor, sessions, seed, statusOf } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().build());
      sessions.seed(anOpenSession(client.id));
      sessions.seed(anOpenSession(client.id));

      await administration.suspend(actor, client.id);

      expect(await statusOf(client.id)).toBe(AccountStatus.SUSPENDED);
      expect(
        sessions.all().every((session) => session.revocadaEn?.getTime() === NOW.getTime()),
      ).toBe(true);
    });

    it('002 D-10: la bitácora `identity.session.revoked` sale solo cuando el llamador la pide, después de su commit', async () => {
      const { administration, actor, sessions, logs, seed } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().build());
      sessions.seed(anOpenSession(client.id));
      sessions.seed(anOpenSession(client.id));

      const suspension = await administration.suspend(actor, client.id);
      expect(logs).toEqual([]);
      suspension.logRevokedSessions();

      expect(logs).toEqual([
        {
          event: 'identity.session.revoked',
          userId: client.id,
          reason: 'account_suspended',
          count: 2,
        },
      ]);
    });

    it('002 D-10: sin sesiones abiertas, el paso posterior al commit no anota nada', async () => {
      const { administration, actor, logs, seed } = setup();
      const client = seed(aClientUser().withId(randomUUID()).verified().build());

      (await administration.suspend(actor, client.id)).logRevokedSessions();

      expect(logs).toEqual([]);
    });

    it('CA-2, CA-5: suspender invalida el enlace de alta vigente; tras reactivar sigue sin servir', async () => {
      const { administration, actor, tokens, seed } = setup();
      const support = seed(anInternalUser().withRole(Role.SUPPORT).build());
      await tokens.insert(aSetupToken(support.id));

      await administration.suspend(actor, support.id);
      await administration.reactivate(actor, support.id);

      expect(tokens.all()[0]?.invalidatedAt).toEqual(NOW);
      expect(tokens.all()[0]?.isValid(NOW)).toBe(false);
    });

    it('CA-2: una suspensión rechazada no toca el enlace de alta', async () => {
      const { administration, actor, admin, tokens } = setup();
      await tokens.insert(aSetupToken(admin.id));

      await expect(administration.suspend(actor, admin.id)).rejects.toBeInstanceOf(
        CannotChangeOwnStatusError,
      );
      expect(tokens.all()[0]?.invalidatedAt).toBeNull();
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
