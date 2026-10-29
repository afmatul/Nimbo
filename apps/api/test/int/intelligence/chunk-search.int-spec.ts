import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import type { AgentScope } from '../../../src/modules/intelligence/domain/agent-scope';
import { TypeOrmChunkSearch } from '../../../src/modules/intelligence/infrastructure/persistence/typeorm-chunk-search';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { connectAsOwner } from '../../support/database-urls';
import type {
  AppDatabase,
  FileRowOptions,
  FolderRow,
  FolderRowOptions,
} from '../storage/storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from '../storage/storage-test-db';

import { axisVector, insertChunk, insertIndexing } from './intelligence-test-db';
import type { IndexedVersionRow } from './intelligence-test-db';

const ALL: AgentScope = { type: 'all' };
const LIMIT = 50;
const INTERNAL_ROLES = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const;
/** Pregunta con lexemas de «ventas» y «trimestre»; «crecieron» no aparece en ningún fragmento sembrado. */
const QUESTION = '¿Cuánto crecieron las ventas del trimestre?';
/** Texto sin lexemas de `QUESTION`: solo lo encuentra la búsqueda vectorial. */
const NEUTRAL_TEXT = 'Acta de la asamblea general';

/**
 * `TypeOrmChunkSearch` contra el Postgres del arnés como `nimbo_app` (plan 020 D-2, §6 fila 3/9/17; ADR-0036): las dos
 * búsquedas, `hasIndexed` y `scopeExists` filtran en la misma consulta por `accessibleNodes`, versión vigente y ámbito.
 * Cada cuenta es nueva por prueba para que los resultados no dependan de las demás.
 */
