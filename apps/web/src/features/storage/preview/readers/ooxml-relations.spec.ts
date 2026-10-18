import { OoxmlError, openZipPackage } from './ooxml-package-reader';
import {
  openOoxmlDocument,
  readContentTypes,
  readRelationships,
  relationshipsPartOf,
  resolveTarget,
} from './ooxml-relations';
import { SIGNED_URL, serveObject } from './testing/object-server';
import {
  contentTypes,
  MAIN_TYPES,
  NS,
  ooxmlEntries,
  relationship,
  relationships,
  zipOf,
  type FixtureEntry,
} from './testing/ooxml-fixtures';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

async function packageOf(entries: readonly FixtureEntry[]) {
  serveObject(await zipOf(entries));
  return openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
}

async function reasonOf(operation: Promise<unknown>): Promise<string> {
  const outcome: unknown = await operation.then(
    () => 'ok',
    (error: unknown) => error,
  );
  if (outcome === 'ok') return 'ok';
  expect(outcome instanceof OoxmlError).toBe(true);
  return (outcome as OoxmlError).reason;
}

function withEntry(entries: FixtureEntry[], name: string, content: string): FixtureEntry[] {
  return [...entries.filter(([entry]) => entry !== name), [name, content]];
}

describe('resolución OPC de destinos T-09a', () => {
  it.each([
    ['/xl/workbook.xml', 'worksheets/sheet1.xml', '/xl/worksheets/sheet1.xml'],
    ['/xl/workbook.xml', './styles.xml', '/xl/styles.xml'],
    ['/xl/worksheets/sheet1.xml', '../sharedStrings.xml', '/xl/sharedStrings.xml'],
    ['/ppt/slides/slide1.xml', '/ppt/slideLayouts/a.xml', '/ppt/slideLayouts/a.xml'],
    ['/', 'xl/workbook.xml', '/xl/workbook.xml'],
    ['/xl/workbook.xml', 'media/image%201.png', '/xl/media/image%201.png'],
  ])('CA-1: desde %s, %s resuelve a %s sin decodificar el nombre', (source, target, part) => {
    expect(resolveTarget(source, target, false)).toEqual({ mode: 'internal', part });
  });

  it.each([
    ['escape de la raíz', '/xl/workbook.xml', '../../x.xml'],
    ['escape desde el paquete', '/', '../x.xml'],
    ['URI con esquema', '/xl/workbook.xml', 'https://evil.test/x.xml'],
    ['esquema file', '/xl/workbook.xml', 'file:///etc/passwd'],
    ['autoridad', '/xl/workbook.xml', '//evil.test/x.xml'],
    ['traversal codificado', '/xl/workbook.xml', '%2e%2e/%2e%2e/x.xml'],
    ['barra codificada', '/xl/workbook.xml', 'a%2F..%2Fb.xml'],
    ['barra invertida', '/xl/workbook.xml', '..\\x.xml'],
    ['consulta', '/xl/workbook.xml', 'a.xml?x=1'],
    ['fragmento', '/xl/workbook.xml', 'a.xml#x'],
    ['segmento vacío', '/xl/workbook.xml', 'a//b.xml'],
    ['punto final', '/xl/workbook.xml', 'a/b.'],
    ['porcentaje inválido', '/xl/workbook.xml', 'a%zz.xml'],
    ['vacío', '/xl/workbook.xml', ''],
  ])('CA-2: %s es un destino inválido', (_label, source, target) => {
    expect(resolveTarget(source, target, false)).toEqual({ mode: 'invalid' });
  });

  it('CA-11: TargetMode External nunca se resuelve ni se sigue', () => {
    expect(resolveTarget('/xl/workbook.xml', 'https://evil.test/x', true)).toEqual({
      mode: 'external',
    });
    expect(resolveTarget('/xl/workbook.xml', 'sheet.xml', true)).toEqual({ mode: 'external' });
  });

  it.each([
    ['/', '/_rels/.rels'],
    ['/xl/workbook.xml', '/xl/_rels/workbook.xml.rels'],
    ['/ppt/slides/slide1.xml', '/ppt/slides/_rels/slide1.xml.rels'],
  ])('CA-1: las relaciones de %s viven en %s', (source, part) => {
    expect(relationshipsPartOf(source)).toBe(part);
  });
});

