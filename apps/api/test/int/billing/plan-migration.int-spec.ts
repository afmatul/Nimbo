import { DataSource } from 'typeorm';

import { CrearTablaPlan20260928233000 } from '../../../src/migrations/20260928233000-crear-tabla-plan';
import { SembrarPlanes20260928233500 } from '../../../src/migrations/20260928233500-sembrar-planes';
import { buildDataSourceOptions } from '../../../src/shared';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';

interface PlanRow {
  id: string;
  nombre: string;
  slug: string;
  precio_centavos: string | number;
  cuota_bytes: string;
  max_archivo_bytes: string;
  max_editores: string | number;
  consultas_agente_mensual: string | number;
  versiones_retenidas: string | number;
  dias_retencion_papelera: string | number;
}

/**
 * CA-7 no puede hacer `undoLastMigration` sobre la base compartida: las migraciones de 005 quedaron después
 * de las de `plan`. Esta suite usa una base nueva, como dueño, y revierte solo las dos migraciones de 006a.
 */
describe('Migraciones de la tabla plan (CA-1, CA-7, CA-9, RN-1, RN-2)', () => {
  const databaseName = `nimbo_plan_${String(process.pid)}_${String(Date.now())}`;
  let owner: DataSource;
  let fresh: DataSource;

  beforeAll(async () => {
    owner = await connectAsOwner();
    await owner.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(requiredEnv('DATABASE_MIGRATION_URL'));
    url.pathname = `/${databaseName}`;
    fresh = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: url.toString() }),
    ).initialize();
    await fresh.runMigrations({ transaction: 'each' });
  });

  afterAll(async () => {
    await fresh?.destroy();
    await owner?.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await owner?.destroy();
  });

  it('CA-1, CA-9: siembra los cuatro planes con UUID fijos y valores exactos', async () => {
    const rows = (await fresh.query(
      'SELECT * FROM plan ORDER BY precio_centavos ASC',
    )) as PlanRow[];
    expect(rows).toHaveLength(4);

    const personal = rows.find((row) => row.slug === 'personal');
    expect(personal).toMatchObject({
      id: '10000000-0000-4000-8000-000000000001',
      nombre: 'Personal',
      cuota_bytes: '15000000000',
      max_archivo_bytes: '50000000',
    });
    expect(Number(personal?.precio_centavos)).toBe(0);
    expect(Number(personal?.max_editores)).toBe(0);
    expect(Number(personal?.consultas_agente_mensual)).toBe(20);
    expect(Number(personal?.versiones_retenidas)).toBe(3);
    expect(Number(personal?.dias_retencion_papelera)).toBe(7);

    const pro = rows.find((row) => row.slug === 'pro');
    expect(pro).toMatchObject({
      id: '10000000-0000-4000-8000-000000000002',
      nombre: 'Pro',
      cuota_bytes: '100000000000',
      max_archivo_bytes: '500000000',
    });
    expect(Number(pro?.precio_centavos)).toBe(4500);
    expect(Number(pro?.max_editores)).toBe(3);
    expect(Number(pro?.consultas_agente_mensual)).toBe(500);
    expect(Number(pro?.versiones_retenidas)).toBe(30);
    expect(Number(pro?.dias_retencion_papelera)).toBe(30);

    const equipo = rows.find((row) => row.slug === 'equipo');
    expect(equipo).toMatchObject({
      id: '10000000-0000-4000-8000-000000000003',
      nombre: 'Equipo',
      cuota_bytes: '350000000000',
      max_archivo_bytes: '1000000000',
    });
    expect(Number(equipo?.precio_centavos)).toBe(11000);
    expect(Number(equipo?.max_editores)).toBe(5);
    expect(Number(equipo?.consultas_agente_mensual)).toBe(2000);
    expect(Number(equipo?.versiones_retenidas)).toBe(60);
    expect(Number(equipo?.dias_retencion_papelera)).toBe(60);

    const institucional = rows.find((row) => row.slug === 'institucional');
    expect(institucional).toMatchObject({
      id: '10000000-0000-4000-8000-000000000004',
      nombre: 'Institucional',
      cuota_bytes: '2000000000000',
      max_archivo_bytes: '2000000000',
    });
    expect(Number(institucional?.precio_centavos)).toBe(45000);
    expect(Number(institucional?.max_editores)).toBe(5);
    expect(Number(institucional?.consultas_agente_mensual)).toBe(10000);
    expect(Number(institucional?.versiones_retenidas)).toBe(100);
    expect(Number(institucional?.dias_retencion_papelera)).toBe(90);
  });

  it('CA-7: down de la semilla y de la tabla elimina plan, y up lo restaura', async () => {
    const runner = fresh.createQueryRunner();
    await runner.connect();
    try {
      await new SembrarPlanes20260928233500().down(runner);
      const [afterSeed] = (await runner.query('SELECT COUNT(*)::int AS count FROM plan')) as {
        count: number;
      }[];
      expect(afterSeed?.count).toBe(0);

      await new CrearTablaPlan20260928233000().down(runner);
      const [tableExists] = (await runner.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'plan'
         ) AS exists`,
      )) as { exists: boolean }[];
      expect(tableExists?.exists).toBe(false);

      await new CrearTablaPlan20260928233000().up(runner);
      await new SembrarPlanes20260928233500().up(runner);
      const [restored] = (await runner.query('SELECT COUNT(*)::int AS count FROM plan')) as {
        count: number;
      }[];
      expect(restored?.count).toBe(4);
    } finally {
      await runner.release();
    }
  });
});
