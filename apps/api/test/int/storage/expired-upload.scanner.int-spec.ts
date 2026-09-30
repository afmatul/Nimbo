import type { DataSource } from 'typeorm';

import { SqlExpiredUploadScanner } from '../../../src/modules/storage/infrastructure/persistence/sql-expired-upload.scanner';
import { connectAsOwner } from '../../support/database-urls';

import {
  connectAsAppDatabase,
  insertAccount,
  insertUpload,
  removeAccounts,
} from './storage-test-db';
import type { AppDatabase } from './storage-test-db';

const HOUR_MS = 60 * 60 * 1000;
const LIMIT = 1000;

/**
 * `IExpiredUploadScanner` contra Postgres como `nimbo_app` y **sin actor** (plan §6 «Puertos», D-6, ADR-0021): la
 * única lectura de `carga` sin `withActor`, a través de `carga_expiradas`.
 */
describe('SqlExpiredUploadScanner (CA-9, DF-52)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let scanner: SqlExpiredUploadScanner;
  let ownerId: string;
  const uploads: Record<'expired' | 'current' | 'completed' | 'cancelled', string> = {
    expired: '',
    current: '',
    completed: '',
    cancelled: '',
  };

  const scan = (now: Date, limit: number) =>
    app.runner.run(() => scanner.listExpiredIds(now, limit));

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    scanner = new SqlExpiredUploadScanner(app.context);
    const past = new Date(Date.now() - HOUR_MS);
    await owner.transaction(async (manager) => {
      ownerId = await insertAccount(manager);
      uploads.expired = await insertUpload(manager, ownerId, { expiresAt: past });
      uploads.current = await insertUpload(manager, ownerId);
      uploads.completed = await insertUpload(manager, ownerId, {
        state: 'completada',
        expiresAt: past,
      });
      uploads.cancelled = await insertUpload(manager, ownerId, {
        state: 'cancelada',
        expiresAt: past,
      });
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, [ownerId]);
    await owner.destroy();
  });

  it('CA-9: devuelve solo `{ id, propietarioId }` de las cargas activas vencidas', async () => {
    const rows = await scan(new Date(), LIMIT);

    expect(rows.filter((row) => row.propietarioId === ownerId)).toEqual([
      { id: uploads.expired, propietarioId: ownerId },
    ]);
  });

  it('CA-9: un `now` futuro no adelanta el reloj de la función (las vigentes no salen)', async () => {
    const rows = await scan(new Date(Date.now() + 365 * 24 * HOUR_MS), LIMIT);

    expect(rows.map((row) => row.id)).not.toContain(uploads.current);
  });

  it('CA-9: respeta el tope pedido', async () => {
    await expect(scan(new Date(), 1)).resolves.toHaveLength(1);
  });

  it('DF-52: `nimbo_app` sin actor no ve la carga vencida por consulta directa', async () => {
    const visible = (await app.runner.run(() =>
      app.context.manager().query('SELECT id FROM carga WHERE id = $1', [uploads.expired]),
    )) as unknown[];

    expect(visible).toEqual([]);
  });
});
