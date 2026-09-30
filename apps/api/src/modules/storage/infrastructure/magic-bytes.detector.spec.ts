import type { ByteReader } from '../application/ports/i-file-type-detector.port';

import { MagicBytesDetector } from './magic-bytes.detector';

const MIB = 1024 * 1024;
const OOXML_MIME = 'application/vnd.openxmlformats-officedocument';

/** `ByteReader` en memoria que cuenta cuántos bytes se leyeron (sin MinIO). */
class MemoryReader implements ByteReader {
  bytesRead = 0;

  constructor(
    private readonly data: Buffer,
    readonly size: number = data.length,
  ) {}

  read(offset: number, length: number): Promise<Buffer> {
    const chunk = this.data.subarray(offset, Math.min(offset + length, this.data.length));
    this.bytesRead += chunk.length;
    return Promise.resolve(chunk);
  }
}

const bytes = (...values: number[]): Buffer => Buffer.from(values);
const ascii = (text: string): Buffer => Buffer.from(text, 'latin1');
const withTail = (head: Buffer, total = 64): Buffer =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x41)]);

function portableExecutable(): Buffer {
  const data = Buffer.alloc(0x100, 0);
  ascii('MZ').copy(data, 0);
  data.writeUInt32LE(0x80, 0x3c);
  ascii('PE\0\0').copy(data, 0x80);
  return data;
}

interface ZipOptions {
  readonly zip64Locator?: boolean;
  readonly zip64Fields?: boolean;
  readonly padding?: number;
  readonly comment?: string;
}

function centralEntry(name: string): Buffer {
  const header = Buffer.alloc(46, 0);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(Buffer.byteLength(name), 28);
  return Buffer.concat([header, Buffer.from(name, 'utf8')]);
}

