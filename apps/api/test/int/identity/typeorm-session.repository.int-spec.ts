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

/** `TypeOrmSessionRepository` sobre Postgres real (plan §4 y §6.4; CA-7, CA-9). */
describe('TypeOrmSessionRepository (CA-7, CA-9)', () => {
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

  const openSession = async (openedAt: Date = daysAgo(1)): Promise<Session> => {
    const userId = await insertClient();
    return Session.open({
      id: randomUUID(),
      userId,
      deviceId: await insertDevice(userId),
      secretHash: OpaqueToken.generate().hash(),
      now: openedAt,
      maxLifetime: MAX_LIFETIME_MS,
    });
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
});
