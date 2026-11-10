import { randomBytes } from 'node:crypto';

import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { DataSource } from 'typeorm';

import { insertChunk } from '../int/intelligence/intelligence-test-db';
import { buildTestEnv } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { harnessS3 } from '../int/storage/storage-http';
import { createIsolationWorld } from '../isolation/setup/isolation-world';
import type { IsolationWorld, WorldAccount, WorldFile } from '../isolation/setup/isolation-world';

import { connectAsOwner, requiredEnv } from './database-urls';
import { createFullApiTestApp } from './full-api-test-app';

/** Tablas de los conteos de control (plan 022c §3): mismas consultas antes de respaldar y después de restaurar. */
export const CONTROL_TABLES = [
  'plan',
  'usuario',
  'suscripcion',
  'carpeta',
  'archivo',
  'version_archivo',
  'evento_auditoria',
  'fragmento',
  'migracion',
] as const;

export type ControlTable = (typeof CONTROL_TABLES)[number];

/** Nombres inventados del corpus: iguales para las dos cuentas del mundo (nada las distingue salvo el `id`). */
const CORPUS_FILE_NAMES = ['Informe trimestral.txt', 'Acta de reunión.txt'] as const;
const CORPUS_FOLDER_NAMES = ['Proyectos', 'Facturas'] as const;
const AUDIT_EVENTS_PER_CLIENT = 2;
/** Plan de las suscripciones del corpus: lo siembran las migraciones. */
const CORPUS_PLAN_SLUG = 'personal';

/** Objeto de MinIO de una `version_archivo` del corpus. */
export interface CorpusObject {
  readonly key: string;
  readonly sizeBytes: number;
}

/** Bucket y cliente S3 donde viven los objetos del corpus. */
export interface CorpusStorage {
  readonly s3: S3Client;
  readonly bucket: string;
}

export interface ControlCounts {
  readonly rows: Readonly<Record<ControlTable, number>>;
  /** Objetos del corpus referenciados por la base que existen en MinIO con su tamaño (`HeadObject`). */
  readonly objects: number;
}

export interface BackupCorpus {
  readonly world: IsolationWorld;
  readonly objects: readonly CorpusObject[];
  readonly storage: CorpusStorage;
  /** Conteos de control de la base del arnés (`DATABASE_MIGRATION_URL`). */
  controlCounts(): Promise<ControlCounts>;
  /** Cierra la app, borra los objetos y las cuentas del corpus y cierra las conexiones. */
  close(): Promise<void>;
}

