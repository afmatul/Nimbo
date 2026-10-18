import { OoxmlError, openZipPackage, type ZipPackage } from './ooxml-package-reader';
import { SIGNED_URL, serveObject } from './testing/object-server';
import { rawZip, zipOf, type FixtureEntry } from './testing/ooxml-fixtures';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

async function open(bytes: Uint8Array, signal = new AbortController().signal) {
  serveObject(bytes);
  return openZipPackage({ url: SIGNED_URL, signal });
}

async function reasonOf(operation: Promise<unknown>): Promise<string> {
  const outcome: unknown = await operation.then(
    () => 'ok',
    (error: unknown) => error,
  );
  if (outcome === 'ok') return 'ok';
  expect(outcome instanceof OoxmlError).toBe(true);
  expect(/PRIVATE|objects\.test|CRC|filename|zip/i.test(String(outcome))).toBe(false);
  expect(Reflect.has(outcome as object, 'cause')).toBe(false);
  return (outcome as OoxmlError).reason;
}

async function text(pkg: ZipPackage, part: string): Promise<string> {
  const decoder = new TextDecoder();
  let value = '';
  await pkg.readPart(part, (chunk) => {
    value += decoder.decode(chunk, { stream: true });
  });
  return value + decoder.decode();
}

const VALID: FixtureEntry[] = [
  ['[Content_Types].xml', '<Types/>'],
  ['xl/workbook.xml', `<workbook>${'celda '.repeat(20_000)}</workbook>`],
];

describe('openZipPackage T-09a: zip.js real por rangos', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1/11: abre un ZIP comprimido real y lee una parte en streaming con CRC', async () => {
    const pkg = await open(await zipOf(VALID));
    expect(pkg.has('/xl/workbook.xml')).toBe(true);
    expect(pkg.has('/XL/Workbook.XML')).toBe(true);
    expect(pkg.has('/xl/falta.xml')).toBe(false);
    expect(await text(pkg, '/xl/workbook.xml')).toBe(VALID[1]?.[1]);
    await pkg.close();
    await pkg.close();
  });

  it('CA-1: ZIP64 real se lee igual que un ZIP clásico', async () => {
    const pkg = await open(await zipOf(VALID, { zip64: true }));
    expect(await text(pkg, '/[Content_Types].xml')).toBe('<Types/>');
    await pkg.close();
  });

  it('CA-2: entrada cifrada se informa como protegido, sin pedir contraseña', async () => {
    expect(await reasonOf(open(await zipOf(VALID, { password: 'secreta' })))).toBe('protected');
  });

  it('CA-2: CRC alterado en datos almacenados se informa como corrupto al leer la parte', async () => {
    const zip = await zipOf([['a.xml', 'AAAAAAAAAAAAQQQQ']], { level: 0 });
    const at = zip.indexOf(0x51);
    zip.set([(zip[at] ?? 0) ^ 2], at);
    const pkg = await open(zip);
    expect(await reasonOf(text(pkg, '/a.xml'))).toBe('corrupt');
    await pkg.close();
  });

  it.each([
    ['no es ZIP', new TextEncoder().encode('esto no es un paquete')],
    [
      'nombre duplicado exacto',
      rawZip([
        ['a.xml', 'x'],
        ['a.xml', 'y'],
      ]),
    ],
    [
      'nombres equivalentes OPC',
      rawZip([
        ['a.xml', 'x'],
        ['A.XML', 'y'],
      ]),
    ],
    ['traversal', rawZip([['../a.xml', 'x']])],
    ['ruta absoluta', rawZip([['/a.xml', 'x']])],
    ['segmento vacío', rawZip([['a//b.xml', 'x']])],
  ])('CA-2: %s se rechaza como corrupto', async (_label, bytes) => {
    expect(await reasonOf(open(bytes))).toBe('corrupt');
  });

  it('CA-2: dos registros centrales sobre los mismos datos se rechazan como corrupto', async () => {
    const pkg = await open(rawZip([['a.xml', 'x']], [{ name: 'b.xml', target: 0 }])).catch(
      (error: unknown) => error,
    );
    const reason =
      pkg instanceof OoxmlError
        ? pkg.reason
        : await reasonOf(
            Promise.all([text(pkg as ZipPackage, '/a.xml'), text(pkg as ZipPackage, '/b.xml')]),
          );
    expect(reason).toBe('corrupt');
  });

  it('CA-2: parte inexistente se informa como corrupto', async () => {
    const pkg = await open(await zipOf(VALID));
    expect(await reasonOf(text(pkg, '/xl/falta.xml'))).toBe('corrupt');
    await pkg.close();
  });

  it('CA-2: rechazo del origen se informa como no disponible', async () => {
    const server = serveObject(await zipOf(VALID));
    server.failAfter = 1;
    const opening = openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
    expect(await reasonOf(opening)).toBe('unavailable');
  });

  it('CA-2: error del consumidor se conserva sin reclasificarse como transporte', async () => {
    const pkg = await open(await zipOf(VALID));
    const reading = pkg.readPart('/xl/workbook.xml', () => {
      throw new OoxmlError('corrupt');
    });
    expect(await reasonOf(reading)).toBe('corrupt');
    await pkg.close();
  });

  it('CA-7: abortar durante la lectura detiene los GET y rechaza sin datos tardíos', async () => {
    const controller = new AbortController();
    const zip = await zipOf(VALID, { level: 0 });
    const server = serveObject(zip);
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: controller.signal });
    let chunks = 0;
    const reading = pkg.readPart('/xl/workbook.xml', () => {
      chunks++;
      controller.abort();
    });
    await expect(reading).rejects.toBeInstanceOf(OoxmlError);
    expect(chunks).toBe(1);
    expect(server.signals.at(-1)?.aborted).toBe(true);
    await pkg.close();
  });
});