describe('relaciones y content types OPC T-09a', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1/11: lee relaciones internas, externas e inválidas sin decidir su política', async () => {
    const rels = relationships([
      relationship('rId1', 'urn:sheet', 'worksheets/sheet1.xml'),
      relationship('rId2', 'urn:link', 'https://evil.test/x', true),
      relationship('rId3', 'urn:bad', '../../x.xml'),
    ]);
    const pkg = await packageOf([['xl/_rels/workbook.xml.rels', rels]]);
    expect(await readRelationships(pkg, '/xl/workbook.xml')).toEqual([
      {
        id: 'rId1',
        type: 'urn:sheet',
        target: { mode: 'internal', part: '/xl/worksheets/sheet1.xml' },
      },
      { id: 'rId2', type: 'urn:link', target: { mode: 'external' } },
      { id: 'rId3', type: 'urn:bad', target: { mode: 'invalid' } },
    ]);
    expect(await readRelationships(pkg, '/xl/sin-relaciones.xml')).toEqual([]);
    await pkg.close();
  });

  it.each([
    [
      'Id duplicado',
      [relationship('rId1', 'urn:a', 'a.xml'), relationship('rId1', 'urn:b', 'b.xml')],
    ],
    [
      'TargetMode desconocido',
      ['<Relationship Id="r" Type="t" Target="a.xml" TargetMode="Other"/>'],
    ],
    ['sin Target', ['<Relationship Id="r" Type="t"/>']],
    ['namespace ajeno', ['<x:Relationship xmlns:x="urn:x" Id="r" Type="t" Target="a"/>']],
  ])('CA-2: relaciones con %s son corruptas', async (_label, items) => {
    const pkg = await packageOf([['_rels/.rels', relationships(items)]]);
    expect(await reasonOf(readRelationships(pkg, '/'))).toBe('corrupt');
    await pkg.close();
  });

  it('CA-1: content types por Override y por Default de extensión, sin mayúsculas', async () => {
    const extra = `<Default Extension="PNG" ContentType="image/png"/>`;
    const pkg = await packageOf([['[Content_Types].xml', contentTypes('xlsx', extra)]]);
    const types = await readContentTypes(pkg);
    expect(types.of('/XL/Workbook.xml')).toBe(MAIN_TYPES.xlsx);
    expect(types.of('/xl/media/a.png')).toBe('image/png');
    expect(types.of('/xl/sin-extension')).toBeUndefined();
    expect(types.of('/xl/punto-final.')).toBeUndefined();
    await pkg.close();
  });

  it.each([
    ['Default duplicado', '<Default Extension="xml" ContentType="text/xml"/>'],
    [
      'Override duplicado',
      `<Override PartName="/XL/workbook.xml" ContentType="${MAIN_TYPES.xlsx}"/>`,
    ],
  ])('CA-2: content types con %s son corruptos', async (_label, extra) => {
    const pkg = await packageOf([['[Content_Types].xml', contentTypes('xlsx', extra)]]);
    expect(await reasonOf(readContentTypes(pkg))).toBe('corrupt');
    await pkg.close();
  });
});

describe('openOoxmlDocument T-09a: parte principal validada', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['xlsx', false, '/xl/workbook.xml'],
    ['xlsx', true, '/xl/workbook.xml'],
    ['pptx', false, '/ppt/presentation.xml'],
    ['pptx', true, '/ppt/presentation.xml'],
  ] as const)('CA-1: %s (strict=%s) abre su parte principal %s', async (kind, strict, part) => {
    const pkg = await packageOf(ooxmlEntries(kind, { strict }));
    const document = await openOoxmlDocument(pkg, kind);
    expect(document.mainPart).toBe(part);
    expect(document.contentTypes.of(part)).toBe(MAIN_TYPES[kind]);
    await pkg.close();
  });

  const base = ooxmlEntries('xlsx');
  const officeDocument = (target: string, external = false) =>
    relationships([relationship('rId1', NS.transitionalDocument, target, external)]);
  it.each([
    ['sin [Content_Types].xml', base.filter(([name]) => name !== '[Content_Types].xml')],
    ['sin _rels/.rels', base.filter(([name]) => name !== '_rels/.rels')],
    ['sin relación officeDocument', withEntry(base, '_rels/.rels', relationships([]))],
    [
      'dos relaciones officeDocument',
      withEntry(
        base,
        '_rels/.rels',
        relationships([
          relationship('rId1', NS.transitionalDocument, 'xl/workbook.xml'),
          relationship('rId2', NS.strictDocument, 'xl/workbook.xml'),
        ]),
      ),
    ],
    [
      'officeDocument externa',
      withEntry(base, '_rels/.rels', officeDocument('https://evil.test/w', true)),
    ],
    ['officeDocument fuera de la raíz', withEntry(base, '_rels/.rels', officeDocument('../w.xml'))],
    ['parte principal ausente', base.filter(([name]) => name !== 'xl/workbook.xml')],
    ['content type de otro formato', withEntry(base, '[Content_Types].xml', contentTypes('pptx'))],
  ])('CA-2: XLSX %s es corrupto', async (_label, entries) => {
    const pkg = await packageOf(entries);
    expect(await reasonOf(openOoxmlDocument(pkg, 'xlsx'))).toBe('corrupt');
    await pkg.close();
  });

  it('CA-2: un PPTX válido abierto como XLSX es corrupto (contenido distinto de su tipo)', async () => {
    const pkg = await packageOf(ooxmlEntries('pptx'));
    expect(await reasonOf(openOoxmlDocument(pkg, 'xlsx'))).toBe('corrupt');
    await pkg.close();
  });
});
