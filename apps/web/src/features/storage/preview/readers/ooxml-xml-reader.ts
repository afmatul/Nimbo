import { SaxesParser, type SaxesTagNS, type XMLDecl } from 'saxes';

import { OoxmlError, type ZipPackage } from './ooxml-package-reader';

export type XmlName = { readonly uri: string; readonly local: string };
export type XmlElement = XmlName & {
  /** Atributos por nombre expandido `{uri}local`; un atributo sin prefijo tiene URI vacía. */
  readonly attributes: ReadonlyMap<string, string>;
};
export type XmlHandlers = {
  readonly open?: (element: XmlElement) => void;
  readonly close?: (element: XmlName) => void;
  readonly text?: (text: string) => void;
};
export type XmlReader = { readonly write: (bytes: Uint8Array) => void; readonly end: () => void };

type Encoding = { readonly label: 'utf-8' | 'utf-16le' | 'utf-16be'; readonly bom: boolean };
type Decoding = {
  head: Uint8Array;
  encoding?: Encoding;
  decoder?: TextDecoder;
  declared?: string | undefined;
};
type Parser = SaxesParser<{ xmlns: true }>;

const corrupt = (): OoxmlError => new OoxmlError('corrupt');

export function attributeOf(element: XmlElement, local: string, uri = ''): string | undefined {
  return element.attributes.get(`{${uri}}${local}`);
}

/**
 * XML 1.0 apéndice F, restringido a lo que admite OOXML (ECMA-376-2 §8.1.4: UTF-8 o UTF-16):
 * BOM, o el patrón `<?` en UTF-16 sin BOM; cualquier otro byte nulo inicial (UTF-32, UCS-4) se rechaza.
 */
function detectEncoding(head: Uint8Array): Encoding {
  const [a, b, c, d] = head;
  if (a === 0xef && b === 0xbb && c === 0xbf) return { label: 'utf-8', bom: true };
  if (a === 0xff && b === 0xfe && !(c === 0 && d === 0)) return { label: 'utf-16le', bom: true };
  if (a === 0xfe && b === 0xff) return { label: 'utf-16be', bom: true };
  if (a === 0x3c && b === 0 && c === 0x3f && d === 0) return { label: 'utf-16le', bom: false };
  if (a === 0 && b === 0x3c && c === 0 && d === 0x3f) return { label: 'utf-16be', bom: false };
  if (a === 0 || b === 0) throw corrupt();
  return { label: 'utf-8', bom: false };
}

/** La declaración debe coincidir con lo detectado; UTF-16 sin BOM exige declararla (XML 1.0 §4.3.3). */
function declarationMatches({ label, bom }: Encoding, declared: string | undefined): boolean {
  const name = declared?.toLowerCase();
  if (label === 'utf-8') return name === undefined || name === 'utf-8';
  if (name === undefined) return bom;
  return name === 'utf-16' || name === label;
}

function concat(head: Uint8Array, bytes: Uint8Array): Uint8Array {
  const joined = new Uint8Array(head.length + bytes.length);
  joined.set(head);
  joined.set(bytes, head.length);
  return joined;
}

/** Decodifica en streaming (`fatal`): conserva caracteres y surrogates partidos entre chunks. */
function decode(state: Decoding, bytes: Uint8Array, final: boolean): string {
  if (state.decoder === undefined) {
    state.head = concat(state.head, bytes);
    if (state.head.length < 4 && !final) return '';
    state.encoding = detectEncoding(state.head);
    state.decoder = new TextDecoder(state.encoding.label, { fatal: true });
    bytes = state.head;
    state.head = new Uint8Array(0);
  }
  return final
    ? state.decoder.decode(bytes, { stream: true }) + state.decoder.decode()
    : state.decoder.decode(bytes, { stream: true });
}

function elementOf(tag: SaxesTagNS): XmlElement {
  const attributes = new Map<string, string>();
  for (const attribute of Object.values(tag.attributes))
    if (attribute.uri !== 'http://www.w3.org/2000/xmlns/')
      attributes.set(`{${attribute.uri}}${attribute.local}`, attribute.value);
  return { uri: tag.uri, local: tag.local, attributes };
}

function createParser(handlers: XmlHandlers, state: Decoding): Parser {
  const parser: Parser = new SaxesParser({ xmlns: true });
  parser.on('xmldecl', (declaration: XMLDecl) => {
    state.declared = declaration.encoding;
    if (state.encoding && !declarationMatches(state.encoding, declaration.encoding))
      throw corrupt();
  });
  // Nunca se procesa un DTD: sin entidades propias ni externas, sin fetch.
  parser.on('doctype', () => {
    throw corrupt();
  });
  parser.on('opentag', (tag) => handlers.open?.(elementOf(tag)));
  parser.on('closetag', (tag) => handlers.close?.({ uri: tag.uri, local: tag.local }));
  parser.on('text', (text) => handlers.text?.(text));
  parser.on('cdata', (text) => handlers.text?.(text));
  return parser;
}

function guarded(step: () => void): void {
  try {
    step();
  } catch (error) {
    throw error instanceof OoxmlError ? error : corrupt();
  }
}

/** Parser SAX secuencial: nunca construye un DOM y aborta en el primer error. */
export function createXmlReader(handlers: XmlHandlers): XmlReader {
  const state: Decoding = { head: new Uint8Array(0) };
  const parser = createParser(handlers, state);
  let failed = false;
  const run = (step: () => void): void => {
    if (failed) throw corrupt();
    try {
      guarded(step);
    } catch (error) {
      failed = true;
      throw error;
    }
  };
  return {
    write: (bytes) => run(() => void parser.write(decode(state, bytes, false))),
    end: () =>
      run(() => {
        parser.write(decode(state, new Uint8Array(0), true));
        if (state.encoding && !declarationMatches(state.encoding, state.declared)) throw corrupt();
        parser.close();
      }),
  };
}

export async function parseXmlPart(
  pkg: ZipPackage,
  partName: string,
  handlers: XmlHandlers,
): Promise<void> {
  const reader = createXmlReader(handlers);
  await pkg.readPart(partName, reader.write);
  reader.end();
}
