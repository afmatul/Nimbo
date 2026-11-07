import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';

import { FileIndexing } from '../../../src/modules/intelligence/domain/file-indexing';
import { SqlContentMatchReader } from '../../../src/modules/intelligence/infrastructure/persistence/sql-content-match.reader';
import { TypeOrmChunkRepository } from '../../../src/modules/intelligence/infrastructure/persistence/typeorm-chunk.repository';
import { TypeOrmIndexingRepository } from '../../../src/modules/intelligence/infrastructure/persistence/typeorm-indexing.repository';
import { ArchivoOrmEntity } from '../../../src/modules/storage/infrastructure/persistence/archivo.orm-entity';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

import { axisVector, insertChunk } from './intelligence-test-db';
import type { IndexedVersionRow } from './intelligence-test-db';

const NOW = new Date('2026-11-07T10:00:00.000Z');
/** Rutas de propiedad del *query builder* de `storage` (H-7), como las usa la búsqueda. */
const FILE_ID = 'archivo.id';
const VERSION_ID = 'archivo.versionActualId';

/**
 * `SqlContentMatchReader` contra el Postgres del arnés como `nimbo_app` (plan 018b D-2, §6): la semántica de la
 * coincidencia por contenido (RN-1) vive en `intelligence`. La condición se evalúa en una consulta de `archivo` como la
 * de `storage`, dentro de `withActor`. Cada cuenta es nueva por prueba.
 */
