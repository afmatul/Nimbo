import { OoxmlError, openZipPackage } from './ooxml-package-reader';
import { attributeOf, createXmlReader, parseXmlPart, type XmlElement } from './ooxml-xml-reader';
import { SIGNED_URL, serveObject } from './testing/object-server';
import { utf16, zipOf } from './testing/ooxml-fixtures';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const SML_STRICT = 'http://purl.oclc.org/ooxml/spreadsheetml/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const encoder = new TextEncoder();

type Trace = { elements: XmlElement[]; closed: string[]; text: string };

/** Alimenta los bytes en trozos del tamaño dado para forzar fronteras de chunk arbitrarias. */
function parse(bytes: Uint8Array, chunk = bytes.length): Trace {
  const trace: Trace = { elements: [], closed: [], text: '' };
  const reader = createXmlReader({
    open: (element) => trace.elements.push(element),
    close: (element) => trace.closed.push(element.local),
    text: (value) => {
      trace.text += value;
    },
  });
  for (let offset = 0; offset < bytes.length; offset += chunk)
    reader.write(bytes.subarray(offset, offset + chunk));
  reader.end();
  return trace;
}

function reasonOf(operation: () => unknown): string {
  try {
    operation();
    return 'ok';
  } catch (error) {
    expect(error instanceof OoxmlError).toBe(true);
    expect(/line|column|entity|doctype|PRIVATE/i.test(String(error))).toBe(false);
    return (error as OoxmlError).reason;
  }
}

const DOC = '<?xml version="1.0" encoding="UTF-8"?><a:x xmlns:a="urn:a">𝄞 ñ</a:x>';

describe('lector XML incremental T-09a con saxes real', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['UTF-8 sin BOM', encoder.encode(DOC)],
    ['UTF-8 con BOM', Uint8Array.of(0xef, 0xbb, 0xbf, ...encoder.encode(DOC))],
    ['UTF-16LE con BOM', utf16(DOC.replace('UTF-8', 'UTF-16'), 'le')],
    ['UTF-16BE con BOM', utf16(DOC.replace('UTF-8', 'UTF-16'), 'be')],
    ['UTF-16LE sin BOM declarado', utf16(DOC.replace('UTF-8', 'UTF-16'), 'le', false)],
    ['UTF-16BE sin BOM declarado', utf16(DOC.replace('UTF-8', 'UTF-16'), 'be', false)],
  ])('CA-1: %s decodifica igual en cualquier frontera de chunk', (_label, bytes) => {
    for (const chunk of [1, 3, 7, bytes.length]) {
      const trace = parse(bytes, chunk);
      expect(trace.text).toBe('𝄞 ñ');
      expect(trace.elements.map(({ uri, local }) => [uri, local])).toEqual([['urn:a', 'x']]);
    }
  });

  it.each([
    ['UTF-8 con declaración UTF-16', encoder.encode(DOC.replace('UTF-8', 'UTF-16'))],
    ['UTF-8 con declaración ISO-8859-1', encoder.encode(DOC.replace('UTF-8', 'ISO-8859-1'))],
    ['UTF-16 sin BOM ni declaración', utf16('<x/>', 'le', false)],
    ['UTF-16LE con BOM declarado UTF-16BE', utf16(DOC.replace('UTF-8', 'UTF-16BE'), 'le')],
    [
      'UTF-8 inválido',
      Uint8Array.of(...encoder.encode('<x>'), 0xc3, 0x28, ...encoder.encode('</x>')),
    ],
    ['UTF-16 truncado', utf16('<x/>', 'le').subarray(0, 9)],
    ['UTF-32LE', Uint8Array.of(0x3c, 0, 0, 0, 0x78, 0, 0, 0)],
    ['vacío', new Uint8Array(0)],
  ])('CA-2: %s se rechaza como corrupto', (_label, bytes) => {
    expect(reasonOf(() => parse(bytes, 2))).toBe('corrupt');
  });

  it.each([
    ['DOCTYPE', '<!DOCTYPE x><x/>'],
    ['entidad interna declarada', '<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>'],
    ['entidad externa', '<!DOCTYPE x [<!ENTITY e SYSTEM "https://evil.test/x">]><x>&e;</x>'],
    ['entidad no definida', '<x>&nbsp;</x>'],
    ['etiqueta sin cerrar', '<x><y></x>'],
    ['dos raíces', '<x/><y/>'],
    ['prefijo sin namespace', '<p:x/>'],
  ])('CA-2: %s se rechaza como corrupto sin resolver nada', (_label, xml) => {
    expect(reasonOf(() => parse(encoder.encode(xml)))).toBe('corrupt');
  });

  it('CA-1: entidades básicas y referencias de carácter se conservan literales', () => {
    const trace = parse(
      encoder.encode('<x>&lt;b&gt; &amp; &quot;&apos; &#x41;&#66;<![CDATA[<c>]]></x>'),
    );
    expect(trace.text).toBe('<b> & "\' AB<c>');
  });

  it('CA-1: namespaces por URI, no por prefijo (Strict y Transitional, atributos r:id)', () => {
    const transitional = `<w:workbook xmlns:w="${SML}" xmlns:rel="${R}"><w:sheet name="Uno" rel:id="rId1"/></w:workbook>`;
    const strict = `<workbook xmlns="${SML_STRICT}" xmlns:r="${R}"><sheet name="Uno" r:id="rId1"/></workbook>`;
    for (const [xml, uri] of [
      [transitional, SML],
      [strict, SML_STRICT],
    ] as const) {
      const sheet = parse(encoder.encode(xml)).elements[1];
      if (sheet === undefined) throw new Error('Falta sheet');
      expect([sheet.uri, sheet.local]).toEqual([uri, 'sheet']);
      expect(attributeOf(sheet, 'name')).toBe('Uno');
      expect(attributeOf(sheet, 'id', R)).toBe('rId1');
      expect(attributeOf(sheet, 'id')).toBeUndefined();
    }
  });

  it('CA-2: error propio del consumidor se propaga intacto', () => {
    const reader = createXmlReader({
      open: () => {
        throw new OoxmlError('protected');
      },
    });
    expect(reasonOf(() => reader.write(encoder.encode('<x/>')))).toBe('protected');
  });

  it('CA-1: parseXmlPart lee una parte real del ZIP en streaming', async () => {
    const xml = `<x xmlns="urn:x">${'<v>1</v>'.repeat(5000)}</x>`;
    serveObject(await zipOf([['p/a.xml', utf16(xml, 'be')]]));
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
    let values = 0;
    await parseXmlPart(pkg, '/p/a.xml', {
      open: (element) => (values += +(element.local === 'v')),
    });
    expect(values).toBe(5000);
    await pkg.close();
  });
});
