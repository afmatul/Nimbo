import { parseWorkerMessage, parseWorkerRequest } from './ooxml-protocol';

const PREVIEW = {
  kind: 'pptx',
  slides: [
    { index: 0, state: 'visible' },
    { index: 1, state: 'hidden' },
  ],
};
const PROJECTION = {
  index: 1,
  blocks: [
    { kind: 'text', text: 'Dos runs\nOtro párrafo' },
    {
      kind: 'table',
      rows: [
        ['A', 'B'],
        ['', 'C\nD'],
      ],
    },
  ],
};

describe('protocolo PPTX T-09b: proyecciones cerradas', () => {
  it.each([
    { type: 'opened', session: 1, preview: PREVIEW },
    { type: 'opened', session: 1, preview: { kind: 'pptx', slides: [] } },
    { type: 'unit', session: 1, request: 2, projection: PROJECTION },
    { type: 'unit', session: 1, request: 2, projection: { index: 0, blocks: [] } },
  ])('CA-1: acepta el mensaje serializable %j', (message) => {
    expect(parseWorkerMessage(message)).toEqual(message);
  });

  it('CA-7: reutiliza unit para seleccionar una slide sin introducir otra sesión/cola', () => {
    const request = { type: 'unit', session: 1, request: 2, index: 1, offset: 0 };
    expect(parseWorkerRequest(request)).toEqual(request);
  });

  it.each([
    { ...PREVIEW, slides: [{ index: -1, state: 'visible' }] },
    { ...PREVIEW, slides: [{ index: 0, state: 'veryHidden' }] },
    { ...PREVIEW, slides: [{ index: 0, state: 'hidden', part: '/ppt/slides/slide1.xml' }] },
    { ...PREVIEW, url: 'https://objects.test/signed' },
  ])('CA-11: descarta metadata PPTX abierta %j', (preview) => {
    expect(parseWorkerMessage({ type: 'opened', session: 1, preview })).toBeUndefined();
  });

  it.each([
    { index: 0, blocks: [{ kind: 'html', text: '<b>dato</b>' }] },
    { index: 0, blocks: [{ kind: 'text', text: 'dato', xml: '<a:t>dato</a:t>' }] },
    { index: 0, blocks: [{ kind: 'table', rows: [[{ text: 'dato' }]] }] },
    { index: 0, blocks: [{ kind: 'table', rows: [['dato']], relationships: [] }] },
    { ...PROJECTION, bytes: new Uint8Array([1]) },
    { ...PROJECTION, error: new Error('https://objects.test/private') },
    { ...PROJECTION, stack: 'privado' },
  ])('CA-11: descarta proyección PPTX abierta %j', (projection) => {
    expect(
      parseWorkerMessage({ type: 'unit', session: 1, request: 2, projection }),
    ).toBeUndefined();
  });
});
