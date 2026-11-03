import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  AccountReadOnlyError,
  I_OBJECT_STORAGE,
  OptimizableFileGateway,
  WritableAccountPolicy,
} from '../../../src/modules/storage';
import type { IObjectStorage, OptimizedVersionInput } from '../../../src/modules/storage';
import { ObjectKey } from '../../../src/modules/storage/domain/object-key';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';

import { registerVersion } from './register-version';
import { createStorageHttpApp, DEFAULT_TEST_LIMITS, usedBytesOf } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const DAY_MS = 86_400_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const ORIGINAL_BYTES = 8192;
const OPTIMIZED_BYTES = 3072;

/** Bytes con la firma de `signature` y relleno hasta `size` (005 solo valida la firma). */
const withSignature = (signature: Buffer, size: number, fill = 7): Buffer =>
  Buffer.concat([signature, Buffer.alloc(size - signature.length, fill)]);

/** Lo que guarda `version_archivo` de una versión, visto por el dueño de las tablas. */
interface VersionRow {
  readonly id: string;
  readonly origen: string;
  readonly creada_en: Date;
  readonly conservada_hasta: Date | null;
}

/**
 * La fachada de `storage` para 021 (plan 021 §2, PD-130 y PD-121) con Postgres como `nimbo_app` (RLS) y MinIO real:
 * qué archivo puede leer el optimizador, con su tipo real, y cómo se registra el resultado con el original de 014b.
 */
