import { completeUploadResponseSchema, initUploadResponseSchema } from '@nimbo/contracts';

import {
  countRows,
  createStorageHttpApp,
  otherBytes,
  textBytes,
  uploadBytes,
  uploadRow,
  usedBytesOf,
} from './storage-http';
import type { InitBody, StorageHttpApp } from './storage-http';

const BODY_BYTES = 2048;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** `head` seguido de relleno ASCII hasta `BODY_BYTES`. */
const withBody = (head: Buffer): Buffer =>
  Buffer.concat([head, Buffer.alloc(BODY_BYTES - head.length, 0x41)]);

const pngBytes = (): Buffer => withBody(PNG_SIGNATURE);
const pdfBytes = (): Buffer => withBody(Buffer.from('%PDF-1.7\n', 'latin1'));

/** Cabecera mínima de un ejecutable PE (`MZ` + `e_lfanew` → `PE\0\0`). */
const portableExecutable = (): Buffer => {
  const data = Buffer.alloc(BODY_BYTES, 0);
  data.write('MZ', 0, 'latin1');
  data.writeUInt32LE(0x80, 0x3c);
  data.write('PE\0\0', 0x80, 'latin1');
  return data;
};

/** Cabecera ELF. */
const elfExecutable = (): Buffer =>
  withBody(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]));

/** Bytes que no son UTF-8 válido (continuaciones sueltas). */
const invalidUtf8 = (): Buffer => withBody(Buffer.from([0xc3, 0x28, 0xa0, 0xa1, 0xff, 0xfe]));

/**
 * Tipo real al completar, por HTTP, con MinIO real y bucket **versionado** (CA-11, CA-12, CA-24): un rechazo deja la
 * carga `rechazada` con motivo `tipo_invalido`, sin `archivo`, sin espacio ni reserva, y sin el objeto ni como versión.
 */
describe('POST /uploads/:id/complete valida el tipo real (CA-11, CA-12, CA-24)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  const uploadAndComplete = async (name: string, bytes: Buffer) => {
    const client = await storage.newClient();
    const started = await client.init({ name, sizeBytes: bytes.length });
    expect(started.status).toBe(201);
    const init = initUploadResponseSchema.parse(started.body) as InitBody;
    await uploadBytes(init, bytes);
    const response = await client.complete(init.uploadId);
    return { client, response, row: await uploadRow(storage.owner, init.uploadId) };
  };

  it.each([
    ['un `.pdf` que es texto', 'informe.pdf', () => textBytes(BODY_BYTES), 'pdf'],
    ['un `.png` que es un PDF', 'foto.png', pdfBytes, 'png'],
    ['un `.docx` que no es ZIP', 'contrato.docx', () => textBytes(BODY_BYTES), 'docx'],
    ['un `.txt` que no es UTF-8', 'notas.txt', invalidUtf8, 'txt'],
  ])(
    'CA-11: %s se rechaza con 422, sin archivo ni objeto',
    async (_case, name, bytesOf, extension) => {
      const { client, response, row } = await uploadAndComplete(name, bytesOf());

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'STORAGE_INVALID_FILE_TYPE',
        message: `Este archivo no es un .${extension} válido. Comprueba que sea el archivo correcto.`,
      });
      expect(row).toMatchObject({ estado: 'rechazada', motivo_rechazo: 'tipo_invalido' });
      expect(await storage.versionsOf(row.clave_objeto)).toBe(0);
      expect(await countRows(storage.owner, 'archivo', client.id)).toBe(0);
      expect(await usedBytesOf(storage.owner, client.id)).toBe(0n);
    },
  );

  it.each([
    ['PE con extensión «otros»', 'instalador.bin', portableExecutable],
    ['PE disfrazado de `.pdf`', 'factura.pdf', portableExecutable],
    ['ELF con extensión «otros»', 'herramienta.dat', elfExecutable],
  ])('CA-24: un ejecutable (%s) siempre se rechaza', async (_case, name, bytesOf) => {
    const { response, row } = await uploadAndComplete(name, bytesOf());

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'STORAGE_INVALID_FILE_TYPE',
      message: 'No se permiten archivos ejecutables. Sube otro archivo.',
    });
    expect(row.estado).toBe('rechazada');
    expect(await storage.versionsOf(row.clave_objeto)).toBe(0);
  });

  it('CA-11, CA-23: tras un rechazo la reserva se libera (el cupo vuelve a estar disponible)', async () => {
    const { client, response } = await uploadAndComplete('otra.pdf', textBytes(BODY_BYTES));
    expect(response.status).toBe(422);

    const reservations = (await storage.owner.query(
      "SELECT count(*)::int AS total FROM carga WHERE propietario_id = $1 AND estado = 'activa'",
      [client.id],
    )) as { total: number }[];

    expect(reservations[0]?.total).toBe(0);
  });

  it.each([
    ['una imagen `.png` real', 'foto.png', pngBytes, 'imagen'],
    ['un `.pdf` real', 'informe.pdf', pdfBytes, 'pdf'],
    ['un `.md` en UTF-8', 'LEEME.md', () => textBytes(BODY_BYTES, 'ñandú'), 'texto'],
    ['un archivo «otros» que no es ejecutable', 'datos.bin', () => otherBytes(BODY_BYTES), 'otro'],
    ['un `.svg` (sin firma que validar)', 'logo.svg', () => textBytes(BODY_BYTES), 'otro'],
  ])('CA-12: %s se acepta con su tipo detectado', async (_case, name, bytesOf, kind) => {
    const bytes = bytesOf();
    const { client, response, row } = await uploadAndComplete(name, bytes);

    expect(response.status).toBe(200);
    const { file } = completeUploadResponseSchema.parse(response.body);
    expect(file).toMatchObject({ name, kind, sizeBytes: bytes.length });
    expect(row.estado).toBe('completada');
    expect(await storage.readObject(row.clave_objeto)).toEqual(bytes);
    expect(await usedBytesOf(storage.owner, client.id)).toBe(BigInt(bytes.length));
  });
});