/** ZIP mínimo: encabezado local, relleno opcional, directorio central con `names` y EOCD. */
function zip(names: readonly string[], options: ZipOptions = {}): Buffer {
  const local = Buffer.alloc(30, 0);
  local.writeUInt32LE(0x04034b50, 0);
  const body = Buffer.concat([local, Buffer.alloc(options.padding ?? 0, 0x20)]);
  const directory = Buffer.concat(names.map(centralEntry));
  const comment = Buffer.from(options.comment ?? '', 'latin1');
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(options.zip64Fields === true ? 0xffff : names.length, 8);
  eocd.writeUInt16LE(options.zip64Fields === true ? 0xffff : names.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  eocd.writeUInt16LE(comment.length, 20);
  const locator = Buffer.alloc(options.zip64Locator === true ? 20 : 0, 0);
  if (options.zip64Locator === true) locator.writeUInt32LE(0x07064b50, 0);
  return Buffer.concat([body, directory, locator, eocd, comment]);
}

const detector = new MagicBytesDetector();
const detect = (data: Buffer, extension: string, size?: number) =>
  detector.detect(new MemoryReader(data, size), extension);

describe('MagicBytesDetector', () => {
  describe('ejecutables primero (CA-24)', () => {
    it.each(['pdf', 'docx', 'txt', 'png', 'bin', ''])(
      'CA-24: un PE con extensión «%s» es ejecutable',
      async (extension) => {
        await expect(detect(portableExecutable(), extension)).resolves.toEqual({
          ok: false,
          reason: 'executable',
        });
      },
    );

    it.each([
      ['ELF', bytes(0x7f, 0x45, 0x4c, 0x46)],
      ['Mach-O 32', bytes(0xfe, 0xed, 0xfa, 0xce)],
      ['Mach-O 64', bytes(0xfe, 0xed, 0xfa, 0xcf)],
      ['Mach-O 32 LE', bytes(0xce, 0xfa, 0xed, 0xfe)],
      ['Mach-O 64 LE', bytes(0xcf, 0xfa, 0xed, 0xfe)],
      ['Mach-O universal (2 arquitecturas)', bytes(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2)],
    ])('CA-24: %s es ejecutable aunque diga «.txt»', async (_label, head) => {
      await expect(detect(withTail(head), 'txt')).resolves.toEqual({
        ok: false,
        reason: 'executable',
      });
    });

    it('CA-24: una clase Java (`CAFEBABE` + versión 52) no es un ejecutable', async () => {
      const javaClass = withTail(bytes(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x34));

      await expect(detect(javaClass, 'class')).resolves.toEqual({
        ok: true,
        kind: 'otro',
        mime: 'application/octet-stream',
      });
    });

    it('CA-24: un `MZ` cuyo `e_lfanew` no apunta a `PE\\0\\0` no es un PE', async () => {
      const data = portableExecutable();
      data.writeUInt32LE(0x1000, 0x3c);

      await expect(detect(data, 'dat')).resolves.toMatchObject({ ok: true, kind: 'otro' });
    });
  });

  describe('firma según la extensión (CA-11, CA-12)', () => {
    it('CA-12: `%PDF-` dentro de los primeros 1024 bytes es un pdf', async () => {
      const data = Buffer.concat([Buffer.alloc(100, 0x20), ascii('%PDF-1.7\n'), Buffer.alloc(50)]);

      await expect(detect(data, 'pdf')).resolves.toEqual({
        ok: true,
        kind: 'pdf',
        mime: 'application/pdf',
      });
    });

    it('CA-11: `%PDF-` después del byte 1024 no cuenta', async () => {
      const data = Buffer.concat([Buffer.alloc(1024, 0x20), ascii('%PDF-1.7')]);

      await expect(detect(data, 'pdf')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it.each([
      ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
      ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
      ['jpeg', bytes(0xff, 0xd8, 0xff, 0xdb), 'image/jpeg'],
      ['gif', ascii('GIF87a'), 'image/gif'],
      ['gif', ascii('GIF89a'), 'image/gif'],
      ['webp', Buffer.concat([ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WEBP')]), 'image/webp'],
    ])('CA-12: una imagen «.%s» con su firma es válida', async (extension, head, mime) => {
      await expect(detect(withTail(head), extension)).resolves.toEqual({
        ok: true,
        kind: 'imagen',
        mime,
      });
    });

    it.each([
      ['png', ascii('GIF89a')],
      ['jpg', ascii('%PDF-')],
      ['gif', ascii('GIF88a')],
      ['webp', Buffer.concat([ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WAVE')])],
      ['pdf', ascii('hola')],
    ])('CA-11: «.%s» con otra firma es inválido', async (extension, head) => {
      await expect(detect(withTail(head), extension)).resolves.toEqual({
        ok: false,
        reason: 'signature',
      });
    });

    it('CA-12: la extensión se compara sin distinguir mayúsculas', async () => {
      await expect(detect(withTail(ascii('%PDF-')), 'PDF')).resolves.toMatchObject({ ok: true });
    });
  });

  describe('OOXML por el directorio central (CA-11, CA-12)', () => {
    it.each([
      ['docx', 'word/document.xml', `${OOXML_MIME}.wordprocessingml.document`],
      ['xlsx', 'xl/workbook.xml', `${OOXML_MIME}.spreadsheetml.sheet`],
      ['pptx', 'ppt/presentation.xml', `${OOXML_MIME}.presentationml.presentation`],
    ])(
      'CA-12: un .%s con `[Content_Types].xml` y `%s` es válido',
      async (extension, part, mime) => {
        const data = zip(['[Content_Types].xml', '_rels/.rels', part]);

        await expect(detect(data, extension)).resolves.toEqual({ ok: true, kind: extension, mime });
      },
    );

    it('CA-11: un ZIP que no es OOXML no es un .docx', async () => {
      await expect(detect(zip(['foto.jpg']), 'docx')).resolves.toEqual({
        ok: false,
        reason: 'signature',
      });
    });

    it('CA-11: un .xlsx renombrado a .docx es inválido', async () => {
      const workbook = zip(['[Content_Types].xml', 'xl/workbook.xml']);

      await expect(detect(workbook, 'docx')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it('CA-11: sin `[Content_Types].xml` es inválido', async () => {
      await expect(detect(zip(['word/document.xml']), 'docx')).resolves.toMatchObject({
        ok: false,
      });
    });

    it('CA-11: sin encabezado `PK\\x03\\x04` es inválido', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml']);
      data.writeUInt32LE(0, 0);

      await expect(detect(data, 'docx')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it('CA-11: encuentra el EOCD aunque haya comentario al final', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml'], { comment: 'x'.repeat(500) });

      await expect(detect(data, 'docx')).resolves.toMatchObject({ ok: true, kind: 'docx' });
    });

    it('CA-11: sin EOCD es inválido', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml']);

      await expect(detect(data.subarray(0, data.length - 22), 'docx')).resolves.toEqual({
        ok: false,
        reason: 'signature',
      });
    });

    it.each([
      ['el localizador Zip64', { zip64Locator: true }],
      ['campos Zip64 en el EOCD', { zip64Fields: true }],
    ])('CA-11: un ZIP con %s es firma inválida', async (_label, options: ZipOptions) => {
      const data = zip(['[Content_Types].xml', 'word/document.xml'], options);

      await expect(detect(data, 'docx')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it('CA-11: un ZIP de 4 GiB o más es firma inválida', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml']);

      await expect(detect(data, 'docx', 4 * 1024 * MIB)).resolves.toEqual({
        ok: false,
        reason: 'signature',
      });
    });

    it('CA-11: un directorio central de más de 8 MiB es firma inválida', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml']);
      const eocd = data.length - 22;
      data.writeUInt32LE(8 * MIB + 1, eocd + 12);

      await expect(detect(data, 'docx')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it('CA-11: un directorio central fuera del archivo es firma inválida', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml']);
      data.writeUInt32LE(data.length, data.length - 22 + 16);

      await expect(detect(data, 'docx')).resolves.toEqual({ ok: false, reason: 'signature' });
    });

    it('CA-12: lee por rangos, sin recorrer el contenido comprimido', async () => {
      const data = zip(['[Content_Types].xml', 'word/document.xml'], { padding: 2 * MIB });
      const reader = new MemoryReader(data);

      await expect(detector.detect(reader, 'docx')).resolves.toMatchObject({ ok: true });
      expect(reader.bytesRead).toBeLessThan(128 * 1024);
    });
  });

  describe('texto UTF-8 (CA-11, D-9)', () => {
    it.each(['txt', 'md'])('CA-12: un .%s en UTF-8 es texto', async (extension) => {
      await expect(
        detect(Buffer.from('Año nuevo, ¿qué tal? 😀\n', 'utf8'), extension),
      ).resolves.toMatchObject({ ok: true, kind: 'texto' });
    });

    it('CA-12: admite BOM', async () => {
      const data = Buffer.concat([bytes(0xef, 0xbb, 0xbf), Buffer.from('hola', 'utf8')]);

      await expect(detect(data, 'txt')).resolves.toEqual({
        ok: true,
        kind: 'texto',
        mime: 'text/plain',
      });
    });

    it('CA-12: un carácter multibyte partido entre bloques de 4 MiB sigue siendo válido', async () => {
      const data = Buffer.concat([Buffer.alloc(4 * MIB - 1, 0x61), Buffer.from('ñ', 'utf8')]);

      await expect(detect(data, 'md')).resolves.toMatchObject({ ok: true, kind: 'texto' });
    });

    it.each([
      ['una secuencia inválida', bytes(0x61, 0xc3, 0x28)],
      ['un byte NUL', bytes(0x61, 0x00, 0x62)],
      ['una secuencia truncada al final', bytes(0x61, 0xe2, 0x82)],
      ['Latin-1', Buffer.from('Año', 'latin1')],
    ])('CA-11: un .txt con %s no es texto', async (_label, data) => {
      await expect(detect(data, 'txt')).resolves.toEqual({ ok: false, reason: 'text' });
    });
  });

  describe('«otros» (CA-12)', () => {
    it.each(['svg', 'bmp', 'heic', 'zip', 'csv', ''])(
      'CA-12: «.%s» se acepta como `otro` sin validar firma',
      async (extension) => {
        await expect(detect(Buffer.from([1, 2, 3, 4, 5]), extension)).resolves.toEqual({
          ok: true,
          kind: 'otro',
          mime: 'application/octet-stream',
        });
      },
    );
  });
});