describe('fachada de `storage` para el optimizador (021 T-01, PD-130, PD-121)', () => {
  let storage: StorageHttpApp;
  let gateway: OptimizableFileGateway;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
    gateway = storage.testApp.app.get(OptimizableFileGateway);
  });

  afterAll(async () => {
    await storage?.close();
  });

  const actorOf = (client: StorageClient): Actor => createActor(client.id, Role.CLIENT);

  const uploadImage = async (client: StorageClient, name = 'foto.png'): Promise<string> => {
    const bytes = withSignature(PNG_SIGNATURE, ORIGINAL_BYTES);
    const uploaded = await client.upload(`${randomUUID()}-${name}`, bytes);
    expect(uploaded.status).toBe(200);
    return (uploaded.body as { file: { id: string } }).file.id;
  };

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      `SELECT id, origen, creada_en, conservada_hasta
         FROM version_archivo WHERE archivo_id = $1 ORDER BY numero`,
      [fileId],
    );

  const optimizedInput = async (
    client: StorageClient,
    fileId: string,
    sizeBytes = OPTIMIZED_BYTES,
  ): Promise<OptimizedVersionInput> => {
    const file = await gateway.findOwnedImage(actorOf(client), fileId);
    if (file === null) throw new Error('El archivo debería ser visible para su dueño');
    const content = withSignature(PNG_SIGNATURE, sizeBytes, 3);
    return {
      fileId,
      sourceVersionId: file.currentVersionId,
      versionId: randomUUID(),
      content: Readable.from([content]),
      sizeBytes: BigInt(sizeBytes),
    };
  };

  it('el dueño ve su imagen viva con su tipo y MIME reales; otra cuenta y la papelera, `null`', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const fileId = await uploadImage(ana);

    const seen = await gateway.findOwnedImage(actorOf(ana), fileId);

    expect(seen).toMatchObject({
      id: fileId,
      ownerId: ana.id,
      kind: 'imagen',
      mime: 'image/png',
      extension: 'png',
      sizeBytes: BigInt(ORIGINAL_BYTES),
    });
    expect(await gateway.findOwnedImage(actorOf(bruno), fileId)).toBeNull();
    expect((await ana.trashFile(fileId)).status).toBe(200);
    expect(await gateway.findOwnedImage(actorOf(ana), fileId)).toBeNull();
  });

  it('CA-4 (base): si el contenido real no corresponde a la extensión, el MIME real es `null`', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const [current] = await storage.owner.query<{ clave_objeto: string }[]>(
      `SELECT v.clave_objeto FROM version_archivo v JOIN archivo a ON a.version_actual_id = v.id WHERE a.id = $1`,
      [fileId],
    );
    await storage.putObject(
      current?.clave_objeto ?? '',
      withSignature(JPEG_SIGNATURE, ORIGINAL_BYTES),
    );

    const seen = await gateway.findOwnedImage(actorOf(ana), fileId);

    expect(seen?.mime).toBeNull();
  });

  it('`openCurrent` entrega el contenido de la versión vigente y `null` si la referencia ya no lo es', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const seen = await gateway.findOwnedImage(actorOf(ana), fileId);
    const ref = { fileId, versionId: seen?.currentVersionId ?? '' };

    const stream = await gateway.openCurrent(actorOf(ana), ref);
    const chunks: Buffer[] = [];
    for await (const chunk of stream ?? []) chunks.push(chunk as Buffer);

    expect(Buffer.concat(chunks)).toEqual(withSignature(PNG_SIGNATURE, ORIGINAL_BYTES));
    await registerVersion(storage, ana, { fileId, sizeBytes: 4096 });
    expect(await gateway.openCurrent(actorOf(ana), ref)).toBeNull();
  });

  it('CA-15: registra la `optimizacion` vigente, conserva el original con los días del plan y el espacio baja', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const before = await usedBytesOf(storage.owner, ana.id);
    const input = await optimizedInput(ana, fileId);

    const outcome = await gateway.registerOptimizedVersion(actorOf(ana), input);

    expect(outcome).toMatchObject({
      status: 'registered',
      versionId: input.versionId,
      versionNumber: 2,
    });
    const [original, optimized] = await versionRows(fileId);
    expect(optimized).toMatchObject({
      id: input.versionId,
      origen: 'optimizacion',
      conservada_hasta: null,
    });
    const days = DEFAULT_TEST_LIMITS.trashRetentionDays * DAY_MS;
    expect(original?.conservada_hasta?.getTime()).toBe(
      (optimized?.creada_en.getTime() ?? 0) + days,
    );
    expect(await usedBytesOf(storage.owner, ana.id)).toBe(
      before - BigInt(ORIGINAL_BYTES) + BigInt(OPTIMIZED_BYTES),
    );
  });

  it('CA-12: el mismo `versionId` otra vez es `duplicate`: una sola versión y el objeto intacto', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);
    await gateway.registerOptimizedVersion(actorOf(ana), input);
    const content = Readable.from([withSignature(PNG_SIGNATURE, OPTIMIZED_BYTES, 3)]);

    const again = await gateway.registerOptimizedVersion(actorOf(ana), { ...input, content });

    expect(again).toEqual({
      status: 'duplicate',
      versionId: input.versionId,
      sizeBytes: BigInt(OPTIMIZED_BYTES),
    });
    expect(await versionRows(fileId)).toHaveLength(2);
    const key = ObjectKey.of(ana.id, fileId, input.versionId).value;
    expect((await storage.readObject(key)).length).toBe(OPTIMIZED_BYTES);
  });

  it('CA-11: si la versión de origen ya no es la vigente, es `file_changed` y no queda nada', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);
    await registerVersion(storage, ana, { fileId, sizeBytes: 4096 });
    const before = await usedBytesOf(storage.owner, ana.id);

    const outcome = await gateway.registerOptimizedVersion(actorOf(ana), input);

    expect(outcome).toEqual({ status: 'file_changed' });
    expect((await versionRows(fileId)).map((row) => row.origen)).toEqual(['carga', 'carga']);
    expect(await storage.versionsOf(ObjectKey.of(ana.id, fileId, input.versionId).value)).toBe(0);
    expect(await usedBytesOf(storage.owner, ana.id)).toBe(before);
  });

  it('un resultado que no es menor es `not_smaller`: ni versión ni original conservado (014b RN-2)', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId, ORIGINAL_BYTES);

    const outcome = await gateway.registerOptimizedVersion(actorOf(ana), input);

    expect(outcome).toEqual({ status: 'not_smaller' });
    const rows = await versionRows(fileId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.conservada_hasta).toBeNull();
  });

  it('`file_missing` para un archivo ajeno: no registra ni toca la versión del dueño', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);

    const outcome = await gateway.registerOptimizedVersion(actorOf(bruno), input);

    expect(outcome).toEqual({ status: 'file_missing' });
    expect(await versionRows(fileId)).toHaveLength(1);
  });

  it('`corrupt` si la firma real del resultado no es la de la extensión: no registra y borra el objeto', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);
    const content = Readable.from([withSignature(JPEG_SIGNATURE, OPTIMIZED_BYTES)]);

    const outcome = await gateway.registerOptimizedVersion(actorOf(ana), { ...input, content });

    expect(outcome).toEqual({ status: 'corrupt' });
    expect(await versionRows(fileId)).toHaveLength(1);
    expect(await storage.versionsOf(ObjectKey.of(ana.id, fileId, input.versionId).value)).toBe(0);
  });

  it('PD-121: `storage` exporta la política de solo lectura y su error para `optimizer`', async () => {
    const ana = await storage.newClient();
    const policy = storage.testApp.app.get(WritableAccountPolicy);
    storage.limits.setReadOnly(true);
    try {
      await expect(policy.assertWritable(actorOf(ana))).rejects.toBeInstanceOf(
        AccountReadOnlyError,
      );
    } finally {
      storage.limits.setReadOnly(false);
    }
  });

  it('Art. XI: un fallo de lectura tras el upload purga el candidato real sin cambiar versiones ni cuota', async () => {
    const ana = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);
    const before = await usedBytesOf(storage.owner, ana.id);
    const objects = storage.testApp.app.get<IObjectStorage>(I_OBJECT_STORAGE);
    const failure = new Error('Lectura del candidato fallida');
    jest.spyOn(objects, 'getRange').mockRejectedValueOnce(failure);

    await expect(gateway.registerOptimizedVersion(actorOf(ana), input)).rejects.toBe(failure);

    expect(await storage.versionsOf(ObjectKey.of(ana.id, fileId, input.versionId).value)).toBe(0);
    expect(await versionRows(fileId)).toHaveLength(1);
    expect((await gateway.findOwned(actorOf(ana), fileId))?.currentVersionId).toBe(
      input.sourceVersionId,
    );
    expect(await usedBytesOf(storage.owner, ana.id)).toBe(before);
  });

  it('CA-12: recupera solo los metadatos de una optimización propia ya registrada, no una carga ni versiones ajenas', async () => {
    const ana = await storage.newClient();
    const bruno = await storage.newClient();
    const fileId = await uploadImage(ana);
    const input = await optimizedInput(ana, fileId);
    expect(
      await gateway.findRegisteredOptimization(actorOf(ana), {
        fileId,
        versionId: input.sourceVersionId,
      }),
    ).toBeNull();
    await gateway.registerOptimizedVersion(actorOf(ana), input);
    const ref = { fileId, versionId: input.versionId };
    expect(await gateway.findRegisteredOptimization(actorOf(ana), ref)).toEqual({
      status: 'duplicate',
      versionId: input.versionId,
      sizeBytes: BigInt(OPTIMIZED_BYTES),
    });
    expect(await gateway.findRegisteredOptimization(actorOf(bruno), ref)).toBeNull();
  });
});
