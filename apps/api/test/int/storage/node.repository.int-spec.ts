import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import { InvalidQueryError } from '../../../src/modules/storage/domain/errors';
import { File } from '../../../src/modules/storage/domain/file';
import { FileName } from '../../../src/modules/storage/domain/file-name.vo';
import { FileVersion } from '../../../src/modules/storage/domain/file-version';
import { ObjectKey } from '../../../src/modules/storage/domain/object-key';
import { TypeOrmNodeRepository } from '../../../src/modules/storage/infrastructure/persistence/typeorm-node.repository';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { connectAsOwner } from '../../support/database-urls';

import { connectAsAppDatabase, insertAccount, removeAccounts } from './storage-test-db';
import type { AppDatabase } from './storage-test-db';

const MINUTE_MS = 60_000;
const BASE_TIME = new Date('2026-09-30T10:00:00.000Z').getTime();
const HUGE_SIZE = 9_007_199_254_740_993n;
/** Rama de propiedad de `accessibleNodes` tal como llega a Postgres (parámetro ya numerado). */
const OWNERSHIP_BRANCH =
  /FROM archivo a WHERE a\.propietario_id = \$\d+ AND a\.eliminado_en IS NULL/;
const OWNER_INDEXES = /idx_archivo_(carpeta|raiz)_creado|uq_archivo_hermanos_nombre/;

interface CapturedQuery {
  readonly sql: string;
  readonly parameters: unknown[];
}

/** Archivo de `owner` con su versión, creado en el minuto `minute` desde `BASE_TIME` (el orden lo fija la prueba). */
const aFile = (owner: Actor, name: string, minute: number): [File, FileVersion] => {
  const id = randomUUID();
  const versionId = randomUUID();
  const now = new Date(BASE_TIME + minute * MINUTE_MS);
  const file = File.create({
    id,
    ownerId: owner.id,
    folderId: null,
    name: FileName.of(name),
    kind: 'pdf',
    sizeBytes: HUGE_SIZE,
    currentVersionId: versionId,
    now,
  });
  const version = FileVersion.fromUpload({
    id: versionId,
    fileId: id,
    objectKey: ObjectKey.of(owner.id, id, versionId),
    sizeBytes: HUGE_SIZE,
    createdBy: owner.id,
    now,
  });
  return [file, version];
};

/** SQL que el repositorio manda a Postgres dentro de `work` (el `QueryRunner` de la transacción del actor). */
const captureQueries = async (
  manager: EntityManager,
  work: () => Promise<unknown>,
): Promise<CapturedQuery[]> => {
  const runner = manager.queryRunner;
  if (runner === undefined) throw new Error('withActor no abrió un QueryRunner');
  const spy = jest.spyOn(runner, 'query');
  try {
    await work();
    return spy.mock.calls.map(([sql, parameters]) => ({ sql, parameters: parameters ?? [] }));
  } finally {
    spy.mockRestore();
  }
};

/**
 * `EXPLAIN` del SQL capturado, con el recorrido secuencial desalentado para que la tabla chica no lo esconda. También
 * se desactiva el *index scan* simple: con `archivo` casi vacía el planificador podía recorrer `archivo_pkey` entero
 * filtrando por propietario (prueba inestable). Un *bitmap scan* necesita una condición de índice, así que solo puede
 * resolver `propietario_id = $n` con los índices de propietario.
 */
const planOf = async (manager: EntityManager, query: CapturedQuery): Promise<string> => {
  await manager.query('SET LOCAL enable_seqscan = off');
  await manager.query('SET LOCAL enable_indexscan = off');
  const rows = (await manager.query(`EXPLAIN ${query.sql}`, query.parameters)) as {
    'QUERY PLAN': string;
  }[];
  return rows.map((row) => row['QUERY PLAN']).join('\n');
};

const byNewestFirst = (a: File, b: File): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);

