import { randomUUID } from 'node:crypto';

import { createActor, RateLimitExceededError, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { ActorNotActiveError } from '../../identity';

import { InternalActionService } from './internal-action.service';
import type { InternalAction } from './internal-action.service';

/**
 * Transacción en memoria que anota en la línea de tiempo común su apertura con actor, el `commit` si el trabajo termina
 * y el `rollback` si lanza: así la prueba ve qué quedó dentro de la misma transacción y qué se revirtió.
 */
class RecordingTransactions implements ITransactionRunner {
  constructor(private readonly timeline: string[]) {}

  run<T>(): Promise<T> {
    return Promise.reject(new Error('InternalActionService solo abre transacciones con actor'));
  }

  async withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
    this.timeline.push(`begin:${actor.id}`);
    try {
      const result = await work();
      this.timeline.push('commit');
      return result;
    } catch (error: unknown) {
      this.timeline.push('rollback');
      throw error;
    }
  }
}

interface SetupOptions {
  /** El actor ya no está `activa` (RN-7, CA-14). */
  readonly actorInactive?: boolean;
  /** La auditoría no puede guardar el evento. */
  readonly auditFails?: boolean;
  /** La cuenta interna pasó su límite de tasa (T-14, PD-103). */
  readonly rateLimited?: boolean;
}

const setup = (options: SetupOptions = {}) => {
  const timeline: string[] = [];
  const recorded: AuditRecord[] = [];
  const logs: Record<string, unknown>[] = [];
  const accounts = {
    lockAdminRoster: (): Promise<void> => {
      timeline.push('lock');
      return Promise.resolve();
    },
    assertActorActive: (): Promise<void> => {
      timeline.push('check');
      return options.actorInactive === true
        ? Promise.reject(new ActorNotActiveError())
        : Promise.resolve();
    },
  };
  const limiter = {
    assertAllowed: (): Promise<void> => {
      timeline.push('rate');
      return options.rateLimited === true
        ? Promise.reject(new RateLimitExceededError(30))
        : Promise.resolve();
    },
  };
  const audit = {
    recordInTransaction: (entry: AuditRecord): Promise<void> => {
      timeline.push(`event:${entry.action}`);
      recorded.push(entry);
      return options.auditFails === true
        ? Promise.reject(new Error('no se pudo guardar el evento'))
        : Promise.resolve();
    },
  };
  const logger = { warn: (payload: Record<string, unknown>): void => void logs.push(payload) };
  const service = new InternalActionService(
    new RecordingTransactions(timeline),
    accounts,
    limiter,
    audit,
    logger,
  );
  const actor = createActor(randomUUID(), Role.ADMIN);
  return { timeline, recorded, logs, service, actor };
};

/** Una suspensión de prueba: la acción devuelve el id afectado y el evento se arma con él. */
const suspension = (
  timeline: string[],
  actor: Actor,
  locksAdminRoster: boolean,
): InternalAction<string> => {
  const targetId = randomUUID();
  return {
    locksAdminRoster,
    work: () => {
      timeline.push('work');
      return Promise.resolve(targetId);
    },
    event: (affectedId) => ({
      action: AuditAction.ACCOUNT_SUSPENDED,
      actor,
      targetUserId: affectedId,
      resourceId: affectedId,
    }),
  };
};

