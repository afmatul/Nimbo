import type { DataSource, QueryRunner } from 'typeorm';

import { TypeOrmPlanRepository } from '../../../src/modules/billing/infrastructure/persistence/typeorm-plan.repository';
import type { TransactionContext } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { inRolledBackTransaction } from '../storage/storage-test-db';

/** Mismo precio que `pro` en la semilla: el desempate por `slug` es lo único que decide su lugar. */
const TIED_PRICE_CENTS = 4500;

const insertPlanPricedAt = (runner: QueryRunner, slug: string): Promise<unknown> =>
  runner.query(
    `INSERT INTO plan (nombre, slug, precio_centavos, cuota_bytes, max_archivo_bytes, max_editores,
                       consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera)
     VALUES ($1, $2, $3, 1073741824, 52428800, 0, 0, 1, 1)`,
    [slug, slug, TIED_PRICE_CENTS],
  );

describe('TypeOrmPlanRepository.findActive contra Postgres (008 CA-1, RN-2)', () => {
  let owner: DataSource;

  beforeAll(async () => {
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await owner?.destroy();
  });

  it('RN-2: con el mismo precio_centavos ordena por slug, no por orden de inserción', async () => {
    const slugs = await inRolledBackTransaction(owner, async (runner) => {
      await insertPlanPricedAt(runner, 'pro-anual');
      await insertPlanPricedAt(runner, 'plus');
      const context = { manager: () => runner.manager } as unknown as TransactionContext;
      return (await new TypeOrmPlanRepository(context).findActive()).map(({ slug }) => slug);
    });

    expect(slugs).toEqual(['personal', 'plus', 'pro', 'pro-anual', 'equipo', 'institucional']);
  });
});
