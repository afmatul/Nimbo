import { posix } from 'node:path';

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

/** Hijos con la etiqueta dada, en orden. */
export function childrenNamed(node: XmlNode | undefined, tag: string): readonly XmlNode[] {
  return node === undefined ? [] : childrenOf(node).filter((child) => tagOf(child) === tag);
}

/** Elemento raíz de una parte, si tiene la etiqueta dada (el primer nodo suele ser la declaración `?xml`). */
export function rootNamed(part: readonly XmlNode[], tag: string): XmlNode | undefined {
  return part.find((node) => tagOf(node) === tag);
}

/** Texto directo de un elemento hoja (`w:t`, `a:t`, `t`, `v`), sin recorrer sus hijos. */
export function elementText(node: XmlNode | undefined): string {
  if (node === undefined) return '';
  return childrenOf(node)
    .map((child) => textOf(child) ?? '')
    .join('');
}

/** Ruta exacta de una parte o patrón (p. ej. todas las hojas de cálculo `xl/worksheets/*.xml`). */
export type PartPattern = string | RegExp;

function matchesAny(patterns: readonly PartPattern[], path: string): boolean {
  return patterns.some((pattern) =>
    typeof pattern === 'string' ? pattern === path : pattern.test(path),
  );
}

/** Relación de una parte OOXML: su tipo (URI) y la ruta de la parte destino dentro del paquete. */
export interface OoxmlRelationship {
  readonly type: string;
  readonly path: string;
}

/** Ruta de las relaciones de una parte: `xl/workbook.xml` → `xl/_rels/workbook.xml.rels`. */
export function relationshipsPathOf(source: string): string {
  return posix.join(posix.dirname(source), '_rels', `${posix.basename(source)}.rels`);
}

/** Lee las partes pedidas sin inflar si su tamaño declarado supera el tope; un zip ilegible no es OOXML (CA-5). */
function unzipParts(
  content: Uint8Array,
  patterns: readonly PartPattern[],
): Record<string, Uint8Array> {
  let declared = 0;
  const wanted = (file: UnzipFileInfo): boolean => {
    if (!matchesAny(patterns, file.name)) return false;
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

  /** Lee las partes que coinciden con `patterns`; el tope de bytes cuenta todas juntas. */
  static read(content: Uint8Array, patterns: readonly PartPattern[]): OoxmlPackage {
    const files = unzipParts(content, patterns);
    const parts = Object.entries(files).map(([path, bytes]) => [path, parseXml(bytes)] as const);
    return new OoxmlPackage(new Map(parts));
  }

  /** Parte obligatoria: si falta, el paquete no es del tipo esperado (CA-5). */
  part(path: string): readonly XmlNode[] {
    const part = this.parts.get(path);
    if (part === undefined) throw new NotIndexableError('formato_no_soportado');
    return part;
  }

  /** Elemento raíz de una parte obligatoria; si no es `tag`, la parte no es la esperada (CA-5). */
  root(path: string, tag: string): XmlNode {
    const root = rootNamed(this.part(path), tag);
    if (root === undefined) throw new NotIndexableError('formato_no_soportado');
    return root;
  }

  optionalPart(path: string): readonly XmlNode[] | undefined {
    return this.parts.get(path);
  }

  /**
   * Relaciones de la parte `source` (su `_rels/<nombre>.rels`, obligatoria) por id, con el destino resuelto a ruta
   * dentro del paquete: relativo a la carpeta de `source`, o absoluto si empieza con `/`.
   */
  relationships(source: string): ReadonlyMap<string, OoxmlRelationship> {
    const root = this.root(relationshipsPathOf(source), 'Relationships');
    const entries = childrenNamed(root, 'Relationship').map((node) => {
      const target = attributeOf(node, 'Target') ?? '';
      const path = target.startsWith('/')
        ? posix.normalize(target.slice(1))
        : posix.join(posix.dirname(source), target);
      const relationship = { type: attributeOf(node, 'Type') ?? '', path };
      return [attributeOf(node, 'Id') ?? '', relationship] as const;
    });
    return new Map(entries);
  }
}
