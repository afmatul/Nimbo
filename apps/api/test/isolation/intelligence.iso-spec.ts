import { randomUUID } from 'node:crypto';

import type { Job } from 'bullmq';
import request from 'supertest';
import type { Response } from 'supertest';

import { IndexReconciler } from '../../src/modules/intelligence/application/index-reconciler';
import { I_CHUNK_REPOSITORY } from '../../src/modules/intelligence/application/ports/i-chunk-repository.port';
import type {
  IChunkRepository,
  StoredChunk,
} from '../../src/modules/intelligence/application/ports/i-chunk-repository.port';
import type { IndexJob } from '../../src/modules/intelligence/application/ports/i-index-queue.port';
import { INDEXING_JOB } from '../../src/modules/intelligence/infrastructure/bullmq-index.queue';
import { TypeOrmChunkSearch } from '../../src/modules/intelligence/infrastructure/persistence/typeorm-chunk-search';
import { IndexableFileGateway } from '../../src/modules/storage';
import type { IndexableFile } from '../../src/modules/storage';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { createIndexingWorld } from '../int/intelligence/indexing-world';
import type { IndexingWorld, UploadedFile } from '../int/intelligence/indexing-world';
import { waitForLog } from '../int/setup/wait-for-log';
import { connectTo, requiredEnv } from '../support/database-urls';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const API_PREFIX = '/api/v1';
/** A y B suben un archivo con el mismo nombre y un contenido que difiere en un dígito. */
const NAME = 'Contrato de arrendamiento.txt';
const contractOf = (amount: string): Buffer =>
  Buffer.from(
    `Contrato de arrendamiento de Ana López. Renta mensual de ${amount} quetzales, pagadera el día 5.`,
    'utf8',
  );
const AMOUNT_A = '4500';
const AMOUNT_B = '4501';
/** Más que todos los fragmentos de la suite: la búsqueda vectorial devuelve todo lo que el actor ve. */
const NEAREST_LIMIT = 50;
const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };
const FORBIDDEN = { status: 403, code: 'SHARED_FORBIDDEN' };

interface IndexingSnapshot {
  readonly estado: string;
  readonly intentos: number;
  readonly fragmentos: number;
  readonly actualizado_en: Date;
}

const fileIdsOf = (chunks: readonly StoredChunk[]): string[] => [
  ...new Set(chunks.map((chunk) => chunk.fileId)),
];

/** Código y estado HTTP de una respuesta. */
const errorOf = (response: Response): { status: number; code: unknown } => ({
  status: response.status,
  code: (response.body as { code?: unknown }).code,
});

/** Datos de cada trabajo que se encola en `queue` desde ahora (`Queue.add` emite `waiting` en la misma instancia). */
const recordJobs = (queue: IndexingWorld['indexingQueue']): Record<string, unknown>[] => {
  const recorded: Record<string, unknown>[] = [];
  queue.on('waiting', (job: Job) => recorded.push(job.data as Record<string, unknown>));
  return recorded;
};

/**
 * Aislamiento de la indexación (019 T-09; CA-17, CA-18, CA-20; RNF-05, Art. IX) con el `api` y el `worker` reales
 * (`createIndexingWorld`), Postgres como `nimbo_app`, Redis y MinIO, y los tokens reales del mundo de aislamiento. A y B
 * tienen un contrato casi idéntico ya indexado: los fragmentos de A no le llegan a B ni por id ni por similitud (con el
 * vector exacto de un fragmento de A), ni a los roles internos, ni a `nimbo_app` sin actor; las rutas de estado y
 * «Reintentar» responden a B lo mismo que a un id inexistente; un trabajo `indexing` con dueño falsificado se descarta
 * sin leer el objeto; la conciliación actúa como cada cuenta. Cada prueba lleva su control positivo (A sí ve lo suyo).
 */
