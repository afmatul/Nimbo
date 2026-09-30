import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { Device } from '../../../src/modules/identity/domain/device.entity';
import { OpaqueToken } from '../../../src/modules/identity/domain/opaque-token.vo';
import { DispositivoOrmEntity } from '../../../src/modules/identity/infrastructure/persistence/dispositivo.orm-entity';
import { TypeOrmDeviceRepository } from '../../../src/modules/identity/infrastructure/persistence/typeorm-device.repository';
import { buildDataSourceOptions, TransactionContext } from '../../../src/shared';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';

import { aClient } from './identity-rows';

const FIRST_SEEN = new Date('2026-09-30T14:00:00.000Z');
const LATER = new Date('2026-10-01T08:30:00.000Z');
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';

interface DeviceRow {
  id: string;
  agente_usuario: string;
  ultima_ip: string | null;
  ultimo_acceso: Date;
}

/** `TypeOrmDeviceRepository` sobre Postgres real (plan §6.4, DT-19; CA-16, CA-17). */
describe('TypeOrmDeviceRepository (CA-16, CA-17)', () => {
  let dataSource: DataSource;
  let runner: TypeOrmTransactionRunner;
  let repository: TypeOrmDeviceRepository;

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

  const deviceRows = async (userId: string): Promise<DeviceRow[]> =>
    (await dataSource.query(
      `SELECT id, agente_usuario, host(ultima_ip) AS ultima_ip, ultimo_acceso
         FROM dispositivo WHERE usuario_id = $1`,
      [userId],
    )) as DeviceRow[];

  const aDevice = (
    userId: string,
    secretHash: string,
    patch: { userAgent?: string; ip?: string | null; now?: Date } = {},
  ): Device =>
    Device.register({
      id: randomUUID(),
      userId,
      secretHash,
      userAgent: patch.userAgent ?? FIREFOX,
      ip: patch.ip === undefined ? '203.0.113.7' : patch.ip,
      now: patch.now ?? FIRST_SEEN,
    });

  beforeAll(async () => {
    dataSource = new DataSource({
      ...buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
      entities: [DispositivoOrmEntity],
    });
    await dataSource.initialize();
    const context = new TransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    repository = new TypeOrmDeviceRepository(context);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('CA-16: la primera vez la huella es nueva y guarda la fila', async () => {
    const userId = await insertClient();
    const device = aDevice(userId, OpaqueToken.generate().hash());

    const result = await runner.run(() => repository.upsertSeen(device));

    expect(result).toEqual({ deviceId: device.id, isNew: true });
    await expect(deviceRows(userId)).resolves.toEqual([
      {
        id: device.id,
        agente_usuario: FIREFOX,
        ultima_ip: '203.0.113.7',
        ultimo_acceso: FIRST_SEEN,
      },
    ]);
  });

  it('CA-17: con la misma huella no es nueva, conserva el id y actualiza acceso, agente e IP', async () => {
    const userId = await insertClient();
    const hash = OpaqueToken.generate().hash();
    const first = aDevice(userId, hash);
    await runner.run(() => repository.upsertSeen(first));

    const again = aDevice(userId, hash, { userAgent: EDGE, ip: '2001:db8::1', now: LATER });
    const result = await runner.run(() => repository.upsertSeen(again));

    expect(result).toEqual({ deviceId: first.id, isNew: false });
    await expect(deviceRows(userId)).resolves.toEqual([
      { id: first.id, agente_usuario: EDGE, ultima_ip: '2001:db8::1', ultimo_acceso: LATER },
    ]);
  });

  it('CA-16: la misma huella en otra cuenta es otro dispositivo', async () => {
    const hash = OpaqueToken.generate().hash();
    const ana = await insertClient();
    const luis = await insertClient();
    await runner.run(() => repository.upsertSeen(aDevice(ana, hash)));

    const result = await runner.run(() => repository.upsertSeen(aDevice(luis, hash)));

    expect(result.isNew).toBe(true);
    await expect(deviceRows(ana)).resolves.toHaveLength(1);
    await expect(deviceRows(luis)).resolves.toHaveLength(1);
  });

  it('CA-16: dos `upsertSeen` simultáneos con la misma huella dejan una fila y un solo `isNew`', async () => {
    const userId = await insertClient();
    const hash = OpaqueToken.generate().hash();

    const results = await Promise.all([
      runner.run(() => repository.upsertSeen(aDevice(userId, hash))),
      runner.run(() => repository.upsertSeen(aDevice(userId, hash))),
    ]);

    expect(results.filter((result) => result.isNew)).toHaveLength(1);
    expect(new Set(results.map((result) => result.deviceId)).size).toBe(1);
    await expect(deviceRows(userId)).resolves.toHaveLength(1);
  });
});