/** Filas de cada tabla de control, leídas como el dueño (sin RLS que las oculte). */
const countRows = async (db: DataSource): Promise<Record<ControlTable, number>> => {
  const entries = await Promise.all(
    CONTROL_TABLES.map(async (table) => {
      const [row] = (await db.query(`SELECT count(*)::int AS n FROM ${table}`)) as { n: number }[];
      return [table, row?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ControlTable, number>;
};

const objectMatches = async (storage: CorpusStorage, object: CorpusObject): Promise<boolean> => {
  try {
    const head = await storage.s3.send(
      new HeadObjectCommand({ Bucket: storage.bucket, Key: object.key }),
    );
    return head.ContentLength === object.sizeBytes;
  } catch {
    return false;
  }
};

/**
 * Conteos de control de `db` (plan 022c §3): filas de `CONTROL_TABLES` y objetos del corpus cuya `version_archivo`
 * sigue en `db` y que existen en MinIO con el mismo tamaño. Sirve para la base de origen y para la restaurada.
 */
export const controlCounts = async (
  db: DataSource,
  storage: CorpusStorage,
  objects: readonly CorpusObject[],
): Promise<ControlCounts> => {
  const referenced = (await db.query(
    'SELECT clave_objeto FROM version_archivo WHERE clave_objeto = ANY($1)',
    [objects.map((object) => object.key)],
  )) as { clave_objeto: string }[];
  const keys = new Set(referenced.map((row) => row.clave_objeto));
  const present = await Promise.all(
    objects
      .filter((object) => keys.has(object.key))
      .map((object) => objectMatches(storage, object)),
  );
  return { rows: await countRows(db), objects: present.filter(Boolean).length };
};

interface VersionRow {
  readonly archivo_id: string;
  readonly id: string;
  readonly clave_objeto: string;
  readonly tamano_bytes: string;
}

const versionsOf = async (owner: DataSource, files: readonly WorldFile[]): Promise<VersionRow[]> =>
  (await owner.query(
    'SELECT archivo_id, id, clave_objeto, tamano_bytes FROM version_archivo WHERE archivo_id = ANY($1)',
    [files.map((file) => file.id)],
  )) as VersionRow[];

/** Sube a MinIO un objeto de bytes aleatorios por versión, del tamaño que dice su fila, y un fragmento con vector. */
const addObjectsAndChunks = async (
  owner: DataSource,
  storage: CorpusStorage,
  files: readonly WorldFile[],
): Promise<CorpusObject[]> => {
  const objects: CorpusObject[] = [];
  for (const version of await versionsOf(owner, files)) {
    const sizeBytes = Number(version.tamano_bytes);
    await storage.s3.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: version.clave_objeto,
        Body: randomBytes(sizeBytes),
      }),
    );
    await insertChunk(owner, { fileId: version.archivo_id, versionId: version.id });
    objects.push({ key: version.clave_objeto, sizeBytes });
  }
  return objects;
};

const addSubscription = (owner: DataSource, account: WorldAccount): Promise<unknown> =>
  owner.query(
    'INSERT INTO suscripcion (usuario_id, plan_id) SELECT $1, id FROM plan WHERE slug = $2',
    [account.id, CORPUS_PLAN_SLUG],
  );

/** Carpetas, archivos (fila + versión) y eventos de auditoría de un cliente, con los `with…` del mundo. */
const seedClient = async (
  world: IsolationWorld,
  app: TestApp,
  client: WorldAccount,
): Promise<WorldFile[]> => {
  await world.withFolders(app, client, CORPUS_FOLDER_NAMES);
  await world.withAuditEvents(
    app,
    client,
    Array.from({ length: AUDIT_EVENTS_PER_CLIENT }, () => ({})),
  );
  return world.withFiles(app, client, CORPUS_FILE_NAMES);
};

const deleteObjects = async (
  storage: CorpusStorage,
  objects: readonly CorpusObject[],
): Promise<void> => {
  for (const object of objects) {
    await storage.s3.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: object.key }));
  }
};

/**
 * Corpus sintético de 022c (plan §2, RNF-16) sobre el mundo de aislamiento: dos clientes con carpetas, archivos con
 * su versión y eventos de auditoría (los `with…` del mundo, como `nimbo_app` con RLS), y lo que el mundo no trae: el
 * objeto en MinIO de cada versión, una suscripción por cliente y un fragmento con vector por versión (como el dueño).
 * Usa la base y el MinIO del entorno (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `MINIO_*`); datos inventados.
 */
export const createBackupCorpus = async (): Promise<BackupCorpus> => {
  const world = await createIsolationWorld();
  const app = await createFullApiTestApp(buildTestEnv(world.appComposition().env));
  const owner = await connectAsOwner();
  const storage: CorpusStorage = { s3: harnessS3(), bucket: requiredEnv('MINIO_BUCKET') };
  const files: WorldFile[] = [];
  for (const client of world.clients) {
    files.push(...(await seedClient(world, app, client)));
    await addSubscription(owner, client);
  }
  const objects = await addObjectsAndChunks(owner, storage, files);
  return {
    world,
    objects,
    storage,
    controlCounts: () => controlCounts(owner, storage, objects),
    close: async () => {
      await app.close();
      await deleteObjects(storage, objects);
      await world.close();
      await owner.destroy();
      storage.s3.destroy();
    },
  };
};