describe('InternalActionService (011 plan §1, RN-7, CA-14)', () => {
  describe('run', () => {
    it('RN-2: comprueba al actor, hace la acción y registra su evento en una sola transacción con el actor', async () => {
      const { timeline, recorded, service, actor } = setup();

      const result = await service.run(actor, suspension(timeline, actor, false));

      expect(timeline).toEqual([
        'rate',
        `begin:${actor.id}`,
        'check',
        'work',
        'event:account.suspended',
        'commit',
      ]);
      expect(recorded.map((entry) => entry.targetUserId)).toEqual([result]);
    });

    it('RN-7: con `locksAdminRoster`, toma el candado del padrón antes de comprobar al actor', async () => {
      const { timeline, service, actor } = setup();

      await service.run(actor, suspension(timeline, actor, true));

      expect(timeline).toEqual([
        'rate',
        `begin:${actor.id}`,
        'lock',
        'check',
        'work',
        'event:account.suspended',
        'commit',
      ]);
    });

    it('011b RN-4: `event` puede dar una lista; cada evento se registra en orden en la misma transacción', async () => {
      const { timeline, recorded, service, actor } = setup();
      const clientId = randomUUID();

      await service.run(actor, {
        locksAdminRoster: false,
        work: () => Promise.resolve(clientId),
        event: (id) => [
          { action: AuditAction.ACCOUNT_QUOTA_ADJUSTED, actor, targetUserId: id, resourceId: id },
          { action: AuditAction.SUBSCRIPTION_READ_ONLY_EXITED, actor, targetUserId: id },
        ],
      });

      expect(timeline).toEqual([
        'rate',
        `begin:${actor.id}`,
        'check',
        'event:account.quota_adjusted',
        'event:subscription.read_only_exited',
        'commit',
      ]);
      expect(recorded.map((entry) => entry.targetUserId)).toEqual([clientId, clientId]);
    });

    it('RN-2: si el evento no se guarda, la acción se revierte con él y el error sube', async () => {
      const { timeline, service, actor } = setup({ auditFails: true });

      await expect(service.run(actor, suspension(timeline, actor, false))).rejects.toThrow(
        'no se pudo guardar el evento',
      );
      expect(timeline.slice(-3)).toEqual(['work', 'event:account.suspended', 'rollback']);
    });
    it('CA-14: un actor ya no activo recibe `403 SHARED_FORBIDDEN` antes de la acción y sin evento', async () => {
      const { timeline, service, actor } = setup({ actorInactive: true });

      await expect(service.run(actor, suspension(timeline, actor, true))).rejects.toMatchObject({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
      expect(timeline).toEqual(['rate', `begin:${actor.id}`, 'lock', 'check', 'rollback']);
    });

    it('T-14: una cuenta que pasa su límite recibe `429 SHARED_TOO_MANY_REQUESTS` sin abrir transacción', async () => {
      const { timeline, service, actor } = setup({ rateLimited: true });

      await expect(service.run(actor, suspension(timeline, actor, false))).rejects.toBeInstanceOf(
        RateLimitExceededError,
      );
      expect(timeline).toEqual(['rate']);
    });
  });

  describe('read', () => {
    it('CA-14: comprueba al actor y lee dentro de su transacción, sin candado ni evento', async () => {
      const { timeline, service, actor } = setup();

      const result = await service.read(actor, () => {
        timeline.push('read');
        return Promise.resolve('página');
      });

      expect(result).toBe('página');
      expect(timeline).toEqual(['rate', `begin:${actor.id}`, 'check', 'read', 'commit']);
    });

    it('CA-14: un actor ya no activo recibe `403 SHARED_FORBIDDEN` antes de la lectura', async () => {
      const { timeline, service, actor } = setup({ actorInactive: true });
      const work = jest.fn(() => Promise.resolve('página'));

      await expect(service.read(actor, work)).rejects.toMatchObject({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
      expect(work).not.toHaveBeenCalled();
      expect(timeline).toEqual(['rate', `begin:${actor.id}`, 'check', 'rollback']);
    });
  });

  describe('bitácora', () => {
    it('RN-7, RNF-17: un actor ya no activo deja `backoffice.actor.inactive` con su id y rol', async () => {
      const { logs, service, actor } = setup({ actorInactive: true });

      await expect(service.read(actor, () => Promise.resolve('página'))).rejects.toBeInstanceOf(
        ActorNotActiveError,
      );
      expect(logs).toEqual([
        { event: 'backoffice.actor.inactive', actorId: actor.id, actorRole: Role.ADMIN },
      ]);
    });

    it('un actor activo no deja esa bitácora', async () => {
      const { logs, timeline, service, actor } = setup();

      await service.run(actor, suspension(timeline, actor, true));

      expect(logs).toEqual([]);
    });
  });
});
