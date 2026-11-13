import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import { CrearMiniaturaDeDocumento20261112100000 } from '../../../src/migrations/20261112100000-crear-miniatura-de-documento';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

import type { IndexedVersionRow } from './intelligence-test-db';

/**
 * Migración de `miniatura` (extracto de texto de un `.docx`) sobre el Postgres del arnés: esquema, reversibilidad y
 * RLS (solo la propietaria; ni otro cliente ni un rol interno leen o escriben contenido de archivos ajenos).
 */
const migration = new CrearMiniaturaDeDocumento20261112100000();

const insertThumbnail = (
  manager: EntityManager | QueryRunner,
  version: IndexedVersionRow,
  text = 'Acta de reunión',
): Promise<unknown> =>
  manager.query(
    `INSERT INTO miniatura (id, archivo_id, version_archivo_id, texto, creado_en)
     VALUES (gen_random_uuid(), $1, $2, $3, now())`,
    [version.fileId, version.versionId, text],
  );

const countThumbnails = async (manager: EntityManager | DataSource): Promise<number> => {
  const [row] = (await manager.query('SELECT count(*)::int AS n FROM miniatura')) as {
    n: number;
  }[];
  return row?.n ?? 0;
};

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

describe('esquema de `miniatura`', () => {
  it('una versión tiene un solo extracto y este no pasa de 600 caracteres', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await insertFileWithVersion(runner, await insertAccount(runner));
        await insertThumbnail(runner, version);
        await insertThumbnail(runner, version);
      }),
    ).rejects.toThrow(/uq_miniatura_version/);
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await insertFileWithVersion(runner, await insertAccount(runner));
        await insertThumbnail(runner, version, 'x'.repeat(601));
      }),
    ).rejects.toThrow(/ck_miniatura_texto/);
  });

  it('guarda «sin texto» como NULL, pero no un texto vacío', async () => {
    await inRolledBackTransaction(owner, async (runner) => {
      const version = await insertFileWithVersion(runner, await insertAccount(runner));
      await runner.query(
        `INSERT INTO miniatura (id, archivo_id, version_archivo_id, texto, creado_en)
         VALUES (gen_random_uuid(), $1, $2, NULL, now())`,
        [version.fileId, version.versionId],
      );
      expect(await countThumbnails(runner.manager)).toBe(1);
    });
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const version = await insertFileWithVersion(runner, await insertAccount(runner));
        await insertThumbnail(runner, version, '');
      }),
    ).rejects.toThrow(/ck_miniatura_texto/);
  });

  it('borrar el archivo borra su extracto', async () => {
    const left = await inRolledBackTransaction(owner, async (runner) => {
      const version = await insertFileWithVersion(runner, await insertAccount(runner));
      await insertThumbnail(runner, version);
      await runner.query('DELETE FROM archivo WHERE id = $1', [version.fileId]);
      return countThumbnails(runner.manager);
    });
    expect(left).toBe(0);
  });

  it('es reversible: down quita la tabla y up la devuelve', async () => {
    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const exists = async (): Promise<boolean> =>
        (
          (await runner.query("SELECT to_regclass('miniatura') IS NOT NULL AS ok")) as {
            ok: boolean;
          }[]
        )[0]?.ok ?? false;
      const down = await exists();
      await migration.up(runner);
      return [down, await exists()];
    });
    expect(afterDown).toBe(false);
    expect(afterUp).toBe(true);
  });
});

describe('RLS de `miniatura` (aislamiento)', () => {
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  let anaVersion: IndexedVersionRow;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];

  beforeAll(async () => {
    app = await connectAsAppDatabase();
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      admin: await insertAccount(manager, Role.ADMIN),
      support: await insertAccount(manager, Role.SUPPORT),
      operator: await insertAccount(manager, Role.OPERATOR),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    internals[Role.ADMIN] = createActor(accounts.admin, Role.ADMIN);
    internals[Role.SUPPORT] = createActor(accounts.support, Role.SUPPORT);
    internals[Role.OPERATOR] = createActor(accounts.operator, Role.OPERATOR);
    anaVersion = await app.asActor(ana, async (manager) => {
      const version = await insertFileWithVersion(manager, ana.id);
      await insertThumbnail(manager, version);
      return version;
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  it('tiene RLS habilitada y forzada, con solo lectura e inserción de la propietaria', async () => {
    const [rls] = (await owner.query(
      "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = 'miniatura'::regclass",
    )) as { enabled: boolean; forced: boolean }[];
    const policies = (await owner.query(
      "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'miniatura' ORDER BY policyname",
    )) as { policyname: string; cmd: string }[];
    expect(rls).toEqual({ enabled: true, forced: true });
    expect(policies).toEqual([
      { policyname: 'miniatura_alta', cmd: 'INSERT' },
      { policyname: 'miniatura_lectura', cmd: 'SELECT' },
    ]);
  });

  it('la propietaria ve el extracto de su archivo; otro cliente no ve nada', async () => {
    await expect(app.asActor(ana, countThumbnails)).resolves.toBe(1);
    await expect(app.asActor(bruno, countThumbnails)).resolves.toBe(0);
  });

  it('un cliente no escribe el extracto de un archivo ajeno (WITH CHECK)', async () => {
    await expect(
      app.asActor(bruno, (manager) => insertThumbnail(manager, anaVersion, 'otro')),
    ).rejects.toThrow(/row-level security/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    '%s no ve el contenido de ningún archivo en `miniatura`',
    async (role) => {
      await expect(app.asActor(internals[role], countThumbnails)).resolves.toBe(0);
    },
  );

  it('ni la propietaria modifica o borra un extracto (menor privilegio): solo lo lee e inserta', async () => {
    const touched = await app.asActor(ana, async (manager) => {
      const updated = (await manager.query("UPDATE miniatura SET texto = 'otro'")) as [
        unknown[],
        number,
      ];
      const deleted = (await manager.query('DELETE FROM miniatura')) as [unknown[], number];
      return [updated[1], deleted[1]];
    });
    expect(touched).toEqual([0, 0]);
    await expect(app.asActor(ana, countThumbnails)).resolves.toBe(1);
  });

  it('`nimbo_app` sin actor no ve filas', async () => {
    await expect(countThumbnails(app.dataSource)).resolves.toBe(0);
  });
});
