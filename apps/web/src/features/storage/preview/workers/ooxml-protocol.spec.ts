import { parseOpenRequest, parseWorkerMessage } from './ooxml-protocol';

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';

describe('protocolo OOXML T-09a: mensajes cerrados en ambos sentidos', () => {
  it('CA-11: acepta solo la petición open exacta', () => {
    const open = { type: 'open', session: 3, kind: 'pptx', url: URL };
    expect(parseOpenRequest(open)).toEqual(open);
  });

  it.each([
    ['sin url', { type: 'open', session: 1, kind: 'xlsx' }],
    ['url vacía', { type: 'open', session: 1, kind: 'xlsx', url: '' }],
    ['kind no OOXML', { type: 'open', session: 1, kind: 'docx', url: URL }],
    ['sesión cero', { type: 'open', session: 0, kind: 'xlsx', url: URL }],
    ['sesión decimal', { type: 'open', session: 1.5, kind: 'xlsx', url: URL }],
    ['campo extra', { type: 'open', session: 1, kind: 'xlsx', url: URL, headers: {} }],
    ['tipo desconocido', { type: 'unit', session: 1 }],
    ['primitivo', 'open'],
    ['null', null],
  ])('CA-11: descarta una petición con %s', (_label, data) => {
    expect(parseOpenRequest(data)).toBeUndefined();
  });

  it.each([
    [{ type: 'opened', session: 2 }],
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
  ])('CA-11: descarta un mensaje del worker con %s', (_label, data) => {
    expect(parseWorkerMessage(data)).toBeUndefined();
  });
});
