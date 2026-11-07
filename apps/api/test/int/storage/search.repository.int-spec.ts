import type { DataSource } from 'typeorm';

import { SqlContentMatchReader } from '../../../src/modules/intelligence/infrastructure/persistence/sql-content-match.reader';
import { InvalidQueryError } from '../../../src/modules/storage/domain/errors';
import type {
  NodeSearchCriteria,
  NodeSearchHit,
  SearchPage,
} from '../../../src/modules/storage/search/application/ports/i-node-search.repository.port';
import {
  FOLD_FROM,
  FOLD_TO,
  TypeOrmNodeSearchRepository,
} from '../../../src/modules/storage/search/infrastructure/typeorm-node-search.repository';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { insertChunk, insertIndexing } from '../intelligence/intelligence-test-db';

import {
  connectAsAppDatabase,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from './storage-test-db';
import type { AppDatabase, FileRowOptions, FolderRow } from './storage-test-db';

const PAGE = 50;
const OLDER = new Date('2026-10-01T09:00:00.000Z');
const MIDDLE = new Date('2026-10-02T09:00:00.000Z');
const NEWER = new Date('2026-10-03T09:00:00.000Z');

type NodeTable = 'archivo' | 'carpeta';

/** Búsqueda de 018 sobre Postgres como `nimbo_app` dentro de `withActor` (plan 018 §3). */
describe('TypeOrmNodeSearchRepository · por nombre (018 CA-1 a CA-5)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmNodeSearchRepository;
  const created: string[] = [];

  /** Cuenta nueva por prueba: sus resultados no se mezclan con los de otras. */
  const newClient = async (): Promise<Actor> => {
    const id = await insertAccount(owner);
    created.push(id);
    return createActor(id, Role.CLIENT);
  };

  const fileRow = async (actor: Actor, name: string, options: FileRowOptions = {}) =>
    (
      await owner.transaction((manager) =>
        insertFileWithVersion(manager, actor.id, { ...options, name }),
      )
    ).fileId;

  const folderRow = (actor: Actor, name: string, parent: FolderRow | null = null) =>
    insertFolder(owner, actor.id, { name, parent });

  const touch = (table: NodeTable, id: string, updatedAt: Date): Promise<unknown> =>
    owner.query(`UPDATE ${table} SET actualizado_en = $2 WHERE id = $1`, [id, updatedAt]);

  const search = (
    actor: Actor,
    criteria: Partial<NodeSearchCriteria> & Pick<NodeSearchCriteria, 'terms'>,
  ): Promise<SearchPage> =>
    app.asActor(actor, () => repository.search(actor, { limit: PAGE, ...criteria }));

  const namesFound = async (actor: Actor, terms: readonly string[]): Promise<string[]> =>
    (await search(actor, { terms })).hits.map((hit) => hit.node.name.value).sort();

  /** Recorre todas las páginas de `limit` con el cursor de cada una. */
  const allPages = async (actor: Actor, terms: readonly string[], limit: number) => {
    const hits: NodeSearchHit[] = [];
    let cursor: string | null = null;
    do {
      const page: SearchPage = await search(actor, {
        terms,
        limit,
        ...(cursor === null ? {} : { cursor }),
      });
      hits.push(...page.hits);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return hits;
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmNodeSearchRepository(app.context, new SqlContentMatchReader());
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  describe('coincidencia por nombre (D-1)', () => {
    it('CA-1: exige todas las palabras, en cualquier orden y sin distinguir mayúsculas ni acentos', async () => {
      const ana = await newClient();
      await fileRow(ana, 'Informe del Camión.docx');
      await fileRow(ana, 'Informe anual.pdf');
      await folderRow(ana, 'Camiones');

      expect(await namesFound(ana, ['camion', 'informe'])).toEqual(['Informe del Camión.docx']);
      expect(await namesFound(ana, ['INFORME', 'CAMIÓN'])).toEqual(['Informe del Camión.docx']);
      expect(await namesFound(ana, ['camion'])).toEqual(['Camiones', 'Informe del Camión.docx']);
      expect(await namesFound(ana, ['camion', 'factura'])).toEqual([]);
    });

    it('CA-1: la ñ no es la n, pero sus mayúsculas pliegan sin depender del locale', async () => {
      const ana = await newClient();
      await fileRow(ana, 'Año.pdf');
      await fileRow(ana, 'ano.txt');
      await fileRow(ana, 'arbol.txt');

      expect(await namesFound(ana, ['ano'])).toEqual(['ano.txt']);
      expect(await namesFound(ana, ['Año'])).toEqual(['Año.pdf']);
      expect(await namesFound(ana, ['AÑO'])).toEqual(['Año.pdf']);
      expect(await namesFound(ana, ['año'])).toEqual(['Año.pdf']);
      expect(await namesFound(ana, ['ÁRBOL'])).toEqual(['arbol.txt']);
    });

    it('CA-1: el plegado no depende del locale: con `COLLATE "C"` (donde `lower` solo toca el ASCII) «AÑO» = «año» y «ÁRBOL» = «arbol»', async () => {
      const fold = async (text: string): Promise<string> => {
        const [row] = (await owner.query(
          'SELECT lower(translate($1::text COLLATE "C", $2, $3)) AS folded',
          [text, FOLD_FROM, FOLD_TO],
        )) as { folded: string }[];
        return row?.folded ?? '';
      };
      const [plainLower] = (await owner.query('SELECT lower(\'Ñ\' COLLATE "C") AS v')) as {
        v: string;
      }[];

      expect(plainLower?.v).toBe('Ñ');
      expect(await fold('AÑO')).toBe('año');
      expect(await fold('ÁRBOL')).toBe('arbol');
      expect(await fold('Año')).not.toBe(await fold('ano'));
    });

    it('CA-1: diéresis, grave, circunflejo y cedilla también pliegan', async () => {
      const ana = await newClient();
      await fileRow(ana, 'PINGÜINO.png');
      await fileRow(ana, 'Façade crème.txt');

      expect(await namesFound(ana, ['pingüino'])).toEqual(['PINGÜINO.png']);
      expect(await namesFound(ana, ['pinguino'])).toEqual(['PINGÜINO.png']);
      expect(await namesFound(ana, ['FACADE', 'CREME'])).toEqual(['Façade crème.txt']);
      expect(await namesFound(ana, ['fâçàdé'])).toEqual(['Façade crème.txt']);
    });

    it('CA-1: la palabra es un fragmento del nombre completo, con la extensión', async () => {
      const ana = await newClient();
      await fileRow(ana, 'presupuesto.xlsx');

      expect(await namesFound(ana, ['upuest'])).toEqual(['presupuesto.xlsx']);
      expect(await namesFound(ana, ['.xlsx'])).toEqual(['presupuesto.xlsx']);
    });

    it('CA-4: `%`, `_` y `\\` se buscan tal cual, no como comodines', async () => {
      const ana = await newClient();
      await fileRow(ana, 'Avance 50%.pdf');
      await fileRow(ana, 'Avance 500.pdf');
      await fileRow(ana, 'a_b.txt');
      await fileRow(ana, 'axb.txt');

      expect(await namesFound(ana, ['50%'])).toEqual(['Avance 50%.pdf']);
      expect(await namesFound(ana, ['a_b'])).toEqual(['a_b.txt']);
      expect(await namesFound(ana, ['%'])).toEqual(['Avance 50%.pdf']);
      // Un nombre no admite «\» (RN-5 de 005): buscarla no falla ni encuentra todo.
      expect(await namesFound(ana, ['\\'])).toEqual([]);
    });
  });

  describe('papelera, orden y ubicación', () => {
    it('CA-5: lo que está en la papelera no aparece; al restaurarlo vuelve', async () => {
      const ana = await newClient();
      const trashedAt = new Date();
      await fileRow(ana, 'Contrato vivo.pdf');
      const file = await fileRow(ana, 'Contrato viejo.pdf', { deletedAt: trashedAt });
      const folder = await insertFolder(owner, ana.id, {
        name: 'Contratos',
        deletedAt: trashedAt,
      });

      expect(await namesFound(ana, ['contrato'])).toEqual(['Contrato vivo.pdf']);

      for (const [table, id] of [
        ['archivo', file],
        ['carpeta', folder.id],
      ] as const) {
        await owner.query(
          `UPDATE ${table} SET eliminado_en = NULL, purgar_en = NULL WHERE id = $1`,
          [id],
        );
      }
      expect(await namesFound(ana, ['contrato'])).toEqual([
        'Contrato viejo.pdf',
        'Contrato vivo.pdf',
        'Contratos',
      ]);
    });

    it('CA-2: primero las carpetas y después los archivos, cada grupo del modificado más reciente al más antiguo', async () => {
      const ana = await newClient();
      const oldFolder = await folderRow(ana, 'Plan viejo');
      const newFolder = await folderRow(ana, 'Plan nuevo');
      const oldFile = await fileRow(ana, 'plan-a.pdf');
      const newFile = await fileRow(ana, 'plan-b.pdf');
      await touch('carpeta', oldFolder.id, OLDER);
      await touch('carpeta', newFolder.id, MIDDLE);
      await touch('archivo', oldFile, MIDDLE);
      await touch('archivo', newFile, NEWER);

      const { hits, nextCursor } = await search(ana, { terms: ['plan'] });

      expect(hits.map((hit) => hit.node.id)).toEqual([
        newFolder.id,
        oldFolder.id,
        newFile,
        oldFile,
      ]);
      expect(hits.map((hit) => hit.node.type)).toEqual(['folder', 'folder', 'file', 'file']);
      expect(nextCursor).toBeNull();
    });

    it('CA-2: la ubicación es la carpeta que lo contiene, o `null` en «Mis archivos»', async () => {
      const ana = await newClient();
      const box = await folderRow(ana, 'Proyectos');
      const inner = await folderRow(ana, 'Nota interior', box);
      const nested = await fileRow(ana, 'Nota.txt', { folderId: inner.id });
      await fileRow(ana, 'Nota raíz.txt');

      const { hits } = await search(ana, { terms: ['nota'] });
      const locationOf = (id: string) => hits.find((hit) => hit.node.id === id)?.location;

      expect(locationOf(inner.id)).toEqual({ id: box.id, name: 'Proyectos' });
      expect(locationOf(nested)).toEqual({ id: inner.id, name: 'Nota interior' });
      expect(hits.filter((hit) => hit.location === null).map((hit) => hit.node.name.value)).toEqual(
        ['Nota raíz.txt'],
      );
    });
  });

  describe('filtros de tipo y de fecha (T-05)', () => {
    const setKind = (id: string, kind: string): Promise<unknown> =>
      owner.query('UPDATE archivo SET tipo = $2 WHERE id = $1', [id, kind]);

    it('CA-7: con tipo solo aparecen archivos de esos tipos y ninguna carpeta; sin tipo, las carpetas vuelven', async () => {
      const ana = await newClient();
      await folderRow(ana, 'Viaje fotos');
      const photo = await fileRow(ana, 'viaje.png');
      await fileRow(ana, 'viaje.pdf');
      const sheet = await fileRow(ana, 'viaje.xlsx');
      await setKind(photo, 'imagen');
      await setKind(sheet, 'xlsx');

      const ofKinds = async (kinds: NodeSearchCriteria['kinds']) =>
        (await search(ana, { terms: ['viaje'], ...(kinds === undefined ? {} : { kinds }) })).hits
          .map((hit) => hit.node.name.value)
          .sort();

      expect(await ofKinds(['imagen'])).toEqual(['viaje.png']);
      expect(await ofKinds(['pdf', 'xlsx'])).toEqual(['viaje.pdf', 'viaje.xlsx']);
      expect(await ofKinds(['otro'])).toEqual([]);
      expect(await ofKinds(undefined)).toEqual(
        ['viaje.pdf', 'viaje.png', 'viaje.xlsx', 'Viaje fotos'].sort(),
      );
    });

    it('CA-8: `from` es inclusivo y `to` exclusivo, también en las carpetas', async () => {
      const ana = await newClient();
      const folder = await folderRow(ana, 'Rango carpeta');
      const older = await fileRow(ana, 'rango-viejo.pdf');
      const middle = await fileRow(ana, 'rango-medio.pdf');
      const newer = await fileRow(ana, 'rango-nuevo.pdf');
      await touch('carpeta', folder.id, MIDDLE);
      await touch('archivo', older, OLDER);
      await touch('archivo', middle, MIDDLE);
      await touch('archivo', newer, NEWER);

      const between = async (range: Pick<NodeSearchCriteria, 'from' | 'to'>) =>
        (await search(ana, { terms: ['rango'], ...range })).hits.map((hit) => hit.node.id);

      expect(await between({ from: MIDDLE })).toEqual([folder.id, newer, middle]);
      expect(await between({ to: MIDDLE })).toEqual([older]);
      expect(await between({ from: MIDDLE, to: NEWER })).toEqual([folder.id, middle]);
      expect(await between({ from: OLDER, to: new Date(NEWER.getTime() + 1) })).toEqual([
        folder.id,
        newer,
        middle,
        older,
      ]);
    });

    it('CA-8: el rango se combina con el texto y el tipo', async () => {
      const ana = await newClient();
      const match = await fileRow(ana, 'acta-enero.png');
      const otherKind = await fileRow(ana, 'acta-febrero.pdf');
      const outOfRange = await fileRow(ana, 'acta-marzo.png');
      await setKind(match, 'imagen');
      await setKind(outOfRange, 'imagen');
      await touch('archivo', match, MIDDLE);
      await touch('archivo', otherKind, MIDDLE);
      await touch('archivo', outOfRange, OLDER);

      const { hits } = await search(ana, { terms: ['acta'], kinds: ['imagen'], from: MIDDLE });

      expect(hits.map((hit) => hit.node.id)).toEqual([match]);
    });
  });

  describe('cursor', () => {
    it('CA-3: con fechas de modificación iguales, las páginas no repiten ni saltan ningún nodo', async () => {
      const ana = await newClient();
      const folders = [await folderRow(ana, 'Lote 1'), await folderRow(ana, 'Lote 2')];
      const files = [
        await fileRow(ana, 'lote-a.pdf'),
        await fileRow(ana, 'lote-b.pdf'),
        await fileRow(ana, 'lote-c.pdf'),
      ];
      await Promise.all(folders.map((folder) => touch('carpeta', folder.id, MIDDLE)));
      await Promise.all(files.map((id) => touch('archivo', id, MIDDLE)));
      const all = (await search(ana, { terms: ['lote'] })).hits.map((hit) => hit.node.id);

      for (const limit of [1, 2, 3]) {
        const paged = (await allPages(ana, ['lote'], limit)).map((hit) => hit.node.id);
        expect(paged).toEqual(all);
      }
      expect(new Set(all).size).toBe(5);
    });

    it('CA-3: la página llena sin más resultados no deja cursor', async () => {
      const ana = await newClient();
      await fileRow(ana, 'unico-1.pdf');
      await fileRow(ana, 'unico-2.pdf');

      expect((await search(ana, { terms: ['unico'], limit: 2 })).nextCursor).toBeNull();
      expect((await search(ana, { terms: ['unico'], limit: 1 })).nextCursor).not.toBeNull();
    });

    it('CA-3: un cursor que no emitió la búsqueda es `InvalidQueryError`', async () => {
      const ana = await newClient();

      await expect(search(ana, { terms: ['a'], cursor: 'no-es-un-cursor' })).rejects.toBeInstanceOf(
        InvalidQueryError,
      );
    });
  });
  describe('por contenido (018b)', () => {
    /** Archivo cuya versión vigente quedó `indexado` con un fragmento de `text` (019). */
    const indexedFile = async (
      actor: Actor,
      name: string,
      text: string,
      options: FileRowOptions = {},
    ): Promise<string> =>
      owner.transaction(async (manager) => {
        const version = await insertFileWithVersion(manager, actor.id, { ...options, name });
        await insertIndexing(manager, version, { state: 'indexado' });
        await insertChunk(manager, version, { text });
        return version.fileId;
      });

    const found = async (actor: Actor, terms: readonly string[], criteria = {}) =>
      (await search(actor, { terms, ...criteria })).hits.map((hit) => [
        hit.node.name.value,
        hit.matchedBy,
      ]);

    it('CA-1, CA-4: el contenido suma archivos marcados `content`; el que coincide por nombre y contenido sale una vez con `name`', async () => {
      const ana = await newClient();
      const acta = await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde');
      const both = await indexedFile(ana, 'Camión rojo.pdf', 'Informe del camión');
      await indexedFile(ana, 'Minuta.docx', 'Sin novedades');
      await folderRow(ana, 'Camiones');
      await touch('archivo', acta, OLDER);
      await touch('archivo', both, NEWER);

      expect(await found(ana, ['camion'])).toEqual([
        ['Camiones', 'name'],
        ['Camión rojo.pdf', 'name'],
        ['Acta.docx', 'content'],
      ]);
    });

    it('CA-2: por contenido valen palabras completas; un trozo («camio») solo encuentra por nombre', async () => {
      const ana = await newClient();
      await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde');
      await fileRow(ana, 'camionero.pdf');

      expect(await found(ana, ['camio'])).toEqual([['camionero.pdf', 'name']]);
      expect(await found(ana, ['CAMIONES'])).toEqual([['Acta.docx', 'content']]);
    });

    it('CA-3: todas las palabras en el mismo fragmento', async () => {
      const ana = await newClient();
      await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde');

      expect(await found(ana, ['camion', 'tarde'])).toEqual([['Acta.docx', 'content']]);
      expect(await found(ana, ['camion', 'presupuesto'])).toEqual([]);
    });

    it('CA-5: un texto solo de palabras vacías busca solo por nombre', async () => {
      const ana = await newClient();
      await indexedFile(ana, 'Acta.docx', 'De la casa a la oficina');
      await fileRow(ana, 'de la casa.pdf');

      expect(await found(ana, ['de', 'la'])).toEqual([['de la casa.pdf', 'name']]);
    });

    it.each([['pendiente'], ['indexando'], ['fallido'], ['no_indexable']])(
      'CA-6: un archivo `%s` (sin fragmentos) solo se encuentra por nombre; al indexarse, también por contenido',
      async (state) => {
        const ana = await newClient();
        const version = await owner.transaction((manager) =>
          insertFileWithVersion(manager, ana.id, { name: 'Acta.docx' }),
        );
        await insertIndexing(owner, version, {
          state,
          reason: { fallido: 'proveedor_no_disponible', no_indexable: 'sin_texto' }[state] ?? null,
        });

        expect(await found(ana, ['camion'])).toEqual([]);
        expect(await found(ana, ['acta'])).toEqual([['Acta.docx', 'name']]);

        await insertChunk(owner, version, { text: 'El camión llegó tarde' });
        expect(await found(ana, ['camion'])).toEqual([['Acta.docx', 'content']]);
      },
    );

    it('CA-7: una versión vigente nueva sin indexar no se encuentra por el texto de la anterior', async () => {
      const ana = await newClient();
      const acta = await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde');
      await owner.transaction(async (manager) => {
        const [row] = (await manager.query(
          `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
           VALUES (gen_random_uuid(), $1, 'carga', 'u/x/y/z', 10, $2, now(), 2) RETURNING id`,
          [acta, ana.id],
        )) as { id: string }[];
        await manager.query('UPDATE archivo SET version_actual_id = $1 WHERE id = $2', [
          row?.id,
          acta,
        ]);
      });

      expect(await found(ana, ['camion'])).toEqual([]);
    });

    it('CA-7: un archivo en la papelera no aparece aunque su texto coincida', async () => {
      const ana = await newClient();
      await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde', { deletedAt: new Date() });

      expect(await found(ana, ['camion'])).toEqual([]);
    });

    it('CA-9: el tipo y la fecha de modificación se aplican a lo encontrado por contenido', async () => {
      const ana = await newClient();
      const recent = await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde');
      const old = await indexedFile(ana, 'Minuta.docx', 'Otro camión');
      await touch('archivo', recent, NEWER);
      await touch('archivo', old, OLDER);

      expect(await found(ana, ['camion'], { kinds: ['imagen'] })).toEqual([]);
      expect(await found(ana, ['camion'], { kinds: ['pdf'] })).toEqual([
        ['Acta.docx', 'content'],
        ['Minuta.docx', 'content'],
      ]);
      expect(await found(ana, ['camion'], { from: MIDDLE })).toEqual([['Acta.docx', 'content']]);
      expect(await found(ana, ['camion'], { to: MIDDLE })).toEqual([['Minuta.docx', 'content']]);
    });

    it('CA-9: una carpeta nunca coincide por contenido, ni por el texto de sus archivos', async () => {
      const ana = await newClient();
      const box = await folderRow(ana, 'Proyectos');
      await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde', { folderId: box.id });

      const { hits } = await search(ana, { terms: ['camion'] });

      expect(hits.map((hit) => [hit.node.type, hit.location?.name, hit.matchedBy])).toEqual([
        ['file', 'Proyectos', 'content'],
      ]);
    });

    it('CA-4: con coincidencias por nombre y por contenido mezcladas, las páginas no repiten ni saltan ninguna', async () => {
      const ana = await newClient();
      await folderRow(ana, 'Camiones');
      const files = [
        await indexedFile(ana, 'camion-1.pdf', 'Nada que ver'),
        await indexedFile(ana, 'Acta.docx', 'El camión llegó tarde'),
        await fileRow(ana, 'camion-2.pdf'),
        await indexedFile(ana, 'Minuta.docx', 'Otro camión'),
      ];
      await Promise.all(files.map((id) => touch('archivo', id, MIDDLE)));
      const all = (await search(ana, { terms: ['camion'] })).hits.map((hit) => hit.node.id);

      for (const limit of [1, 2, 3]) {
        const paged = (await allPages(ana, ['camion'], limit)).map((hit) => hit.node.id);
        expect(paged).toEqual(all);
      }
      expect(new Set(all).size).toBe(5);
    });
  });
});