describe('TypeOrmChunkSearch (plan 020 D-2)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let search: TypeOrmChunkSearch;
  const created: string[] = [];

  const account = async (role: Role = Role.CLIENT): Promise<Actor> => {
    const id = await owner.transaction((manager) => insertAccount(manager, role));
    created.push(id);
    return createActor(id, role);
  };

  const asOwner = <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
    owner.transaction(work);

  const fileOf = (actor: Actor, options: FileRowOptions = {}): Promise<IndexedVersionRow> =>
    asOwner((manager) => insertFileWithVersion(manager, actor.id, options));

  const folderOf = (actor: Actor, options: FolderRowOptions = {}): Promise<FolderRow> =>
    asOwner((manager) => insertFolder(manager, actor.id, options));

  /** Archivo con un fragmento en el eje `axis` y el texto dado; devuelve el archivo. */
  const fileWithChunk = async (
    actor: Actor,
    axis: number,
    options: FileRowOptions & { text?: string } = {},
  ): Promise<IndexedVersionRow> => {
    const version = await fileOf(actor, options);
    await asOwner((manager) =>
      insertChunk(manager, version, { axis, text: options.text ?? NEUTRAL_TEXT }),
    );
    return version;
  };

  /** Versión 2 del archivo, que pasa a ser la vigente (`archivo.version_actual_id`). */
  const newVersionOf = async (
    actor: Actor,
    file: IndexedVersionRow,
  ): Promise<IndexedVersionRow> => {
    const versionId = randomUUID();
    await asOwner(async (manager) => {
      await manager.query(
        `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
         VALUES ($1, $2, 'carga', $3, 10, $4, now(), 2)`,
        [versionId, file.fileId, `u/${actor.id}/${file.fileId}/${versionId}`, actor.id],
      );
      await manager.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
        versionId,
        file.fileId,
      ]);
    });
    return { fileId: file.fileId, versionId };
  };

  const vectorFiles = async (
    actor: Actor,
    axis: number,
    scope: AgentScope = ALL,
  ): Promise<string[]> => {
    const query = { vector: axisVector(axis), scope, limit: LIMIT };
    const rows = await app.asActor(actor, () => search.vectorSearch(actor, query));
    return rows.map((row) => row.fileId);
  };

  const keywordFiles = async (
    actor: Actor,
    scope: AgentScope = ALL,
    text = QUESTION,
  ): Promise<string[]> => {
    const rows = await app.asActor(actor, () =>
      search.keywordSearch(actor, { text, scope, limit: LIMIT }),
    );
    return rows.map((row) => row.fileId);
  };

  const hasIndexed = (actor: Actor): Promise<boolean> =>
    app.asActor(actor, () => search.hasIndexed(actor));

  const scopeExists = (actor: Actor, scope: AgentScope): Promise<boolean> =>
    app.asActor(actor, () => search.scopeExists(actor, scope));

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    search = new TypeOrmChunkSearch(app.context);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('S-1 (enmienda de ADR-0036): ambas búsquedas traen el nombre del archivo en la misma consulta', async () => {
    const ana = await account();
    const file = await fileWithChunk(ana, 12, {
      name: 'ventas-trimestre.pdf',
      text: 'Ventas del trimestre',
    });

    const lexical = await app.asActor(ana, () =>
      search.keywordSearch(ana, { text: QUESTION, scope: ALL, limit: LIMIT }),
    );
    const semantic = await app.asActor(ana, () =>
      search.vectorSearch(ana, { vector: axisVector(12), scope: ALL, limit: LIMIT }),
    );

    const expected = { fileId: file.fileId, fileName: 'ventas-trimestre.pdf' };
    expect(lexical).toEqual([expect.objectContaining(expected)]);
    expect(semantic).toEqual([expect.objectContaining(expected)]);
  });

  describe('búsqueda vectorial', () => {
    it('CA-17: ordena por coseno, informa la similitud y respeta el límite', async () => {
      const ana = await account();
      const near = await fileWithChunk(ana, 10);
      await fileWithChunk(ana, 11);

      const rows = await app.asActor(ana, () =>
        search.vectorSearch(ana, { vector: axisVector(10), scope: ALL, limit: 1 }),
      );

      expect(rows.map((row) => [row.fileId, row.similarity])).toEqual([[near.fileId, 1]]);
      expect(rows[0]).toMatchObject({ versionId: near.versionId, order: 0 });
      expect(rows[0]?.location).toEqual({ tipo: 'pdf', pagina: 1, confianza: 1 });
    });
  });

  describe('búsqueda léxica', () => {
    it('CA-17: encuentra los fragmentos con cualquier lexema de la pregunta, primero el que comparte más', async () => {
      const [ana, bruno] = [await account(), await account()];
      const both = await fileWithChunk(ana, 0, { text: 'Ventas del primer trimestre' });
      const one = await fileWithChunk(ana, 0, { text: 'Resumen de ventas anuales' });
      await fileWithChunk(ana, 0);
      await fileWithChunk(bruno, 0, { text: 'Ventas del primer trimestre' });

      await expect(keywordFiles(ana)).resolves.toEqual([both.fileId, one.fileId]);
    });

    it('CA-3: una pregunta solo con palabras vacías no encuentra nada', async () => {
      const ana = await account();
      await fileWithChunk(ana, 0, { text: 'Ventas del primer trimestre' });

      await expect(keywordFiles(ana, ALL, '¿y de las que?')).resolves.toEqual([]);
    });
  });

  describe('versión vigente y papelera (RN-2, CA-9)', () => {
    it('RN-2: los fragmentos de una versión anterior no se recuperan por ninguna búsqueda', async () => {
      const ana = await account();
      const old = await fileWithChunk(ana, 13, { text: 'Ventas del trimestre' });
      await newVersionOf(ana, old);

      await expect(vectorFiles(ana, 13)).resolves.toEqual([]);
      await expect(keywordFiles(ana)).resolves.toEqual([]);
    });

    it('CA-9: un archivo en la papelera no se recupera por ninguna búsqueda', async () => {
      const ana = await account();
      await fileWithChunk(ana, 14, { text: 'Ventas del trimestre', deletedAt: new Date() });

      await expect(vectorFiles(ana, 14)).resolves.toEqual([]);
      await expect(keywordFiles(ana)).resolves.toEqual([]);
    });
  });

  describe('ámbito (RN-9, CA-17)', () => {
    it('RN-9: el ámbito de archivo solo devuelve ese archivo', async () => {
      const ana = await account();
      const target = await fileWithChunk(ana, 15, { text: 'Ventas' });
      await fileWithChunk(ana, 15, { text: 'Ventas' });
      const scope: AgentScope = { type: 'file', id: target.fileId };

      await expect(vectorFiles(ana, 15, scope)).resolves.toEqual([target.fileId]);
      await expect(keywordFiles(ana, scope)).resolves.toEqual([target.fileId]);
    });

    it('RN-9: el ámbito de carpeta incluye sus subcarpetas y nada más', async () => {
      const ana = await account();
      const folder = await folderOf(ana);
      const child = await folderOf(ana, { parent: folder });
      const sibling = await folderOf(ana);
      const inFolder = await fileWithChunk(ana, 16, { folderId: folder.id });
      const inChild = await fileWithChunk(ana, 16, { folderId: child.id });
      await fileWithChunk(ana, 16, { folderId: sibling.id });
      await fileWithChunk(ana, 16);

      const files = await vectorFiles(ana, 16, { type: 'folder', id: folder.id });

      expect(files.sort()).toEqual([inFolder.fileId, inChild.fileId].sort());
    });

    it('CA-17: con un ámbito de B, A no recupera nada aunque B tenga fragmentos idénticos', async () => {
      const [ana, bruno] = [await account(), await account()];
      const folder = await folderOf(bruno);
      const file = await fileWithChunk(bruno, 17, { folderId: folder.id, text: 'Ventas' });
      await fileWithChunk(ana, 17, { text: 'Ventas' });

      for (const scope of [
        { type: 'folder', id: folder.id },
        { type: 'file', id: file.fileId },
      ] as const) {
        await expect(vectorFiles(ana, 17, scope)).resolves.toEqual([]);
        await expect(keywordFiles(ana, scope)).resolves.toEqual([]);
      }
    });

    it('CA-17: `scopeExists` responde igual para un ámbito ajeno, en la papelera o inexistente', async () => {
      const [ana, bruno] = [await account(), await account()];
      const ownFolder = await folderOf(ana);
      const ownFile = await fileOf(ana);
      const trashedFolder = await folderOf(ana, { deletedAt: new Date() });
      const foreignFolder = await folderOf(bruno);
      const foreignFile = await fileOf(bruno);

      const answers = await Promise.all(
        [
          ALL,
          { type: 'folder', id: ownFolder.id },
          { type: 'file', id: ownFile.fileId },
          { type: 'folder', id: trashedFolder.id },
          { type: 'folder', id: foreignFolder.id },
          { type: 'file', id: foreignFile.fileId },
          { type: 'file', id: randomUUID() },
          { type: 'folder', id: ownFile.fileId },
        ].map((scope) => scopeExists(ana, scope as AgentScope)),
      );

      expect(answers).toEqual([true, true, true, false, false, false, false, false]);
    });
  });

  describe('`hasIndexed` (CA-7)', () => {
    it('CA-7: solo cuenta una indexación `indexado` de la versión vigente de un archivo accesible', async () => {
      const ana = await account();
      expect(await hasIndexed(ana)).toBe(false);

      const pending = await fileOf(ana);
      await asOwner((manager) => insertIndexing(manager, pending, { state: 'indexando' }));
      expect(await hasIndexed(ana)).toBe(false);

      const replaced = await fileOf(ana);
      await asOwner((manager) => insertIndexing(manager, replaced, { state: 'indexado' }));
      await newVersionOf(ana, replaced);
      expect(await hasIndexed(ana)).toBe(false);

      const trashed = await fileOf(ana, { deletedAt: new Date() });
      await asOwner((manager) => insertIndexing(manager, trashed, { state: 'indexado' }));
      expect(await hasIndexed(ana)).toBe(false);

      const live = await fileOf(ana);
      await asOwner((manager) => insertIndexing(manager, live, { state: 'indexado' }));
      expect(await hasIndexed(ana)).toBe(true);
    });

    it('CA-17: los archivos indexados de otra cuenta no cuentan', async () => {
      const [ana, bruno] = [await account(), await account()];
      const file = await fileOf(bruno);
      await asOwner((manager) => insertIndexing(manager, file, { state: 'indexado' }));

      await expect(hasIndexed(ana)).resolves.toBe(false);
      await expect(hasIndexed(bruno)).resolves.toBe(true);
    });
  });

  it.each(INTERNAL_ROLES)(
    'CA-16: %s no recibe fragmentos, indexados ni ámbitos de nadie',
    async (role) => {
      const ana = await account();
      const internal = await account(role);
      const file = await fileWithChunk(ana, 18, { text: 'Ventas del trimestre' });
      await asOwner((manager) => insertIndexing(manager, file, { state: 'indexado' }));

      await expect(vectorFiles(internal, 18)).resolves.toEqual([]);
      await expect(keywordFiles(internal)).resolves.toEqual([]);
      await expect(hasIndexed(internal)).resolves.toBe(false);
      await expect(scopeExists(internal, { type: 'file', id: file.fileId })).resolves.toBe(false);
    },
  );

  it('ADR-0036 (enmendado): las columnas de `storage` que lee `chunk-sql.ts` siguen existiendo', async () => {
    const [file, folder] = await asOwner(async (manager) => [
      await columnsOf(manager, 'archivo'),
      await columnsOf(manager, 'carpeta'),
    ]);

    expect(Object.keys(file)).toEqual(
      expect.arrayContaining(['id', 'carpeta_id', 'version_actual_id', 'nombre']),
    );
    expect(Object.keys(folder)).toEqual(expect.arrayContaining(['id', 'ruta']));
  });

  it('RNF-05: sin `withActor` no consulta (`requireActorScope`)', async () => {
    const ana = createActor(randomUUID(), Role.CLIENT);

    await expect(search.hasIndexed(ana)).rejects.toThrow(ActorScopeMissingError);
  });
});
