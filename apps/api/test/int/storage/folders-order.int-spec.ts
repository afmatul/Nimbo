import { randomUUID } from 'node:crypto';

import { FILES_PAGE_MAX, folderContentsResponseSchema } from '@nimbo/contracts';
import type { FolderContentsResponse } from '@nimbo/contracts';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import {
  NODE_SORTS,
  NodeOrder,
  SORT_DIRECTIONS,
} from '../../../src/modules/storage/domain/node-order';
import type { NodeSort, SortDirection } from '../../../src/modules/storage/domain/node-order';

import { createStorageHttpApp } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';
import { insertFolder } from './storage-test-db';
import type { FolderRow } from './storage-test-db';

const BASE_TIME = Date.parse('2026-09-01T00:00:00.000Z');
const SECOND_MS = 1000;
/** RNF-14: una página del explorador en ≤ 2 s con 20 000 archivos en la carpeta (plan 007 §6, R-2). */
const LIST_BUDGET_MS = 2000;
const BIG_FOLDER_FILES = 20_000;
/** Tope de páginas al recorrer la carpeta mixta: más que esto es un cursor que no avanza. */
const MAX_PAGES = 40;
/** Límites de página que cortan dentro de las carpetas, justo en la última carpeta (7) y dentro de los archivos. */
const PAGE_LIMITS = [3, 7] as const;

const ORDERS: readonly (readonly [NodeSort, SortDirection])[] = NODE_SORTS.flatMap((sort) =>
  SORT_DIRECTIONS.map((dir) => [sort, dir] as const),
);

type Group = 'folder' | 'file';

