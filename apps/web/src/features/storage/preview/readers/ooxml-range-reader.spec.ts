import { ObjectRangeReader } from './ooxml-range-reader';
import { SIGNED_URL, serveObject } from './testing/object-server';
import { zipOf } from './testing/ooxml-fixtures';
import { ZipReader } from './zip-core';

// Jest carga CJS: la variante `native` publicada de zip.js; el ESM real se ejerce en ooxml-engine.real.spec.
jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

const BYTES = Uint8Array.from({ length: 50 }, (_, index) => index);

function reader(signal = new AbortController().signal): ObjectRangeReader {
  return new ObjectRangeReader({ url: SIGNED_URL, signal });
}

describe('ObjectRangeReader T-09a: fuente ZIP sobre el helper único', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-11: init toma el tamaño de un rango 0-0 validado, sin HEAD ni cabeceras propias', async () => {
    const server = serveObject(BYTES);
    const source = reader();
    await source.init();
    expect(source.size).toBe(50);
    // `initialized` lo fija `Stream.init` de zip.js en runtime; su d.ts no lo declara en Reader.
    expect(Reflect.get(source, 'initialized')).toBe(true);
    expect(server.requests).toEqual([
      { start: 0, end: 0, credentials: 'omit', headers: ['range'], method: 'GET' },
    ]);
  });

  it('CA-11: readUint8Array pide exactamente el rango y trunca al final del objeto', async () => {
    const server = serveObject(BYTES);
    const source = reader();
    await source.init();
    expect([...(await source.readUint8Array(10, 3))]).toEqual([10, 11, 12]);
    expect([...(await source.readUint8Array(48, 10))]).toEqual([48, 49]);
    expect((await source.readUint8Array(50, 4)).length).toBe(0);
    expect((await source.readUint8Array(3, 0)).length).toBe(0);
    expect(server.requests.slice(1).map(({ start, end }) => [start, end])).toEqual([
      [10, 12],
      [48, 49],
    ]);
  });

  it.each([
    [-1, 2],
    [1.5, 2],
    [1, -2],
    [Number.NaN, 1],
  ])('CA-2: parámetros inválidos (%p, %p) fallan sin pedir bytes', async (index, length) => {
    const server = serveObject(BYTES);
    const source = reader();
    await source.init();
    await expect(source.readUint8Array(index, length)).rejects.toThrow(
      'No se pudo leer el paquete para la vista previa.',
    );
    expect(server.requests).toHaveLength(1);
    expect(source.failed).toBe(true);
  });

  it('CA-2: rechazo del origen o tamaño cambiado se marca como fallo de transporte saneado', async () => {
    const server = serveObject(BYTES);
    server.failAfter = 1;
    const source = reader();
    await source.init();
    const outcome: unknown = await source.readUint8Array(0, 4).catch((error: unknown) => error);
    expect(source.failed).toBe(true);
    expect(/PRIVATE|objects\.test|403/.test(String(outcome))).toBe(false);
  });

  it('CA-7: abortar la sesión propaga la señal al GET en curso', async () => {
    const server = serveObject(BYTES);
    const controller = new AbortController();
    const source = reader(controller.signal);
    await source.init();
    controller.abort();
    await expect(source.readUint8Array(0, 4)).rejects.toThrow();
    expect(server.signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('CA-11: ZipReader real lista un paquete leyendo solo la cola y el directorio central', async () => {
    // Almacenado (level 0): 300 KB reales, así la cola de 64 KB es una fracción del objeto.
    const zip = await zipOf(
      [
        ['big.bin', new Uint8Array(300_000)],
        ['small.xml', '<a/>'],
      ],
      { level: 0 },
    );
    const server = serveObject(zip);
    const archive = new ZipReader(reader(), { useWebWorkers: false });
    const names = (await archive.getEntries()).map((entry) => entry.filename);
    await archive.close();
    expect(names).toEqual(['big.bin', 'small.xml']);
    const transferred = server.requests.reduce((size, { start, end }) => size + end - start + 1, 0);
    expect(transferred).toBeLessThan(zip.length / 2);
    expect(server.requests.every(({ credentials }) => credentials === 'omit')).toBe(true);
  });
});
