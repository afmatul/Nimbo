import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { DataSource } from 'typeorm';

import { OpaqueToken } from '../../../src/modules/identity/domain/opaque-token.vo';
import { VerificationToken } from '../../../src/modules/identity/domain/verification-token.entity';
import type { VerificationTokenType } from '../../../src/modules/identity/domain/verification-token.entity';
import { TokenCuentaOrmEntity } from '../../../src/modules/identity/infrastructure/persistence/token-cuenta.orm-entity';
import { TypeormVerificationTokenRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-verification-token.repository';
import { buildDataSourceOptions } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const TTL_MS = 24 * MS_PER_HOUR;
/** Tiempo que la primera transacción retiene la fila para que la segunda tenga que esperarla. */
const HOLD_MS = 300;

interface TokenRow {
  usado_en: Date | null;
  invalidado_en: Date | null;
}

/** Aviso de una transacción a la otra: fija el orden sin depender de un `sleep`. */
const signal = (): { fire: () => void; fired: Promise<void> } => {
  let fire = (): void => undefined;
  const fired = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { fire, fired };
};

const aToken = (
  userId: string,
  type: VerificationTokenType = 'verificacion',
  createdAt = new Date(NOW.getTime() - MS_PER_HOUR),
  tokenHash = OpaqueToken.generate().hash(),
): VerificationToken =>
  VerificationToken.issue({
    id: randomUUID(),
    userId,
    type,
    tokenHash,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + TTL_MS),
  });

/** `TypeormVerificationTokenRepository` sobre Postgres real (plan §6.3 y §6.4; CA-10 a CA-12, CA-29 d). */
describe('TypeormVerificationTokenRepository (CA-10, CA-11, CA-12, CA-29)', () => {
  let dataSource: DataSource;
  let runner: TypeOrmTransactionRunner;
  let repository: TypeormVerificationTokenRepository;

  const insertClient = async (): Promise<string> => {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, version_terminos, version_privacidad,
         terminos_aceptados_en)
       VALUES ($1, 'Ana López', $2, '$argon2id$prueba', 'CLIENT', '1.0', '1.0', $3)`,
      [id, `ana-${id}@nimbo.me`, NOW],
    );
    return id;
  };

  const readRow = async (id: string): Promise<TokenRow | undefined> => {
    const rows = (await dataSource.query(
      'SELECT usado_en, invalidado_en FROM token_cuenta WHERE id = $1',
      [id],
    )) as TokenRow[];
    return rows[0];
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
      entities: [TokenCuentaOrmEntity],
    });
    await dataSource.initialize();
    const context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    repository = new TypeormVerificationTokenRepository(context);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CA-10: `insert` guarda el token y `findByHash` lo devuelve con sus fechas', async () => {
    const token = aToken(await insertClient());

    await runner.run(() => repository.insert(token));
    const found = await repository.findByHash(token.tokenHash, 'verificacion');

    expect(found).toEqual(token);
    expect(found?.stateAt(NOW)).toBe('valid');
  });

  it('CA-12: `findByHash` de verificación no encuentra un token de recuperación con el mismo hash', async () => {
    const token = aToken(await insertClient(), 'recuperacion');
    await runner.run(() => repository.insert(token));

    await expect(repository.findByHash(token.tokenHash, 'verificacion')).resolves.toBeNull();
    await expect(repository.findByHash(token.tokenHash, 'recuperacion')).resolves.toEqual(token);
  });

  it('CA-11: `invalidateActive` marca solo el token sin cerrar de la cuenta y el tipo', async () => {
    const userId = await insertClient();
    const other = await insertClient();
    const used = aToken(userId, 'verificacion', new Date(NOW.getTime() - 2 * MS_PER_HOUR));
    const recovery = aToken(userId, 'recuperacion');
    const othersToken = aToken(other);
    await runner.run(async () => {
      await repository.insert(used);
      await repository.consume(used.id, NOW);
      await repository.insert(recovery);
      await repository.insert(othersToken);
    });
    const active = aToken(userId);
    await runner.run(() => repository.insert(active));

    await runner.run(() => repository.invalidateActive(userId, 'verificacion', NOW));

    await expect(readRow(active.id)).resolves.toEqual({ usado_en: null, invalidado_en: NOW });
    await expect(readRow(used.id)).resolves.toEqual({ usado_en: NOW, invalidado_en: null });
    await expect(readRow(recovery.id)).resolves.toEqual({ usado_en: null, invalidado_en: null });
    await expect(readRow(othersToken.id)).resolves.toEqual({ usado_en: null, invalidado_en: null });
  });

  it('CA-11: `invalidateActive` también cierra un token vencido sin usar, así cabe el enlace nuevo', async () => {
    const userId = await insertClient();
    const expired = aToken(userId, 'verificacion', new Date(NOW.getTime() - 2 * TTL_MS));
    await runner.run(() => repository.insert(expired));

    await runner.run(async () => {
      await repository.invalidateActive(userId, 'verificacion', NOW);
      await repository.insert(aToken(userId));
    });

    await expect(readRow(expired.id)).resolves.toEqual({ usado_en: null, invalidado_en: NOW });
  });

  it('CA-29: dos `consume` concurrentes del mismo token: exactamente uno devuelve `true`', async () => {
    const token = aToken(await insertClient());
    await runner.run(() => repository.insert(token));
    const consumedFirst = signal();

    const first = runner.run(async () => {
      const consumed = await repository.consume(token.id, NOW);
      consumedFirst.fire();
      await sleep(HOLD_MS);
      return consumed;
    });
    await consumedFirst.fired;
    const second = runner.run(() => repository.consume(token.id, NOW));

    await expect(Promise.all([first, second])).resolves.toEqual([true, false]);
    await expect(readRow(token.id)).resolves.toEqual({ usado_en: NOW, invalidado_en: null });
  });

  it.each([
    [
      'vencido',
      (userId: string) => aToken(userId, 'verificacion', new Date(NOW.getTime() - 2 * TTL_MS)),
    ],
    ['invalidado', (userId: string) => aToken(userId)],
  ])('CA-11: `consume` de un token %s devuelve `false`', async (state, build) => {
    const userId = await insertClient();
    const token = build(userId);
    await runner.run(async () => {
      await repository.insert(token);
      if (state === 'invalidado') {
        await repository.invalidateActive(userId, 'verificacion', NOW);
      }
    });

    await expect(runner.run(() => repository.consume(token.id, NOW))).resolves.toBe(false);
    await expect(readRow(token.id)).resolves.toMatchObject({ usado_en: null });
  });
});