interface SeedNode {
  readonly id: string;
  readonly group: Group;
  readonly name: string;
  readonly sizeBytes: bigint;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ErrorBody {
  readonly code: string;
  readonly fields?: { field: string; reason: string }[];
}

const at = (seconds: number): number => BASE_TIME + seconds * SECOND_MS;

/** Nodo de la carpeta mixta: tiempos en segundos desde `BASE_TIME`; empates a propósito en tamaño y creación. */
const seed = (group: Group, name: string, values: [number, number, number]): SeedNode => ({
  id: randomUUID(),
  group,
  name,
  sizeBytes: BigInt(values[0]),
  createdAt: at(values[1]),
  updatedAt: at(values[2]),
});

/** Siete carpetas y nueve archivos con mayúsculas mezcladas (el nombre se compara sin ellas). */
const mixedNodes = (): SeedNode[] => [
  ...(
    [
      ['delta', 5, 10],
      ['Alfa', 1, 40],
      ['charlie', 3, 20],
      ['Bravo', 3, 30],
      ['eco', 7, 21],
      ['Foxtrot', 2, 50],
      ['golf', 6, 15],
    ] as const
  ).map(([name, created, updated]) => seed('folder', name, [1, created, updated])),
  ...(
    [
      ['kilo', 300, 4, 12],
      ['Hotel', 100, 4, 11],
      ['india', 300, 1, 13],
      ['Juliett', 50, 9, 14],
      ['lima', 700, 2, 19],
      ['Mike', 100, 8, 18],
      ['november', 300, 4, 17],
      ['Oscar', 999, 6, 16],
      ['papa', 1, 3, 15],
    ] as const
  ).map(([name, size, created, updated]) => seed('file', name, [size, created, updated])),
];

/** 20 000 archivos con empates de tamaño y de creación, sembrados por SQL (no por HTTP). */
const bigFolderNodes = (): SeedNode[] =>
  Array.from({ length: BIG_FOLDER_FILES }, (_, index) =>
    seed('file', `archivo-${String(index).padStart(5, '0')}`, [
      ((index * 7919) % 1000) + 1,
      Math.floor(index / 2),
      (index * 31) % BIG_FOLDER_FILES,
    ]),
  );

const toKey = (node: SeedNode, sort: NodeSort): string | bigint | number => {
  if (sort === 'name') return node.name.toLowerCase();
  if (sort === 'size') return node.sizeBytes;
  return sort === 'updated' ? node.updatedAt : node.createdAt;
};

const compareKeys = (a: string | bigint | number, b: string | bigint | number): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** Ids en el orden esperado: carpetas y luego archivos, cada grupo en su clave (`NodeOrder.keyFor`) y por id. */
const expectedIds = (nodes: readonly SeedNode[], order: NodeOrder): string[] =>
  (['folder', 'file'] as const).flatMap((group) => {
    const key = order.keyFor(group);
    const sign = key.dir === 'asc' ? 1 : -1;
    return nodes
      .filter((node) => node.group === group)
      .sort(
        (a, b) =>
          sign * (compareKeys(toKey(a, key.sort), toKey(b, key.sort)) || compareKeys(a.id, b.id)),
      )
      .map((node) => node.id);
  });

const isoArray = (nodes: readonly SeedNode[], pick: (node: SeedNode) => number): string[] =>
  nodes.map((node) => new Date(pick(node)).toISOString());

const insertFolders = async (
  owner: DataSource,
  ownerId: string,
  { parent, nodes }: { parent: FolderRow; nodes: readonly SeedNode[] },
): Promise<void> => {
  await owner.query(
    `INSERT INTO carpeta (id, propietario_id, carpeta_padre_id, nombre, ruta, profundidad, creado_en, actualizado_en)
     SELECT r.id, $1, $2, r.nombre, $3 || r.id || '/', $4, r.creado, r.actualizado
       FROM unnest($5::uuid[], $6::text[], $7::timestamptz[], $8::timestamptz[]) AS r(id, nombre, creado, actualizado)`,
    [
      ownerId,
      parent.id,
      parent.path,
      parent.depth + 1,
      nodes.map((node) => node.id),
      nodes.map((node) => node.name),
      isoArray(nodes, (node) => node.createdAt),
      isoArray(nodes, (node) => node.updatedAt),
    ],
  );
};

/** Archivos y su versión actual en una sola sentencia (la FK `version_actual_id` es diferida). */
const insertFiles = async (
  owner: DataSource,
  ownerId: string,
  { parent, nodes }: { parent: FolderRow; nodes: readonly SeedNode[] },
): Promise<void> => {
  await owner.query(
    `WITH a AS (
       INSERT INTO archivo (id, propietario_id, carpeta_id, nombre, tipo, tamano_bytes, version_actual_id, creado_en,
                            actualizado_en)
       SELECT r.id, $1, $2, r.nombre, 'pdf', r.tamano, gen_random_uuid(), r.creado, r.actualizado
         FROM unnest($3::uuid[], $4::text[], $5::bigint[], $6::timestamptz[], $7::timestamptz[])
              AS r(id, nombre, tamano, creado, actualizado)
       RETURNING id, version_actual_id, tamano_bytes, creado_en)
     INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
     SELECT a.version_actual_id, a.id, 'carga', 'u/' || $1 || '/' || a.id || '/' || a.version_actual_id,
            a.tamano_bytes, $1, a.creado_en, 1
       FROM a`,
    [
      ownerId,
      parent.id,
      nodes.map((node) => node.id),
      nodes.map((node) => node.name),
      nodes.map((node) => node.sizeBytes.toString()),
      isoArray(nodes, (node) => node.createdAt),
      isoArray(nodes, (node) => node.updatedAt),
    ],
  );
};

const seedFolder = async (
  owner: DataSource,
  ownerId: string,
  nodes: readonly SeedNode[],
): Promise<FolderRow> => {
  const parent = await insertFolder(owner, ownerId, { name: `Orden-${randomUUID()}` });
  const folders = nodes.filter((node) => node.group === 'folder');
  if (folders.length > 0) await insertFolders(owner, ownerId, { parent, nodes: folders });
  await insertFiles(owner, ownerId, {
    parent,
    nodes: nodes.filter((node) => node.group === 'file'),
  });
  return parent;
};

const bodyOf = (response: Response): FolderContentsResponse => {
  expect(response.status).toBe(200);
  return folderContentsResponseSchema.parse(response.body);
};

/** Recorre todas las páginas con `nextCursor` y devuelve los ids en el orden recibido. */
const walk = async (client: StorageClient, query: Record<string, string>): Promise<string[]> => {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = bodyOf(
      await client.folderContents(cursor === null ? query : { ...query, cursor }),
    );
    ids.push(...body.items.map((item) => item.id));
    cursor = body.nextCursor;
    if (cursor === null) return ids;
  }
  throw new Error('El cursor no terminó el recorrido');
};

const expectQueryError = (response: Response, field: string, reason: string): void => {
  expect(response.status).toBe(400);
  const body = response.body as ErrorBody;
  expect(body.code).toBe('STORAGE_INVALID_QUERY');
  expect(body.fields).toEqual([expect.objectContaining({ field, reason })]);
};

const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const result = await work();
  return [result, performance.now() - start];
};

