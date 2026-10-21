import { downloadUrlSchema } from '@nimbo/contracts';

import {
  createStorageHttpApp,
  DEFAULT_TEST_LIMITS,
  sha256,
  textBytes,
  usedBytesOf,
} from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const MIB = 1024 * 1024;
const SMALL_BYTES = 4096;
/** Máximo de 1 MiB y una cuota apenas mayor: un reemplazo de 1 MiB cabe por tamaño pero no en la cuota. */
const LIMITS = {
  ...DEFAULT_TEST_LIMITS,
  maxFileBytes: BigInt(MIB),
  storageQuotaBytes: BigInt(MIB + 2048),
};
const NAME = 'informe.txt';

/** Lo que queda de una versión en `version_archivo`, visto por el dueño de las tablas. */
interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly origen: string;
  readonly clave_objeto: string;
}

/** Texto que no es UTF-8 válido: un `.txt` con esos bytes contradice su extensión (005 CA-11). */
const invalidUtf8 = (): Buffer => Buffer.alloc(SMALL_BYTES, Buffer.from([0xc3, 0x28, 0xff, 0xfe]));

/**
 * Reemplazar un archivo por HTTP (014 CA-1, CA-2, CA-3, CA-15, CA-19): `POST /uploads` con `onConflict: 'replace'`,
 * Postgres como `nimbo_app` (RLS) y el MinIO real del arnés. La descarga de la versión anterior por la API llega con
 * T-05: aquí se comprueba que su objeto sigue intacto en MinIO.
 */
describe('reemplazar un archivo (014 CA-1, CA-2, CA-3, CA-15)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp({ limits: LIMITS });
  });

  afterAll(async () => {
    await storage?.close();
  });

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage.owner.query<VersionRow[]>(
      'SELECT id, numero, origen, clave_objeto FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );

  const currentVersionOf = async (fileId: string): Promise<string | undefined> => {
    const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return row?.version_actual_id;
  };

  /** Sube `NAME` como archivo nuevo y devuelve su id. */
  const uploadOriginal = async (client: StorageClient, bytes: Buffer): Promise<string> => {
    const response = await client.upload(NAME, bytes);
    expect(response.status).toBe(200);
    return (response.body as { file: { id: string } }).file.id;
  };

  const download = async (client: StorageClient, fileId: string): Promise<Buffer> => {
    const issued = await client.downloadUrl(fileId);
    const response = await fetch(downloadUrlSchema.parse(issued.body).url);
    return Buffer.from(await response.arrayBuffer());
  };

  it('CA-1: el mismo archivo pasa a la versión 2 con el contenido nuevo y la anterior se conserva', async () => {
    const client = await storage.newClient();
    const original = textBytes(SMALL_BYTES, 'original');
    const replacement = textBytes(2 * SMALL_BYTES, 'reemplazo');
    const fileId = await uploadOriginal(client, original);

    const response = await client.upload('INFORME.txt', replacement, 'replace');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      file: { id: fileId, name: NAME, sizeBytes: replacement.length },
    });
    const rows = await versionRows(fileId);
    expect(rows.map((row) => [row.numero, row.origen])).toEqual([
      [1, 'carga'],
      [2, 'carga'],
    ]);
    expect(await currentVersionOf(fileId)).toBe(rows[1]?.id);
    expect(sha256(await download(client, fileId))).toBe(sha256(replacement));
    expect(sha256(await storage.readObject(rows[0]?.clave_objeto ?? ''))).toBe(sha256(original));
    expect(await usedBytesOf(storage.owner, client.id)).toBe(
      BigInt(original.length + replacement.length),
    );
  });

  it('CA-1: con `replace` y sin un archivo de ese nombre, sube uno nuevo', async () => {
    const client = await storage.newClient();

    const response = await client.upload(NAME, textBytes(SMALL_BYTES), 'replace');

    expect(response.status).toBe(200);
    const fileId = (response.body as { file: { id: string } }).file.id;
    expect((await versionRows(fileId)).map((row) => row.numero)).toEqual([1]);
  });

  it('CA-3: un reemplazo cuyo contenido contradice su extensión es 422 sin versión nueva', async () => {
    const client = await storage.newClient();
    const original = textBytes(SMALL_BYTES);
    const fileId = await uploadOriginal(client, original);
    const before = await currentVersionOf(fileId);

    const response = await client.upload(NAME, invalidUtf8(), 'replace');

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'STORAGE_INVALID_FILE_TYPE' });
    expect((await versionRows(fileId)).map((row) => row.numero)).toEqual([1]);
    expect(await currentVersionOf(fileId)).toBe(before);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(original.length));
  });

  it('CA-2: un reemplazo mayor que el máximo del plan o que la cuota es 422 y la versión actual no cambia', async () => {
    const client = await storage.newClient();
    const fileId = await uploadOriginal(client, textBytes(SMALL_BYTES));
    const before = await currentVersionOf(fileId);

    const tooLarge = await client.init({ name: NAME, sizeBytes: MIB + 1, onConflict: 'replace' });
    const overQuota = await client.init({ name: NAME, sizeBytes: MIB, onConflict: 'replace' });

    expect(tooLarge.status).toBe(422);
    expect(tooLarge.body).toMatchObject({ code: 'STORAGE_FILE_TOO_LARGE' });
    expect(overQuota.status).toBe(422);
    expect(overQuota.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect(await currentVersionOf(fileId)).toBe(before);
    expect((await versionRows(fileId)).map((row) => row.numero)).toEqual([1]);
  });

  it('CA-15: con `ask` y el archivo en su límite, el 409 trae `wouldPruneVersion`; con espacio, no', async () => {
    const client = await storage.newClient();
    await uploadOriginal(client, textBytes(SMALL_BYTES));
    await client.upload(NAME, textBytes(SMALL_BYTES), 'replace');

    const withRoom = await client.init({ name: NAME, sizeBytes: SMALL_BYTES });
    await client.upload(NAME, textBytes(SMALL_BYTES), 'replace');
    const atLimit = await client.init({ name: NAME, sizeBytes: SMALL_BYTES });

    expect(withRoom.status).toBe(409);
    expect(withRoom.body).toMatchObject({ code: 'STORAGE_NAME_CONFLICT' });
    expect((withRoom.body as { details: object }).details).toEqual({
      suggestedName: 'informe (1).txt',
    });
    expect(atLimit.status).toBe(409);
    expect(atLimit.body).toMatchObject({
      details: { suggestedName: 'informe (1).txt', wouldPruneVersion: 1 },
    });
  });
});