describe('SqlContentMatchReader (plan 018b D-2)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  const reader = new SqlContentMatchReader();
  const created: string[] = [];

  const account = async (): Promise<Actor> => {
    const id = await owner.transaction((manager) => insertAccount(manager, Role.CLIENT));
    created.push(id);
    return createActor(id, Role.CLIENT);
  };

  const fileOf = (actor: Actor): Promise<IndexedVersionRow> =>
    owner.transaction((manager) => insertFileWithVersion(manager, actor.id));

  /** Archivo con un fragmento por texto, en la versión vigente. */
  const fileWithText = async (actor: Actor, ...texts: string[]): Promise<IndexedVersionRow> => {
    const version = await fileOf(actor);
    await owner.transaction(async (manager) => {
      for (const [order, text] of texts.entries())
        await insertChunk(manager, version, { order, text });
    });
    return version;
  };

  const filesQuery = (
    manager: EntityManager,
    text: string,
  ): SelectQueryBuilder<ArchivoOrmEntity> => {
    const condition = reader.matchCondition({
      text,
      fileIdColumn: FILE_ID,
      versionIdColumn: VERSION_ID,
    });
    return manager
      .createQueryBuilder(ArchivoOrmEntity, 'archivo')
      .select('archivo.id', 'id')
      .where(condition.sql, condition.parameters);
  };

  const idsOf = async (query: SelectQueryBuilder<ArchivoOrmEntity>): Promise<string[]> =>
    (await query.orderBy('archivo.id').getRawMany<{ id: string }>()).map((row) => row.id);

  /** Archivos del actor cuya versión vigente coincide con `text`. */
  const matching = (actor: Actor, text: string): Promise<string[]> =>
    app.asActor(actor, (manager) => idsOf(filesQuery(manager, text)));

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-1: una palabra del texto indexado, escrita sin tilde, encuentra el archivo', async () => {
    const ana = await account();
    const acta = await fileWithText(ana, 'El camión llegó tarde');
    await fileWithText(ana, 'Acta de la asamblea general');

    await expect(matching(ana, 'camion')).resolves.toEqual([acta.fileId]);
  });

  it.each([['CAMIÓN'], ['camiones'], ['Camión']])(
    'CA-2: «%s» también lo encuentra (mayúsculas, tilde aguda y plural)',
    async (text) => {
      const ana = await account();
      const acta = await fileWithText(ana, 'El camión llegó tarde');

      await expect(matching(ana, text)).resolves.toEqual([acta.fileId]);
    },
  );

  it('CA-2: un trozo de palabra («camio») no lo encuentra por contenido', async () => {
    const ana = await account();
    await fileWithText(ana, 'El camión llegó tarde');

    await expect(matching(ana, 'camio')).resolves.toEqual([]);
  });

  it('RN-1: la ñ no se iguala a la n', async () => {
    const ana = await account();
    const balance = await fileWithText(ana, 'Balance del año fiscal');

    await expect(matching(ana, 'año')).resolves.toEqual([balance.fileId]);
    await expect(matching(ana, 'ano')).resolves.toEqual([]);
  });

  it('CA-3: todas las palabras deben estar en un mismo fragmento', async () => {
    const ana = await account();
    await fileWithText(ana, 'Página 2: presupuesto anual', 'Página 5: el camión de reparto');
    const together = await fileWithText(ana, 'El presupuesto del camión nuevo');

    await expect(matching(ana, 'camión presupuesto')).resolves.toEqual([together.fileId]);
  });

  it('CA-5: un texto solo de palabras vacías no coincide con nada y no falla', async () => {
    const ana = await account();
    await fileWithText(ana, 'De la casa a la oficina');

    await expect(matching(ana, 'de la')).resolves.toEqual([]);
  });

  it('CA-5: el texto es un parámetro, nunca SQL', async () => {
    const ana = await account();
    await fileWithText(ana, 'El camión llegó tarde');

    await expect(matching(ana, "camion') OR true --")).resolves.toEqual([]);
  });

  it('CA-7: una palabra que solo estaba en la versión anterior no encuentra el archivo', async () => {
    const ana = await account();
    const acta = await fileWithText(ana, 'El camión llegó tarde');
    await owner.transaction(async (manager) => {
      const versionId = randomUUID();
      await manager.query(
        `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
         VALUES ($1, $2, 'carga', $3, 10, $4, now(), 2)`,
        [versionId, acta.fileId, `u/${ana.id}/${acta.fileId}/${versionId}`, ana.id],
      );
      await manager.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
        versionId,
        acta.fileId,
      ]);
    });

    await expect(matching(ana, 'camion')).resolves.toEqual([]);
  });

  describe('contrato del puerto (H-6, R-5)', () => {
    it.each([['archivo.id); DROP TABLE fragmento; --'], ['"archivo"."id"'], ['id'], ['a.b.c']])(
      'rechaza la columna %j, que no es `alias.propiedad`',
      (column) => {
        const request = { text: 'camion', fileIdColumn: column, versionIdColumn: VERSION_ID };

        expect(() => reader.matchCondition(request)).toThrow(TypeError);
        expect(() =>
          reader.matchCondition({ ...request, fileIdColumn: FILE_ID, versionIdColumn: column }),
        ).toThrow(TypeError);
      },
    );

    it('su único parámetro es `contentText`', () => {
      const condition = reader.matchCondition({
        text: 'camion',
        fileIdColumn: FILE_ID,
        versionIdColumn: VERSION_ID,
      });

      expect(condition.parameters).toEqual({ contentText: 'camion' });
    });

    it('una consulta que reutiliza `contentText` pisa el texto sin aviso: por eso el nombre es fijo y reservado', async () => {
      const ana = await account();
      const acta = await fileWithText(ana, 'El camión llegó tarde');
      const clashing = (manager: EntityManager): Promise<string[]> =>
        idsOf(
          filesQuery(manager, 'camion').andWhere('archivo.nombre <> :contentText', {
            contentText: 'presupuesto',
          }),
        );

      await expect(matching(ana, 'camion')).resolves.toEqual([acta.fileId]);
      await expect(app.asActor(ana, clashing)).resolves.toEqual([]);
    });
  });

  describe('solo texto `indexado` de la versión vigente (H-4, RN-4)', () => {
    const chunks = (): TypeOrmChunkRepository => new TypeOrmChunkRepository(app.context);
    const indexings = (): TypeOrmIndexingRepository => new TypeOrmIndexingRepository(app.context);

    /** Indexación reclamada por el `worker` (`indexando`), lista para el `swap`. */
    const claimed = async (actor: Actor, version: IndexedVersionRow): Promise<FileIndexing> => {
      const pending = FileIndexing.pending({ id: randomUUID(), ...version, now: NOW });
      const running = pending.claim(NOW);
      await app.asActor(actor, async () => {
        await indexings().insertIfAbsent(actor, pending);
        await indexings().compareAndSet(actor, running, 'pendiente');
      });
      return running;
    };

    /** Lo que hace `IndexingService.swap` en su transacción: fragmentos nuevos y `indexado`; `abort` la deshace. */
    const swap = (actor: Actor, running: FileIndexing, abort: boolean): Promise<void> =>
      app.asActor(actor, async () => {
        const stored = [
          {
            order: 0,
            text: 'El camión llegó tarde',
            location: { tipo: 'txt', linea: 1 },
            embedding: axisVector(0),
          },
        ];
        await chunks().replaceForVersion(actor, running, stored);
        await indexings().compareAndSet(
          actor,
          running.complete({ fragmentCount: 1, durationMs: 5, now: NOW }),
          'indexando',
        );
        if (abort) throw new Error('swap interrumpido');
      });

    const stateOf = async (actor: Actor, versionId: string): Promise<string | undefined> =>
      (await app.asActor(actor, () => indexings().findByVersion(actor, versionId)))?.state;

    it('los fragmentos llegan con `indexado` en la misma transacción: sin ella, no coincide y sigue `indexando`', async () => {
      const ana = await account();
      const version = await fileOf(ana);
      const running = await claimed(ana, version);

      await expect(swap(ana, running, true)).rejects.toThrow('swap interrumpido');
      await expect(matching(ana, 'camion')).resolves.toEqual([]);
      await expect(stateOf(ana, version.versionId)).resolves.toBe('indexando');

      await swap(ana, running, false);
      await expect(matching(ana, 'camion')).resolves.toEqual([version.fileId]);
      await expect(stateOf(ana, version.versionId)).resolves.toBe('indexado');
    });

    it('`indexado` es final: la misma versión no vuelve a `pendiente` ni a `indexando` con sus fragmentos viejos', () => {
      const indexed = FileIndexing.pending({
        id: randomUUID(),
        fileId: randomUUID(),
        versionId: randomUUID(),
        now: NOW,
      })
        .claim(NOW)
        .complete({ fragmentCount: 1, durationMs: 5, now: NOW });

      expect(() => indexed.retry(NOW)).toThrow();
      expect(() => indexed.claim(NOW)).toThrow(TypeError);
    });
  });
});
