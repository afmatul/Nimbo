import { XMLParser } from 'fast-xml-parser';
import { unzipSync, type UnzipFileInfo } from 'fflate';

import { NotIndexableError } from '../../domain/errors';

/**
 * Tope de bytes descomprimidos que se leen de un paquete OOXML (ADR-0031 a): corta las bombas de compresión antes de
 * inflar. El texto de un documento que llega al tope de fragmentos (D-4) ocupa mucho menos, aun con el marcado XML.
 */
export const OOXML_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Nodo de `fast-xml-parser` con `preserveOrder`: `{ etiqueta: hijos, ':@'?: atributos }` o `{ '#text': texto }`. */
export type XmlNode = Readonly<Record<string, unknown>>;

const ATTRIBUTES_KEY = ':@';
const TEXT_KEY = '#text';

/** Conserva el orden de los elementos y el texto tal cual (espacios incluidos y sin convertir números). */
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Etiqueta del nodo, o `undefined` si es texto. */
export function tagOf(node: XmlNode): string | undefined {
  return Object.keys(node).find((key) => key !== ATTRIBUTES_KEY && key !== TEXT_KEY);
}

export function childrenOf(node: XmlNode): readonly XmlNode[] {
  const tag = tagOf(node);
  return tag === undefined ? [] : (node[tag] as readonly XmlNode[]);
}

export function textOf(node: XmlNode): string | undefined {
  const text = node[TEXT_KEY];
  return typeof text === 'string' ? text : undefined;
}

export function attributeOf(node: XmlNode, name: string): string | undefined {
  const attributes = node[ATTRIBUTES_KEY] as Readonly<Record<string, string>> | undefined;
  return attributes?.[name];
}

/** Primer hijo con la etiqueta dada. */
export function childNamed(node: XmlNode, tag: string): XmlNode | undefined {
  return childrenOf(node).find((child) => tagOf(child) === tag);
}

/** Lee las partes pedidas sin inflar si su tamaño declarado supera el tope; un zip ilegible no es OOXML (CA-5). */
function unzipParts(content: Uint8Array, paths: readonly string[]): Record<string, Uint8Array> {
  let declared = 0;
  const wanted = (file: UnzipFileInfo): boolean => {
    if (!paths.includes(file.name)) return false;
    declared += file.originalSize;
    if (declared > OOXML_MAX_UNCOMPRESSED_BYTES) throw new NotIndexableError('demasiado_grande');
    return true;
  };
  try {
    return unzipSync(content, { filter: wanted });
  } catch (error) {
    if (error instanceof NotIndexableError) throw error;
    throw new NotIndexableError('formato_no_soportado');
  }
}

function parseXml(bytes: Uint8Array): readonly XmlNode[] {
  try {
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return parser.parse(xml, true) as readonly XmlNode[];
  } catch {
    throw new NotIndexableError('formato_no_soportado');
  }
}

/**
 * Lector común de paquetes OOXML (`.docx`, `.xlsx`, `.pptx`; ADR-0031 a): zip con `fflate` y XML con
 * `fast-xml-parser`. Solo descomprime las partes pedidas, con tope de bytes; un zip o un XML dañado es
 * `formato_no_soportado`.
 */
export class OoxmlPackage {
  private constructor(private readonly parts: ReadonlyMap<string, readonly XmlNode[]>) {}

  static read(content: Uint8Array, paths: readonly string[]): OoxmlPackage {
    const files = unzipParts(content, paths);
    const parts = Object.entries(files).map(([path, bytes]) => [path, parseXml(bytes)] as const);
    return new OoxmlPackage(new Map(parts));
  }

  /** Parte obligatoria: si falta, el paquete no es del tipo esperado (CA-5). */
  part(path: string): readonly XmlNode[] {
    const part = this.parts.get(path);
    if (part === undefined) throw new NotIndexableError('formato_no_soportado');
    return part;
  }

  optionalPart(path: string): readonly XmlNode[] | undefined {
    return this.parts.get(path);
  }
}
