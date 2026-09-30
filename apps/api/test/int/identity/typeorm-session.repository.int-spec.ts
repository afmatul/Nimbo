import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { DataSource } from 'typeorm';

import { OpaqueToken } from '../../../src/modules/identity/domain/opaque-token.vo';
import { Session } from '../../../src/modules/identity/domain/session.entity';
import { SesionOrmEntity } from '../../../src/modules/identity/infrastructure/persistence/sesion.orm-entity';
import { TypeOrmSessionRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-session.repository';
import { buildDataSourceOptions, TransactionContext } from '../../../src/shared';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

import { aClient } from './identity-rows';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_LIFETIME_MS = 30 * MS_PER_DAY;
/** Tiempo que la primera transacción retiene la fila para que la segunda tenga que esperarla. */
const HOLD_MS = 300;

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * MS_PER_DAY);

/** Aviso de una transacción a la otra: fija el orden sin depender de un `sleep`. */
const signal = (): { fire: () => void; fired: Promise<void> } => {
  let fire = (): void => undefined;
  const fired = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { fire, fired };
};

/** `TypeOrmSessionRepository` sobre Postgres real (plan §4 y §6.4; CA-7, CA-9, CA-11 a CA-13, CA-19, CA-22). */
describe('TypeOrmSessionRepository (CA-7, CA-9, CA-11, CA-12, CA-13, CA-19, CA-22)', () => {
  let dataSource: DataSource;
  let runner: TypeOrmTransactionRunner;
  let repository: TypeOrmSessionRepository;

  const insertClient = async (): Promise<string> => {
    const row = aClient();
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, version_terminos, version_privacidad,
         terminos_aceptados_en)
       VALUES ($1, $2, $3, '$argon2id$prueba', 'CLIENT', '1.0', '1.0', $4)`,
      [row.id, row.nombre, row.correo, row.terminos_aceptados_en],
    );
    return row.id;
  };

  const insertDevice = async (userId: string): Promise<string> => {
    const rows = (await dataSource.query(
      `INSERT INTO dispositivo (usuario_id, huella_hash, agente_usuario, ultima_ip, ultimo_acceso)
       VALUES ($1, $2, 'Mozilla/5.0 Firefox/130.0', '203.0.113.7', $3) RETURNING id`,
      [userId, OpaqueToken.generate().hash(), NOW],
    )) as { id: string }[];
    return rows[0]?.id ?? '';
  };

  const openSessionFor = async (userId: string, openedAt: Date = daysAgo(1)): Promise<Session> =>
    Session.open({
      id: randomUUID(),
      userId,
      deviceId: await insertDevice(userId),
      secretHash: OpaqueToken.generate().hash(),
      now: openedAt,
      maxLifetime: MAX_LIFETIME_MS,
    });

  const openSession = async (openedAt?: Date): Promise<Session> =>
    openSessionFor(await insertClient(), openedAt);

  const insertAll = (sessions: readonly Session[]): Promise<void> =>
    runner.run(async () => {
      for (const session of sessions) {
        await repository.insert(session);
      }
    });

  const revokedAt = async (id: string): Promise<Date | null> => {
    const rows = (await dataSource.query('SELECT revocada_en FROM sesion WHERE id = $1', [id])) as {
      revocada_en: Date | null;
    }[];
    return rows[0]?.revocada_en ?? null;
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
      entities: [SesionOrmEntity],
    });
    await dataSource.initialize();
    const context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    repository = new TypeOrmSessionRepository(context);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('insert, findByIdForUpdate y update (T-22)', () => {
    it('CA-7: `insert` y `findByIdForUpdate` van y vuelven con todos los campos', async () => {
      const session = await openSession();

      await runner.run(() => repository.insert(session));
      const found = await runner.run(() => repository.findByIdForUpdate(session.id));

      expect(found).toEqual(session);
    });

    it('CA-9: `findByIdForUpdate` con un id inexistente devuelve `null`', async () => {
      await expect(
        runner.run(() => repository.findByIdForUpdate(randomUUID())),
      ).resolves.toBeNull();
    });

    it('CA-7: `update` guarda la rotación y la revocación', async () => {
      const session = await openSession();
      await runner.run(() => repository.insert(session));
      const rotated = session.rotate(OpaqueToken.generate().hash(), NOW).revoke(NOW);

      await runner.run(() => repository.update(rotated));

      await expect(runner.run(() => repository.findByIdForUpdate(session.id))).resolves.toEqual(
        rotated,
      );
    });

    it('CA-7: `findByIdForUpdate` bloquea la fila: dos renovaciones se serializan', async () => {
      const session = await openSession();
      await runner.run(() => repository.insert(session));
      const lockedFirst = signal();
      const order: string[] = [];

      const first = runner.run(async () => {
        const read = await repository.findByIdForUpdate(session.id);
        if (read === null) throw new Error('la sesión debía existir');
        lockedFirst.fire();
        await sleep(HOLD_MS);
        await repository.update(read.rotate(OpaqueToken.generate().hash(), NOW));
        order.push('primera rota');
      });
      await lockedFirst.fired;
      const second = runner.run(async () => {
        const read = await repository.findByIdForUpdate(session.id);
        order.push('segunda lee');
        return read;
      });

      const [, seenBySecond] = await Promise.all([first, second]);

      expect(order).toEqual(['primera rota', 'segunda lee']);
      expect(seenBySecond?.refreshAnteriorHash).toBe(session.refreshHash);
    });
  });

  describe('listActive, revokeIfActive y revokeAllExcept (T-23)', () => {
    const IDLE_CUTOFF = daysAgo(7);
    const LIST_LIMIT = 50;
    const USER_AGENT = 'Mozilla/5.0 Firefox/130.0';

    it('CA-11: `listActive` trae solo las vigentes de la cuenta, por último uso descendente', async () => {
      const userId = await insertClient();
      const recent = await openSessionFor(userId);
      const rotated = (await openSessionFor(userId, daysAgo(3))).rotate(
        OpaqueToken.generate().hash(),
        daysAgo(0.5),
      );
      const revoked = (await openSessionFor(userId)).revoke(daysAgo(0.1));
      const pastLifetime = (await openSessionFor(userId, daysAgo(31))).rotate(
        OpaqueToken.generate().hash(),
        daysAgo(2),
      );
      const idle = await openSessionFor(userId, daysAgo(8));
      const idleExactly = await openSessionFor(userId, IDLE_CUTOFF);
      const othersSession = await openSession();
      await insertAll([recent, rotated, revoked, pastLifetime, idle, idleExactly, othersSession]);

      const records = await repository.listActive(userId, NOW, IDLE_CUTOFF, LIST_LIMIT);

      expect(records).toEqual([
        { session: rotated, agenteUsuario: USER_AGENT },
        { session: recent, agenteUsuario: USER_AGENT },
      ]);
    });

    it('CA-11: `listActive` respeta el límite y no trae la huella ni la IP del dispositivo', async () => {
      const userId = await insertClient();
      const older = await openSessionFor(userId, daysAgo(2));
      const newer = await openSessionFor(userId, daysAgo(1));
      await insertAll([older, newer]);

      const records = await repository.listActive(userId, NOW, IDLE_CUTOFF, 1);

      expect(records).toEqual([{ session: newer, agenteUsuario: USER_AGENT }]);
      expect(Object.keys(records[0] ?? {}).sort()).toEqual(['agenteUsuario', 'session']);
    });

    it('CA-12: `revokeIfActive` revoca la sesión vigente del dueño', async () => {
      const session = await openSession();
      await insertAll([session]);

      await expect(repository.revokeIfActive(session.id, session.userId, NOW)).resolves.toBe(true);
      await expect(revokedAt(session.id)).resolves.toEqual(NOW);
    });

    it('CA-12: `revokeIfActive` con el `userId` de otra cuenta devuelve `false` sin cambios', async () => {
      const session = await openSession();
      const stranger = await insertClient();
      await insertAll([session]);

      await expect(repository.revokeIfActive(session.id, stranger, NOW)).resolves.toBe(false);
      await expect(revokedAt(session.id)).resolves.toBeNull();
    });

    it('CA-12: `revokeIfActive` de una ya revocada devuelve `false` y conserva la primera fecha', async () => {
      const firstRevocation = daysAgo(0.5);
      const session = (await openSession()).revoke(firstRevocation);
      await insertAll([session]);

      await expect(repository.revokeIfActive(session.id, session.userId, NOW)).resolves.toBe(false);
      await expect(revokedAt(session.id)).resolves.toEqual(firstRevocation);
    });

    it('CA-13: `revokeAllExcept(u, actual)` revoca las demás de la cuenta y devuelve cuántas', async () => {
      const userId = await insertClient();
      const current = await openSessionFor(userId);
      const second = await openSessionFor(userId);
      const third = await openSessionFor(userId);
      const alreadyRevoked = (await openSessionFor(userId)).revoke(daysAgo(0.5));
      const othersSession = await openSession();
      await insertAll([current, second, third, alreadyRevoked, othersSession]);

      await expect(repository.revokeAllExcept(userId, current.id, NOW)).resolves.toBe(2);

      await expect(revokedAt(current.id)).resolves.toBeNull();
      await expect(revokedAt(second.id)).resolves.toEqual(NOW);
      await expect(revokedAt(third.id)).resolves.toEqual(NOW);
      await expect(revokedAt(alreadyRevoked.id)).resolves.toEqual(daysAgo(0.5));
      await expect(revokedAt(othersSession.id)).resolves.toBeNull();
    });

    it('CA-19: `revokeAllExcept(u, null)` revoca todas las de la cuenta y no toca otras cuentas', async () => {
      const userId = await insertClient();
      const first = await openSessionFor(userId);
      const second = await openSessionFor(userId);
      const othersSession = await openSession();
      await insertAll([first, second, othersSession]);

      await expect(repository.revokeAllExcept(userId, null, NOW)).resolves.toBe(2);

      await expect(revokedAt(first.id)).resolves.toEqual(NOW);
      await expect(revokedAt(second.id)).resolves.toEqual(NOW);
      await expect(revokedAt(othersSession.id)).resolves.toBeNull();
    });
  });
});
