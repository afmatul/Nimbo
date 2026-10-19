import { OoxmlError, type ZipPackage } from './ooxml-package-reader';
import { attributeOf, parseXmlPart, type XmlElement, type XmlHandlers } from './ooxml-xml-reader';
import type { SlideReading } from './pptx-model';

export const PML_NS: ReadonlySet<string> = new Set([
  'http://schemas.openxmlformats.org/presentationml/2006/main',
  'http://purl.oclc.org/ooxml/presentationml/main',
]);
export const DML_NS: ReadonlySet<string> = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
]);
export const REL_NS = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
];
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

export type SlideHeader = { readonly hidden: boolean; readonly showMasterShapes: boolean };
export type SlidePart = { readonly part: string; readonly root: 'sld' | 'sldLayout' | 'sldMaster' };

export function assertCurrent(reading: SlideReading): void {
  if (!reading.current() || reading.signal?.aborted) throw new OoxmlError('unavailable');
}

export function booleanAttribute(element: XmlElement, name: string, fallback: boolean): boolean {
  const value = attributeOf(element, name)?.trim();
  if (value === undefined) return fallback;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  throw new OoxmlError('corrupt');
}

/** CT_Slide.show (ISO/IEC 29500-1): ausencia = visible; no es un atributo de p:sldId. */
export function slideHeader(element: XmlElement): SlideHeader {
  return {
    hidden: !booleanAttribute(element, 'show', true),
    showMasterShapes: booleanAttribute(element, 'showMasterSp', true),
  };
}

type CompatibilityFrame = {
  readonly mode: 'pass' | 'transparent' | 'skip';
  readonly alternate: boolean;
};

function compatibilityFrame(element: XmlElement, parent?: CompatibilityFrame): CompatibilityFrame {
  if (parent?.mode === 'skip') return { mode: 'skip', alternate: false };
  if (element.uri !== MC_NS) return { mode: 'pass', alternate: false };
  const alternate = element.local === 'AlternateContent';
  const fallback = element.local === 'Fallback' && parent?.alternate;
  return { mode: alternate || fallback ? 'transparent' : 'skip', alternate };
}

/** Decisión del bloque PPTX: solo Fallback; las envolturas MC no alteran la jerarquía del contenido. */
export function fallbackOnly(handlers: XmlHandlers): XmlHandlers {
  const stack: CompatibilityFrame[] = [];
  return {
    ...handlers,
    open: (element) => {
      const frame = compatibilityFrame(element, stack[stack.length - 1]);
      stack.push(frame);
      if (frame.mode === 'pass') handlers.open?.(element);
    },
    close: (element) => {
      if (stack.pop()?.mode === 'pass') handlers.close?.(element);
    },
    text: (value) => {
      if (stack[stack.length - 1]?.mode !== 'skip') handlers.text?.(value);
    },
  };
}

const HEADER_END = new Error('Fin de cabecera de diapositiva');

/** Solo la cabecera por slide para el listado; el texto se lee bajo demanda, sin cachearlo al abrir. */
export async function readSlideHeader(pkg: ZipPackage, part: string): Promise<SlideHeader> {
  let header: SlideHeader | undefined;
  await parseXmlPart(pkg, part, {
    root: { local: 'sld', namespaces: PML_NS },
    open: (element) => {
      header = slideHeader(element);
      throw HEADER_END;
    },
  }).catch((error: unknown) => {
    if (error !== HEADER_END) throw error;
  });
  if (header === undefined) throw new OoxmlError('corrupt');
  return header;
}
