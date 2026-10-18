import { OoxmlError, partKey, type ZipPackage } from './ooxml-package-reader';
import { attributeOf, parseXmlPart, type XmlElement, type XmlName } from './ooxml-xml-reader';

export type OoxmlKind = 'xlsx' | 'pptx';
export type RelationTarget =
  | { readonly mode: 'internal'; readonly part: string }
  | { readonly mode: 'external' }
  | { readonly mode: 'invalid' };
/** Sin política por tipo: cada lector decide si ignora o rechaza una relación externa o inválida. */
export type Relationship = {
  readonly id: string;
  readonly type: string;
  readonly target: RelationTarget;
};
export type ContentTypes = { readonly of: (partName: string) => string | undefined };
export type OoxmlDocument = { readonly mainPart: string; readonly contentTypes: ContentTypes };

const TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_DOCUMENT = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
]);
const MAIN_CONTENT_TYPES: Readonly<Record<OoxmlKind, string>> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
};
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const EXTERNAL: RelationTarget = { mode: 'external' };
const INVALID: RelationTarget = { mode: 'invalid' };

const corrupt = (): OoxmlError => new OoxmlError('corrupt');

/** Se decodifica una sola vez y solo para validar: `%2e%2e` o `%2F` no pueden saltarse el traversal. */
function validSegment(segment: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false;
  }
  return decoded !== '' && !decoded.endsWith('.') && !/[/\\\0]/.test(decoded);
}

/** RFC 3986 dentro del paquete (ECMA-376-2 §6.5.3): nunca sale de la raíz ni acepta esquema o autoridad. */
export function resolveTarget(source: string, target: string, external: boolean): RelationTarget {
  if (external) return EXTERNAL;
  if (target === '' || SCHEME.test(target) || target.startsWith('//') || /[\\?#]/.test(target))
    return INVALID;
  const segments = target.startsWith('/') ? [] : source.split('/').slice(1, -1);
  for (const segment of target.replace(/^\//, '').split('/')) {
    if (segment === '.') continue;
    if (segment === '..') {
      if (segments.pop() === undefined) return INVALID;
      continue;
    }
    if (!validSegment(segment)) return INVALID;
    segments.push(segment);
  }
  return segments.length === 0 ? INVALID : { mode: 'internal', part: `/${segments.join('/')}` };
}

export function relationshipsPartOf(source: string): string {
  const slash = source.lastIndexOf('/');
  return `${source.slice(0, slash)}/_rels/${source.slice(slash + 1)}.rels`;
}

/** Recorre una parte plana `<raíz><hijo/>…</raíz>` validando namespace y profundidad. */
async function readChildren(
  pkg: ZipPackage,
  part: { readonly name: string; readonly root: XmlName },
  onChild: (element: XmlElement) => void,
): Promise<void> {
  let depth = 0;
  await parseXmlPart(pkg, part.name, {
    open: (element) => {
      depth++;
      const isRoot = element.uri === part.root.uri && element.local === part.root.local;
      if (depth === 1 ? !isRoot : depth > 2 || element.uri !== part.root.uri) throw corrupt();
      if (depth === 2) onChild(element);
    },
    close: () => {
      depth--;
    },
  });
}

function relationshipOf(source: string, element: XmlElement): Relationship {
  const [id, type, target] = ['Id', 'Type', 'Target'].map((name) => attributeOf(element, name));
  const mode = attributeOf(element, 'TargetMode');
  if (element.local !== 'Relationship' || !id || !type || target === undefined) throw corrupt();
  if (mode !== undefined && mode !== 'Internal' && mode !== 'External') throw corrupt();
  return { id, type, target: resolveTarget(source, target, mode === 'External') };
}

/** Relaciones de una parte (`/` para el paquete); una parte sin `.rels` no tiene relaciones. */
export async function readRelationships(
  pkg: ZipPackage,
  source: string,
): Promise<readonly Relationship[]> {
  const name = relationshipsPartOf(source);
  if (!pkg.has(name)) return [];
  const items: Relationship[] = [];
  const ids = new Set<string>();
  await readChildren(pkg, { name, root: { uri: RELS_NS, local: 'Relationships' } }, (element) => {
    const item = relationshipOf(source, element);
    if (ids.has(item.id)) throw corrupt();
    ids.add(item.id);
    items.push(item);
  });
  return items;
}

function addUnique(map: Map<string, string>, key: string | undefined, value: string | undefined) {
  if (!key || !value || map.has(partKey(key))) throw corrupt();
  map.set(partKey(key), value);
}

function extensionOf(partName: string): string | undefined {
  const name = partName.slice(partName.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 || dot === name.length - 1 ? undefined : partKey(name.slice(dot + 1));
}

export async function readContentTypes(pkg: ZipPackage): Promise<ContentTypes> {
  const name = '/[Content_Types].xml';
  if (!pkg.has(name)) throw corrupt();
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();
  await readChildren(pkg, { name, root: { uri: TYPES_NS, local: 'Types' } }, (element) => {
    const contentType = attributeOf(element, 'ContentType');
    if (element.local === 'Default')
      addUnique(defaults, attributeOf(element, 'Extension'), contentType);
    else if (element.local === 'Override')
      addUnique(overrides, attributeOf(element, 'PartName'), contentType);
    else throw corrupt();
  });
  return {
    of: (partName) => {
      const extension = extensionOf(partName);
      const fallback = extension === undefined ? undefined : defaults.get(extension);
      return overrides.get(partKey(partName)) ?? fallback;
    },
  };
}

/** Parte principal única, interna, presente y con el content type del formato pedido (RN-4). */
export async function openOoxmlDocument(pkg: ZipPackage, kind: OoxmlKind): Promise<OoxmlDocument> {
  const contentTypes = await readContentTypes(pkg);
  if (!pkg.has('/_rels/.rels')) throw corrupt();
  const documents = (await readRelationships(pkg, '/')).filter(({ type }) =>
    OFFICE_DOCUMENT.has(type),
  );
  const target = documents.length === 1 ? documents[0]?.target : undefined;
  if (target?.mode !== 'internal' || !pkg.has(target.part)) throw corrupt();
  if (contentTypes.of(target.part) !== MAIN_CONTENT_TYPES[kind]) throw corrupt();
  return { mainPart: target.part, contentTypes };
}