describe('aislamiento de la indexación (019 CA-17, CA-18, CA-20)', () => {
  let iso: IsolationWorld;
  let world: IndexingWorld;
  let a: WorldAccount;
  let b: WorldAccount;
  let fileA: UploadedFile;
  let fileB: UploadedFile;
  let failedA: UploadedFile;
  let enqueued: Record<string, unknown>[];
  let notices: Record<string, unknown>[];

  const workerGet = <T>(token: unknown): T =>
    world.worker.app.get<unknown, T>(token as symbol, { strict: false });
  const chunks = (): IChunkRepository => workerGet<IChunkRepository>(I_CHUNK_REPOSITORY);
  /** Por similitud con la búsqueda del agente (020 D-2 retiró `nearest`), en todos los archivos del actor. */
  const nearest = (actor: Actor, vector: readonly number[]): Promise<readonly StoredChunk[]> =>
    new TypeOrmChunkSearch(workerGet<TransactionContext>(TransactionContext)).vectorSearch(actor, {
      vector,
      scope: { type: 'all' },
      limit: NEAREST_LIMIT,
    });
  const clientActor = (account: WorldAccount): Actor => createActor(account.id, Role.CLIENT);
  const internalActor = (role: (typeof INTERNAL_ROLES)[number]): Actor =>
    createActor(iso.internals[role].id, role);

  /** Corre `work` dentro de un `withActor(actor)` del `worker`, como lo hacen los servicios. */
  const asActor = <T>(actor: Actor, work: () => Promise<T>): Promise<T> =>
    workerGet<ITransactionRunner>(I_TRANSACTION_RUNNER).withActor(actor, work);

  /** `SELECT` crudo (sin `accessibleNodes`) con el ámbito del actor: solo la RLS decide. */
  const countAs = (actor: Actor, table: string, fileIds: readonly string[]): Promise<number> =>
    asActor(actor, async () => {
      const manager = workerGet<TransactionContext>(TransactionContext).requireActorScope(actor);
      const [row] = (await manager.query(
        `SELECT count(*)::int AS total FROM ${table} WHERE archivo_id = ANY($1)`,
        [fileIds],
      )) as { total: number }[];
      return row?.total ?? -1;
    });

  const http = () => request(world.storage.testApp.app.getHttpServer());
  const bearer = (account: WorldAccount) => ({ Authorization: `Bearer ${iso.tokenFor(account)}` });
  const statusOf = (account: WorldAccount, fileId: string) =>
    http().get(`${API_PREFIX}/files/${fileId}/indexing`).set(bearer(account));
  const retryOf = (account: WorldAccount, fileId: string) =>
    http().post(`${API_PREFIX}/files/${fileId}/indexing/retry`).set(bearer(account));

  const upload = (account: WorldAccount, name: string, bytes: Buffer): Promise<UploadedFile> =>
    world.upload(world.storage.clientFor(account.id, iso.tokenFor(account)), name, bytes);

  /** Sube el contrato (el primero de cada cuenta con `NAME`; los demás, con un nombre único) y espera `indexado`. */
  const indexed = async (
    account: WorldAccount,
    amount: string,
    name = `Contrato ${randomUUID()}.txt`,
  ): Promise<UploadedFile> => {
    const file = await upload(account, name, contractOf(amount));
    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'indexado' });
    await world.settledNoticesOf(file.fileId);
    return file;
  };

  /** `fallido` sin clave del proveedor (reintentable por su propietaria); luego el proveedor vuelve. */
  const failed = async (account: WorldAccount): Promise<UploadedFile> => {
    world.embedder.mode = 'keyless';
    const file = await upload(account, `Fallido ${randomUUID()}.txt`, contractOf(AMOUNT_A));
    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'fallido' });
    await world.settledNoticesOf(file.fileId);
    world.embedder.mode = 'up';
    return file;
  };

  const snapshotOf = async (versionId: string): Promise<IndexingSnapshot | undefined> => {
    const [row] = await world.storage.owner.query<IndexingSnapshot[]>(
      'SELECT estado, intentos, fragmentos, actualizado_en FROM indexacion WHERE version_archivo_id = $1',
      [versionId],
    );
    return row;
  };

  const ownerChunkCount = async (fileId: string): Promise<number> =>
    (await world.chunksOf(fileId)).length;

  beforeAll(async () => {
    iso = await createIsolationWorld();
    world = await createIndexingWorld({ api: iso.appComposition() });
    [a, b] = iso.clients;
    enqueued = recordJobs(world.indexingQueue);
    notices = recordJobs(world.statusQueue);
    fileA = await indexed(a, AMOUNT_A, NAME);
    fileB = await indexed(b, AMOUNT_B, NAME);
    failedA = await failed(a);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    world.embedder.reset();
  });

  afterAll(async () => {
    await world?.close();
    await iso?.close();
  });

  describe('`IChunkRepository` e `IChunkSearch` (CA-17, DF-14)', () => {
    /** Vector guardado del primer fragmento de A, leído como el dueño de las tablas. */
    const vectorOfA = async (): Promise<number[]> => {
      const [row] = await world.storage.owner.query<{ embedding: string }[]>(
        'SELECT embedding::text AS embedding FROM fragmento WHERE archivo_id = $1 ORDER BY orden LIMIT 1',
        [fileA.fileId],
      );
      return JSON.parse(row?.embedding ?? '[]') as number[];
    };

    it('ISO-1 (CA-17): B no puede leer por id los fragmentos del archivo de A', async () => {
      const [asB, asA] = [clientActor(b), clientActor(a)];

      const foreign = await asActor(asB, () => chunks().findByFile(asB, fileA.fileId));
      const own = await asActor(asA, () => chunks().findByFile(asA, fileA.fileId));

      expect(foreign).toEqual([]);
      expect(own.length).toBeGreaterThan(0);
      expect(own.length).toBe(await ownerChunkCount(fileA.fileId));
    });

    it('ISO-2 (CA-17): B no puede recuperar por similitud fragmentos de A, ni con el vector exacto de A', async () => {
      const [asB, asA] = [clientActor(b), clientActor(a)];
      const vector = await vectorOfA();

      const foreign = await asActor(asB, () => nearest(asB, vector));
      const own = await asActor(asA, () => nearest(asA, vector));

      expect(fileIdsOf(foreign)).toEqual([fileB.fileId]);
      expect(foreign.map((chunk) => chunk.text).join(' ')).not.toContain(AMOUNT_A);
      expect(own[0]?.fileId).toBe(fileA.fileId);
      expect(fileIdsOf(own)).not.toContain(fileB.fileId);
    });

    it.each(INTERNAL_ROLES)(
      'ISO-3 (CA-20): %s no puede leer fragmentos de nadie por id ni por similitud',
      async (role) => {
        const internal = internalActor(role);
        const vector = await vectorOfA();

        const byId = await asActor(internal, () => chunks().findByFile(internal, fileA.fileId));
        const bySimilarity = await asActor(internal, () => nearest(internal, vector));

        expect([byId, bySimilarity]).toEqual([[], []]);
      },
    );
  });

  describe('RLS de `fragmento` e `indexacion` (CA-17, CA-20, RNF-05)', () => {
    const tables = ['fragmento', 'indexacion'] as const;
    const worldFiles = (): string[] => [fileA.fileId, fileB.fileId, failedA.fileId];

    it.each(tables)(
      'ISO-4 (CA-17): B no puede ver filas de `%s` de A con una consulta sin `accessibleNodes`',
      async (table) => {
        expect(await countAs(clientActor(b), table, [fileA.fileId, failedA.fileId])).toBe(0);
        expect(await countAs(clientActor(a), table, [fileA.fileId])).toBeGreaterThan(0);
      },
    );

    it.each(tables)(
      'ISO-5 (RNF-05): `nimbo_app` sin actor no puede ver ninguna fila de `%s`',
      async (table) => {
        const bare = await connectTo(requiredEnv('DATABASE_URL'));
        try {
          const [row] = (await bare.query(
            `SELECT count(*)::int AS total FROM ${table} WHERE archivo_id = ANY($1)`,
            [worldFiles()],
          )) as { total: number }[];

          expect(row?.total).toBe(0);
        } finally {
          await bare.destroy();
        }
      },
    );

    it.each(INTERNAL_ROLES)(
      'ISO-6 (CA-20): %s no puede ver filas de `fragmento` ni de `indexacion`',
      async (role) => {
        const internal = internalActor(role);

        const counts = [
          await countAs(internal, 'fragmento', worldFiles()),
          await countAs(internal, 'indexacion', worldFiles()),
        ];

        expect(counts).toEqual([0, 0]);
      },
    );
  });

  describe('rutas de estado y «Reintentar» (CA-18, CA-20)', () => {
    const retriedAuditsOf = async (fileId: string): Promise<number> => {
      const [row] = await world.storage.owner.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM evento_auditoria
          WHERE recurso_id = $1 AND accion = 'file.index_retried'`,
        [fileId],
      );
      return row?.total ?? -1;
    };
    it('ISO-7 (CA-18): B no puede consultar el estado del archivo de A: mismo 404 que un id inexistente o inválido', async () => {
      const foreign = await statusOf(b, fileA.fileId);
      const missing = await statusOf(b, randomUUID());
      const invalid = await statusOf(b, 'no-es-un-uuid');

      expect(errorOf(foreign)).toEqual(NOT_FOUND);
      expect(comparable(foreign)).toEqual(comparable(missing));
      expect(comparable(foreign)).toEqual(comparable(invalid));
      expect((await statusOf(a, fileA.fileId)).body).toMatchObject({ state: 'indexado' });
    });

    it('ISO-8 (CA-18): B no puede reintentar la indexación `fallido` de A: mismo 404 que un id inexistente, sin efectos', async () => {
      const [before, jobsBefore] = [await snapshotOf(failedA.versionId), enqueued.length];

      const foreign = await retryOf(b, failedA.fileId);
      const missing = await retryOf(b, randomUUID());

      expect(errorOf(foreign)).toEqual(NOT_FOUND);
      expect(comparable(foreign)).toEqual(comparable(missing));
      expect(await snapshotOf(failedA.versionId)).toEqual(before);
      expect(enqueued.slice(jobsBefore)).toEqual([]);
      expect(await retriedAuditsOf(failedA.fileId)).toBe(0);
      expect((await statusOf(a, failedA.fileId)).body).toMatchObject({ canRetry: true });
    });

    it.each(INTERNAL_ROLES)(
      'ISO-9 (CA-20): %s no puede consultar ni reintentar la indexación de A: `SHARED_FORBIDDEN`, sin efectos',
      async (role) => {
        const internal = iso.internals[role];
        const [before, jobsBefore] = [await snapshotOf(failedA.versionId), enqueued.length];

        const responses = [
          await statusOf(internal, fileA.fileId),
          await retryOf(internal, failedA.fileId),
        ];

        expect(responses.map(errorOf)).toEqual([FORBIDDEN, FORBIDDEN]);
        expect(JSON.stringify(responses.map((response) => response.body))).not.toMatch(
          /indexado|fallido|state/,
        );
        expect(await snapshotOf(failedA.versionId)).toEqual(before);
        expect(await retriedAuditsOf(failedA.fileId)).toBe(0);
        expect(enqueued.slice(jobsBefore)).toEqual([]);
      },
    );
  });

  describe('trabajos `indexing` con dueño falsificado (CA-16, CA-17)', () => {
    let pendingA: UploadedFile;

    /** Un archivo de A en `pendiente`: si el `worker` confiara en `ownerId`, lo reclamaría y lo reindexaría. */
    beforeAll(async () => {
      pendingA = await indexed(a, AMOUNT_A);
      await world.storage.owner.query(
        `UPDATE indexacion SET estado = 'pendiente', motivo = NULL, fragmentos = 0, duracion_ms = NULL
          WHERE version_archivo_id = $1`,
        [pendingA.versionId],
      );
    });

    /** Encola el trabajo en `indexing` como lo haría un productor; devuelve su `correlationId`. */
    const enqueue = async (job: IndexJob): Promise<string> => {
      const correlationId = randomUUID();
      await world.indexingQueue.add(
        INDEXING_JOB,
        { ...job, correlationId },
        { jobId: randomUUID(), removeOnComplete: true, removeOnFail: true },
      );
      return correlationId;
    };

    /** Encola el trabajo y espera a que el `worker` lo descarte; devuelve la causa. */
    const runForged = async (job: IndexJob): Promise<string> => {
      const correlationId = await enqueue(job);
      const discarded = await waitForLog(
        world.worker.logs,
        (line) => line.event === 'indexing.discarded' && line.correlationId === correlationId,
      );
      return String(discarded.cause);
    };

    const forgedJobs: readonly [string, () => IndexJob][] = [
      [
        'B (archivo y versión de A)',
        () => ({ fileId: pendingA.fileId, versionId: pendingA.versionId, ownerId: b.id }),
      ],
      [
        'un Administrador (archivo y versión de A)',
        () => ({
          fileId: pendingA.fileId,
          versionId: pendingA.versionId,
          ownerId: iso.internals[Role.ADMIN].id,
        }),
      ],
      [
        'B (archivo propio con la versión de A)',
        () => ({ fileId: fileB.fileId, versionId: pendingA.versionId, ownerId: b.id }),
      ],
    ];

    it.each(forgedJobs)(
      'ISO-10 (CA-17): un trabajo a nombre de %s no puede leer ni indexar el contenido de A',
      async (_owner, jobOf) => {
        const gateway = workerGet<IndexableFileGateway>(IndexableFileGateway);
        const read = jest.spyOn(gateway, 'openCurrent');
        const before = await snapshotOf(pendingA.versionId);
        const [calls, noticesBefore] = [world.embedder.calls, notices.length];
        const chunksOfB = await ownerChunkCount(fileB.fileId);

        const cause = await runForged(jobOf());

        expect(cause).toBe('not_current');
        expect(read).not.toHaveBeenCalled();
        expect(world.embedder.calls).toBe(calls);
        expect(await snapshotOf(pendingA.versionId)).toEqual(before);
        expect(await ownerChunkCount(pendingA.fileId)).toBeGreaterThan(0);
        expect(await ownerChunkCount(fileB.fileId)).toBe(chunksOfB);
        expect(notices.slice(noticesBefore)).toEqual([]);
      },
    );

    it('control: el mismo trabajo a nombre de A sí lee su contenido y lo reindexa', async () => {
      const read = jest.spyOn(workerGet<IndexableFileGateway>(IndexableFileGateway), 'openCurrent');

      await enqueue({ fileId: pendingA.fileId, versionId: pendingA.versionId, ownerId: a.id });

      expect(await world.settled(pendingA.versionId)).toMatchObject({ estado: 'indexado' });
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ id: a.id }), {
        fileId: pendingA.fileId,
        versionId: pendingA.versionId,
      });
    });
  });

  describe('conciliación (CA-23, CA-17)', () => {
    /** Un archivo ya indexado al que se le borra el rastro, como uno anterior a 019. */
    const withoutIndex = async (account: WorldAccount, amount: string): Promise<UploadedFile> => {
      const file = await indexed(account, amount);
      await world.storage.owner.query('DELETE FROM fragmento WHERE archivo_id = $1', [file.fileId]);
      await world.storage.owner.query('DELETE FROM indexacion WHERE archivo_id = $1', [
        file.fileId,
      ]);
      return file;
    };

    /** Cada página de `listIndexable` con el actor que la pidió, ya resuelta. */
    const listedPages = async (
      spy: jest.SpiedFunction<IndexableFileGateway['listIndexable']>,
    ): Promise<{ actor: Actor; files: readonly IndexableFile[] }[]> =>
      Promise.all(
        spy.mock.calls.map(async ([actor], index) => ({
          actor,
          files: await (spy.mock.results[index]?.value as Promise<readonly IndexableFile[]>),
        })),
      );

    /** Termina `indexado` y sus fragmentos son solo del contenido de su cuenta. */
    const expectIndexedWith = async (file: UploadedFile, amount: string): Promise<void> => {
      expect(await world.settled(file.versionId)).toMatchObject({ estado: 'indexado' });
      const texts = (await world.chunksOf(file.fileId)).map((chunk) => chunk.texto).join(' ');
      expect(texts).toContain(amount);
      expect(texts).not.toContain(amount === AMOUNT_A ? AMOUNT_B : AMOUNT_A);
    };

    /** Cada página listada es de la cuenta con cuyo actor (cliente) se pidió; devuelve el dueño de cada archivo. */
    const expectOwnPages = async (
      spy: jest.SpiedFunction<IndexableFileGateway['listIndexable']>,
    ): Promise<ReadonlyMap<string, string>> => {
      const owners = new Map<string, string>();
      for (const { actor, files } of await listedPages(spy)) {
        expect(actor.role).toBe(Role.CLIENT);
        files.forEach((file) => {
          expect(file.ownerId).toBe(actor.id);
          owners.set(file.id, actor.id);
        });
      }
      return owners;
    };

    it('ISO-11 (CA-23): la conciliación no puede mezclar archivos entre cuentas: actúa y encola como cada una', async () => {
      const [previousA, previousB] = [
        await withoutIndex(a, AMOUNT_A),
        await withoutIndex(b, AMOUNT_B),
      ];
      const gateway = workerGet<IndexableFileGateway>(IndexableFileGateway);
      jest
        .spyOn(gateway, 'clientIds')
        .mockImplementation((page) => Promise.resolve(page.afterId === null ? [a.id, b.id] : []));
      const listed = jest.spyOn(gateway, 'listIndexable');
      const jobsBefore = enqueued.length;

      await workerGet<IndexReconciler>(IndexReconciler).reconcileAll();

      const owners = await expectOwnPages(listed);
      const jobs = enqueued.slice(jobsBefore);
      jobs.forEach((job) => expect(job.ownerId).toBe(owners.get(String(job.fileId))));
      expect(jobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ versionId: previousA.versionId, ownerId: a.id }),
          expect.objectContaining({ versionId: previousB.versionId, ownerId: b.id }),
        ]),
      );
      await expectIndexedWith(previousA, AMOUNT_A);
      await expectIndexedWith(previousB, AMOUNT_B);
    });
  });
});
