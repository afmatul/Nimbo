import { parseWorkerMessage, parseWorkerRequest } from './ooxml-protocol';

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const PREVIEW = {
  kind: 'xlsx',
  sheets: [
    { name: 'Uno', type: 'worksheet', state: 'visible' },
    { name: 'Gráfico', type: 'chartsheet', state: 'hidden' },
  ],
};
const PROJECTION = {
  index: 0,
  columns: 2,
  rows: [{ row: 3, cells: [{ column: 2, text: 'x', type: 'no-cache' }] }],
  missingCache: 1,
  nextOffset: 200,
};

describe('protocolo OOXML: mensajes cerrados en ambos sentidos', () => {
  it('CA-11: acepta solo las peticiones open y unit exactas', () => {
    const open = { type: 'open', session: 3, kind: 'pptx', url: URL };
    const unit = { type: 'unit', session: 3, request: 1, index: 0, offset: 200 };
    expect(parseWorkerRequest(open)).toEqual(open);
    expect(parseWorkerRequest(unit)).toEqual(unit);
  });

  it.each([
    ['sin url', { type: 'open', session: 1, kind: 'xlsx' }],
    ['url vacía', { type: 'open', session: 1, kind: 'xlsx', url: '' }],
    ['kind no OOXML', { type: 'open', session: 1, kind: 'docx', url: URL }],
    ['sesión cero', { type: 'open', session: 0, kind: 'xlsx', url: URL }],
    ['sesión decimal', { type: 'open', session: 1.5, kind: 'xlsx', url: URL }],
    ['campo extra', { type: 'open', session: 1, kind: 'xlsx', url: URL, headers: {} }],
    ['unit incompleta', { type: 'unit', session: 1 }],
    ['unit con índice negativo', { type: 'unit', session: 1, request: 1, index: -1, offset: 0 }],
    ['unit con url', { type: 'unit', session: 1, request: 1, index: 0, offset: 0, url: URL }],
    ['tipo desconocido', { type: 'close', session: 1 }],
    ['primitivo', 'open'],
    ['null', null],
  ])('CA-11: descarta una petición con %s', (_label, data) => {
    expect(parseWorkerRequest(data)).toBeUndefined();
  });

  it.each([
    [{ type: 'opened', session: 2 }],
    [{ type: 'opened', session: 2, preview: PREVIEW }],
    [{ type: 'opened', session: 2, preview: { kind: 'xlsx', sheets: [] } }],
    [{ type: 'unit', session: 2, request: 4, projection: PROJECTION }],
    [
      {
        type: 'unit',
        session: 2,
        request: 4,
        projection: { index: 1, columns: 0, rows: [], missingCache: 0 },
      },
    ],
    [{ type: 'failure', session: 2, reason: 'corrupt' }],
    [{ type: 'failure', session: 2, reason: 'protected' }],
    [{ type: 'failure', session: 2, reason: 'unavailable' }],
    [{ type: 'failure', session: 2, reason: 'memory' }],
  ])('CA-2: acepta el mensaje del worker %j', (message) => {
    expect(parseWorkerMessage(message)).toEqual(message);
  });

  it.each([
    ['razón abierta', { type: 'failure', session: 2, reason: 'Invalid CRC32' }],
    ['error crudo', { type: 'failure', session: 2, reason: 'corrupt', error: new Error(URL) }],
    ['stack', { type: 'failure', session: 2, reason: 'corrupt', stack: 'x' }],
    ['url de vuelta', { type: 'opened', session: 2, url: URL }],
    ['xml', { type: 'opened', session: 2, xml: '<x/>' }],
    ['sin sesión', { type: 'opened' }],
    [
      'hoja con parte interna',
      {
        type: 'opened',
        session: 2,
        preview: { kind: 'xlsx', sheets: [{ ...PREVIEW.sheets[0], part: '/xl/a.xml' }] },
      },
    ],
    [
      'estado abierto',
      {
        type: 'opened',
        session: 2,
        preview: { kind: 'xlsx', sheets: [{ name: 'a', type: 'worksheet', state: 'x' }] },
      },
    ],
    [
      'celda con tipo abierto',
      {
        type: 'unit',
        session: 2,
        request: 1,
        projection: {
          ...PROJECTION,
          rows: [{ row: 1, cells: [{ column: 1, text: 'x', type: 'html' }] }],
        },
      },
    ],
    [
      'celda con campo extra',
      {
        type: 'unit',
        session: 2,
        request: 1,
        projection: {
          ...PROJECTION,
          rows: [{ row: 1, cells: [{ column: 1, text: 'x', type: 'text', xml: '<b/>' }] }],
        },
      },
    ],
    [
      'fila cero',
      {
        type: 'unit',
        session: 2,
        request: 1,
        projection: { ...PROJECTION, rows: [{ row: 0, cells: [] }] },
      },
    ],
    [
      'proyección sin contador',
      { type: 'unit', session: 2, request: 1, projection: { index: 0, columns: 0, rows: [] } },
    ],
  ])('CA-11: descarta un mensaje del worker con %s', (_label, data) => {
    expect(parseWorkerMessage(data)).toBeUndefined();
  });
});
