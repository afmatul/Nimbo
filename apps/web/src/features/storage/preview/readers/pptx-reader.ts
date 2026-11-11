import { OoxmlError, partKey, type ZipPackage } from './ooxml-package-reader';
import { readRelationships, type OoxmlDocument, type Relationship } from './ooxml-relations';
import { attributeOf, parseXmlPart, type XmlElement, type XmlName } from './ooxml-xml-reader';
import type { PptxPresentation, SlideBlock, SlideReading, SlideSummary } from './pptx-model';
import { readSlidePart } from './pptx-text';
import { assertCurrent, fallbackOnly, PML_NS, readSlideHeader, REL_NS } from './pptx-xml';

type SlideUnit = { readonly part: string; readonly summary: SlideSummary };
type SlideIds = {
  readonly ordered: string[];
  readonly ids: Set<number>;
  readonly relations: Set<string>;
};
const STRUCTURAL = new Set(['slide', 'slideLayout', 'slideMaster']);
const corrupt = (): OoxmlError => new OoxmlError('corrupt');
const isPml = (element: XmlName | undefined, local: string): boolean =>
  element?.local === local && PML_NS.has(element.uri);

function relationKind(type: string): string | undefined {
  const base = REL_NS.find((prefix) => type.startsWith(`${prefix}/`));
  return base === undefined ? undefined : type.slice(base.length + 1);
}

function appendSlide(element: XmlElement, slides: SlideIds): void {
  const references = REL_NS.map((uri) => attributeOf(element, 'id', uri)).filter(
    (id) => id !== undefined,
  );
  const value = attributeOf(element, 'id') ?? '';
  const id = Number(value);
  const reference = references[0];
  if (references.length !== 1 || !reference || !/^[0-9]+$/.test(value) || !Number.isSafeInteger(id))
    throw corrupt();
  if (id < 256 || id > 2_147_483_647 || slides.ids.has(id) || slides.relations.has(reference))
    throw corrupt();
  slides.ids.add(id);
  slides.relations.add(reference);
  slides.ordered.push(reference);
}

function inSlideList(path: readonly XmlName[], element: XmlName): boolean {
  return (
    path.length === 2 &&
    isPml(path[0], 'presentation') &&
    isPml(path[1], 'sldIdLst') &&
    isPml(element, 'sldId')
  );
}

async function presentationIds(pkg: ZipPackage, part: string): Promise<readonly string[]> {
  const path: XmlName[] = [];
  const slides: SlideIds = { ordered: [], ids: new Set(), relations: new Set() };
  await parseXmlPart(
    pkg,
    part,
    fallbackOnly({
      root: { local: 'presentation', namespaces: PML_NS },
      open: (element) => {
        if (inSlideList(path, element)) appendSlide(element, slides);
        path.push({ uri: element.uri, local: element.local });
      },
      close: () => {
        path.pop();
      },
    }),
  );
  return slides.ordered;
}

function internalPart(pkg: ZipPackage, relation: Relationship | undefined): string {
  if (relation?.target.mode !== 'internal' || !pkg.has(relation.target.part)) throw corrupt();
  return relation.target.part;
}

async function pptxRelationships(pkg: ZipPackage, part: string, reading?: SlideReading) {
  if (reading) assertCurrent(reading);
  const relations = await readRelationships(pkg, part, reading?.signal);
  for (const relation of relations)
    if (STRUCTURAL.has(relationKind(relation.type) ?? '')) internalPart(pkg, relation);
  return relations;
}

function optionalPart(
  pkg: ZipPackage,
  relations: readonly Relationship[],
  kind: string,
): string | undefined {
  const matches = relations.filter((relation) => relationKind(relation.type) === kind);
  if (matches.length > 1) throw corrupt();
  return matches.length === 0 ? undefined : internalPart(pkg, matches[0]);
}

async function inheritedBlocks(
  pkg: ZipPackage,
  slide: { part: string; showMasterShapes: boolean },
  reading: SlideReading,
): Promise<readonly SlideBlock[]> {
  const relations = await pptxRelationships(pkg, slide.part, reading);
  const layoutPart = optionalPart(pkg, relations, 'slideLayout');
  if (!slide.showMasterShapes || layoutPart === undefined) return [];
  const layout = await readSlidePart(pkg, { part: layoutPart, root: 'sldLayout' }, reading);
  const layoutRelations = await pptxRelationships(pkg, layoutPart, reading);
  const masterPart = optionalPart(pkg, layoutRelations, 'slideMaster');
  if (!layout.header.showMasterShapes || masterPart === undefined) return layout.blocks;
  const master = await readSlidePart(pkg, { part: masterPart, root: 'sldMaster' }, reading);
  await pptxRelationships(pkg, masterPart, reading);
  // Orden de capas: master → layout → slide. No se deduplican textos de shapes distintas.
  return [...master.blocks, ...layout.blocks];
}

async function slideUnits(pkg: ZipPackage, document: OoxmlDocument): Promise<readonly SlideUnit[]> {
  const ids = await presentationIds(pkg, document.mainPart);
  const relations = await pptxRelationships(pkg, document.mainPart);
  const byId = new Map(relations.map((relation) => [relation.id, relation]));
  const parts = new Set<string>();
  const units: SlideUnit[] = [];
  for (const id of ids) {
    const relation = byId.get(id);
    if (relationKind(relation?.type ?? '') !== 'slide') throw corrupt();
    const part = internalPart(pkg, relation);
    if (parts.has(partKey(part))) throw corrupt();
    parts.add(partKey(part));
    const header = await readSlideHeader(pkg, part);
    units.push({
      part,
      summary: { index: units.length, state: header.hidden ? 'hidden' : 'visible' },
    });
  }
  return units;
}

export async function openPptxPresentation(
  pkg: ZipPackage,
  document: OoxmlDocument,
): Promise<PptxPresentation> {
  const units = await slideUnits(pkg, document);
  return {
    preview: { kind: 'pptx', slides: units.map(({ summary }) => summary) },
    readSlide: async (index, reading) => {
      assertCurrent(reading);
      const unit = units[index];
      if (unit === undefined) throw new OoxmlError('unavailable');
      const slide = await readSlidePart(pkg, { part: unit.part, root: 'sld' }, reading);
      const inherited = await inheritedBlocks(
        pkg,
        { part: unit.part, showMasterShapes: slide.header.showMasterShapes },
        reading,
      );
      assertCurrent(reading);
      return { index, blocks: [...inherited, ...slide.blocks] };
    },
  };
}