/** Orden y paginación de `GET /folders/contents` (plan 007 §4, §6; CA-9, CA-10, CA-11, RNF-14). */
describe('orden y paginación del explorador por HTTP (007 CA-9, CA-10, CA-11)', () => {
  let storage: StorageHttpApp;
  let ana: StorageClient;
  let mixed: SeedNode[];
  let mixedFolder: FolderRow;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    ana = await storage.newClient();
    mixed = mixedNodes();
    mixedFolder = await seedFolder(storage.owner, ana.id, mixed);
  });

  afterAll(async () => {
    await storage?.close();
  });

  describe('carpeta mixta', () => {
    it.each(
      ORDERS.flatMap(([sort, dir]) => PAGE_LIMITS.map((limit) => [sort, dir, limit] as const)),
    )(
      'CA-9, CA-10: `%s %s` de a %i recorre todo sin duplicados ni omisiones, carpetas primero',
      async (sort, dir, limit) => {
        const ids = await walk(ana, {
          folderId: mixedFolder.id,
          sort,
          dir,
          limit: String(limit),
        });

        expect(ids).toEqual(expectedIds(mixed, NodeOrder.of(sort, dir)));
      },
    );

    it('CA-10: sin `sort` ni `dir` es el orden de 006 (creación descendente), idéntico a `created desc`', async () => {
      const query = { folderId: mixedFolder.id, limit: '4' };

      const implicit = await walk(ana, query);
      const explicit = await walk(ana, { ...query, sort: 'created', dir: 'desc' });

      expect(implicit).toEqual(expectedIds(mixed, NodeOrder.of('created', 'desc')));
      expect(explicit).toEqual(implicit);
    });

    it('CA-10: cada elemento trae su `updatedAt` para la columna «Modificado»', async () => {
      const body = bodyOf(await ana.folderContents({ folderId: mixedFolder.id, limit: '100' }));

      const updated = new Map(
        mixed.map((node) => [node.id, new Date(node.updatedAt).toISOString()]),
      );
      expect(body.items.map((item) => item.updatedAt)).toEqual(
        body.items.map((item) => updated.get(item.id)),
      );
    });
  });

  describe('consultas inválidas', () => {
    it.each([
      [{ sort: 'peso' }, 'sort', 'INVALID_SORT'],
      [{ dir: 'arriba' }, 'dir', 'INVALID_DIRECTION'],
      [{ cursor: 'basura' }, 'cursor', 'INVALID_CURSOR'],
    ])(
      'CA-11: %j responde `400 STORAGE_INVALID_QUERY` con el campo',
      async (query, field, reason) => {
        expectQueryError(
          await ana.folderContents({ folderId: mixedFolder.id, ...query }),
          field,
          reason,
        );
      },
    );

    it('CA-11: un cursor emitido para otro orden es `400` con `INVALID_CURSOR`', async () => {
      const first = bodyOf(
        await ana.folderContents({ folderId: mixedFolder.id, sort: 'name', limit: '2' }),
      );

      const response = await ana.folderContents({
        folderId: mixedFolder.id,
        sort: 'size',
        limit: '2',
        cursor: first.nextCursor ?? '',
      });

      expectQueryError(response, 'cursor', 'INVALID_CURSOR');
    });

    it('CA-11: un cursor de 006 (`[grupo, creado_en, id]`) es `400` con `INVALID_CURSOR`', async () => {
      const legacy = Buffer.from(
        JSON.stringify(['file', new Date(BASE_TIME).toISOString(), randomUUID()]),
      ).toString('base64url');

      const response = await ana.folderContents({ folderId: mixedFolder.id, cursor: legacy });

      expectQueryError(response, 'cursor', 'INVALID_CURSOR');
    });
  });

  describe('carpeta de 20 000 archivos (RNF-14, R-2)', () => {
    let big: SeedNode[];
    let bigFolder: FolderRow;

    beforeAll(async () => {
      big = bigFolderNodes();
      bigFolder = await seedFolder(storage.owner, ana.id, big);
      await storage.owner.query('ANALYZE archivo');
    });

    it.each(ORDERS)(
      'CA-10, RNF-14: `%s %s` da la primera página y la siguiente en ≤ 2 s cada una',
      async (sort, dir) => {
        const expected = expectedIds(big, NodeOrder.of(sort, dir));
        const query = { folderId: bigFolder.id, sort, dir, limit: String(FILES_PAGE_MAX) };

        const [first, firstMs] = await timed(async () => bodyOf(await ana.folderContents(query)));
        const [second, secondMs] = await timed(async () =>
          bodyOf(await ana.folderContents({ ...query, cursor: first.nextCursor ?? '' })),
        );

        expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
          expected.slice(0, 2 * FILES_PAGE_MAX),
        );
        expect(firstMs).toBeLessThanOrEqual(LIST_BUDGET_MS);
        expect(secondMs).toBeLessThanOrEqual(LIST_BUDGET_MS);
      },
    );

    it.each([
      ['1000', FILES_PAGE_MAX],
      ['0', 1],
    ])('CA-11: `limit=%s` no es error: se ajusta a %i', async (limit, expected) => {
      const body = bodyOf(await ana.folderContents({ folderId: bigFolder.id, limit }));

      expect(body.items).toHaveLength(expected);
      expect(body.nextCursor).not.toBeNull();
    });
  });
});