/** `INodeRepository` sobre Postgres como `nimbo_app` dentro de `withActor` (plan §6 «Puertos», D-17). */
describe('TypeOrmNodeRepository (CA-13, CA-16)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmNodeRepository;
  let ana: Actor;
  let bruno: Actor;
  let admin: Actor;
  const created: string[] = [];
  const anaFiles: File[] = [];
  let brunoFile: File;
  let trashedId: string;

  const insertAll = (actor: Actor, pairs: readonly [File, FileVersion][]): Promise<void> =>
    app.asActor(actor, async () => {
      for (const [file, version] of pairs) {
        await repository.insertWithVersion(actor, file, version);
      }
    });

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmNodeRepository(app.context);
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      admin: await insertAccount(manager, Role.ADMIN),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    admin = createActor(accounts.admin, Role.ADMIN);

    const anaPairs = [
      aFile(ana, 'Plan.pdf', 1),
      aFile(ana, 'plan (1).PDF', 2),
      aFile(ana, 'Planes.pdf', 3),
      aFile(ana, 'informe.pdf', 3),
    ];
    const trashed = aFile(ana, 'plan (3).pdf', 5);
    const brunos = aFile(bruno, 'plan (2).pdf', 4);
    await insertAll(ana, [...anaPairs, trashed]);
    await insertAll(bruno, [brunos]);
    anaFiles.push(...anaPairs.map(([file]) => file));
    brunoFile = brunos[0];
    trashedId = trashed[0].id;
    await app.asActor(ana, (manager) =>
      manager.query('UPDATE archivo SET eliminado_en = now(), purgar_en = now() WHERE id = $1', [
        trashedId,
      ]),
    );
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  describe('insertWithVersion', () => {
    it('CA-1: guarda `archivo` y su `version_archivo` con bytes exactos y la clave `u/{propietario}/{archivo}/{version}`', async () => {
      const file = anaFiles[0] as File;

      const [row] = (await owner.query(
        `SELECT a.tamano_bytes::text AS archivo, v.tamano_bytes::text AS version, v.clave_objeto, v.origen
           FROM archivo a JOIN version_archivo v ON v.id = a.version_actual_id WHERE a.id = $1`,
        [file.id],
      )) as { archivo: string; version: string; clave_objeto: string; origen: string }[];

      expect(row).toEqual({
        archivo: HUGE_SIZE.toString(),
        version: HUGE_SIZE.toString(),
        clave_objeto: `u/${ana.id}/${file.id}/${file.currentVersionId}`,
        origen: 'carga',
      });
    });

    it('CA-16: un cliente no puede insertar un archivo a nombre de otro', async () => {
      const [file, version] = aFile(bruno, 'ajeno.pdf', 9);

      await expect(
        app.asActor(ana, () => repository.insertWithVersion(ana, file, version)),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe('findAccessibleById', () => {
    it('CA-13: devuelve el archivo propio como entidad de dominio, con `bigint` exacto', async () => {
      const file = anaFiles[0] as File;

      const found = await app.asActor(ana, () => repository.findAccessibleById(ana, file.id));

      expect(found?.snapshot()).toEqual(file.snapshot());
      expect(found?.sizeBytes).toBe(HUGE_SIZE);
    });

    it.each([
      ['ajeno', (): string => brunoFile.id],
      ['en la papelera', (): string => trashedId],
      ['inexistente', (): string => randomUUID()],
    ])('CA-16: un archivo %s es `null`', async (_, idOf) => {
      await expect(
        app.asActor(ana, () => repository.findAccessibleById(ana, idOf())),
      ).resolves.toBeNull();
    });

    it('CA-16: un rol interno no obtiene el archivo aunque la RLS le deje leer metadatos', async () => {
      await expect(
        app.asActor(admin, () => repository.findAccessibleById(admin, brunoFile.id)),
      ).resolves.toBeNull();
    });

    it('CA-16: fuera de `withActor` lanza `ActorScopeMissingError`', async () => {
      await expect(repository.findAccessibleById(ana, brunoFile.id)).rejects.toBeInstanceOf(
        ActorScopeMissingError,
      );
    });
  });

  describe('listAccessible', () => {
    it('CA-1: raíz sin papelera ni archivos ajenos, `creado_en DESC, id DESC`, página a página con cursor', async () => {
      const expected = [...anaFiles].sort(byNewestFirst).map((file) => file.id);

      const [first, second] = await app.asActor(ana, async () => {
        const firstPage = await repository.listAccessible(ana, { limit: 3 });
        const secondPage = await repository.listAccessible(ana, {
          limit: 3,
          cursor: firstPage.nextCursor ?? '',
        });
        return [firstPage, secondPage];
      });

      expect(first.items.map((file) => file.id)).toEqual(expected.slice(0, 3));
      expect(first.nextCursor).not.toBeNull();
      expect(second.items.map((file) => file.id)).toEqual(expected.slice(3));
      expect(second.nextCursor).toBeNull();
    });

    it('CA-1: una página exacta no promete otra (`nextCursor` nulo)', async () => {
      const page = await app.asActor(ana, () =>
        repository.listAccessible(ana, { limit: anaFiles.length }),
      );

      expect(page.items).toHaveLength(anaFiles.length);
      expect(page.nextCursor).toBeNull();
    });

    it('CA-16: un rol interno recibe la lista vacía', async () => {
      const page = await app.asActor(admin, () => repository.listAccessible(admin, { limit: 50 }));

      expect(page).toEqual({ items: [], nextCursor: null });
    });

    it('CA-7: un cursor que no emitió el repositorio es `InvalidQueryError`', async () => {
      await expect(
        app.asActor(ana, () => repository.listAccessible(ana, { limit: 3, cursor: 'basura' })),
      ).rejects.toBeInstanceOf(InvalidQueryError);
    });
  });

  describe('findTakenNames', () => {
    it('CA-6: devuelve el nombre y sus copias «(n)» sin distinguir mayúsculas, sin papelera ni ajenos', async () => {
      const taken = await app.asActor(ana, () =>
        repository.findTakenNames(ana, FileName.of('PLAN.pdf'), null),
      );

      expect([...taken].sort()).toEqual(['Plan.pdf', 'plan (1).PDF']);
      expect(FileName.of('PLAN.pdf').firstFree(taken).value).toBe('PLAN (2).pdf');
    });

    it('CA-6: los comodines de `LIKE` del nombre se tratan como texto', async () => {
      const taken = await app.asActor(ana, () =>
        repository.findTakenNames(ana, FileName.of('P_an%.pdf'), null),
      );

      expect(taken).toEqual([]);
    });

    it('CA-6: un nombre sin extensión busca sus copias «base (n)»', async () => {
      const [file, version] = aFile(ana, 'notas', 6);
      const [copy, copyVersion] = aFile(ana, 'Notas (1)', 7);

      const taken = await app.asActor(ana, async (manager) => {
        await repository.insertWithVersion(ana, file, version);
        await repository.insertWithVersion(ana, copy, copyVersion);
        const names = await repository.findTakenNames(ana, FileName.of('NOTAS'), null);
        await manager.query('DELETE FROM archivo WHERE id = ANY($1)', [[file.id, copy.id]]);
        return names;
      });

      expect([...taken].sort()).toEqual(['Notas (1)', 'notas']);
    });
  });

  describe('consultas con `accessibleNodes(actor)` y sus índices (ADR-0005)', () => {
    it('CA-16: toda lectura une el fragmento de `access` en la misma consulta, con el id del actor', async () => {
      const reads = [
        (): Promise<unknown> => repository.findAccessibleById(ana, brunoFile.id),
        (): Promise<unknown> => repository.listAccessible(ana, { limit: 3 }),
        (): Promise<unknown> => repository.findTakenNames(ana, FileName.of('Plan.pdf'), null),
      ];

      for (const read of reads) {
        const queries = await app.asActor(ana, (manager) => captureQueries(manager, read));
        expect(queries).toHaveLength(1);
        expect(queries[0]?.sql).toMatch(OWNERSHIP_BRANCH);
        expect(queries[0]?.parameters).toContain(ana.id);
      }
    });

    it.each([
      ['el listado', (): Promise<unknown> => repository.listAccessible(ana, { limit: 50 })],
      [
        'la búsqueda de nombres',
        (): Promise<unknown> => repository.findTakenNames(ana, FileName.of('Plan.pdf'), null),
      ],
    ])('ADR-0005: el plan de %s usa los índices de propietario de `archivo`', async (_, read) => {
      const plan = await app.asActor(ana, async (manager) => {
        const [query] = await captureQueries(manager, read);
        return planOf(manager, query as CapturedQuery);
      });

      expect(plan).toMatch(OWNER_INDEXES);
      expect(plan).not.toMatch(/Seq Scan on archivo/);
    });
  });
});
