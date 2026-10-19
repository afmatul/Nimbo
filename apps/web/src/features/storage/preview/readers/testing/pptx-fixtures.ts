import { contentTypes, NS, relationship, relationships, type FixtureEntry } from './ooxml-fixtures';

export const PML = {
  transitional: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  strict: 'http://purl.oclc.org/ooxml/presentationml/main',
} as const;
export const DML = {
  transitional: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  strict: 'http://purl.oclc.org/ooxml/drawingml/main',
} as const;
export const PPTX_REL = {
  transitional: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  strict: 'http://purl.oclc.org/ooxml/officeDocument/relationships',
} as const;
export const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

export type PptxPartFixture = {
  readonly body?: string;
  readonly attributes?: string;
  readonly extraRelationships?: readonly string[];
};
type FixtureSlide = PptxPartFixture & { readonly layout?: number };
type FixtureLayout = PptxPartFixture & { readonly master?: number };
export type PresentationFixture = {
  readonly strict?: boolean;
  readonly slides: readonly FixtureSlide[];
  readonly order?: readonly number[];
  readonly layouts?: readonly FixtureLayout[];
  readonly masters?: readonly PptxPartFixture[];
  readonly extraRelationships?: readonly string[];
};

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const paragraph = (runs: readonly string[]): string =>
  `<a:p>${runs.map((text) => `<a:r><a:t xml:space="preserve">${escapeXml(text)}</a:t></a:r>`).join('')}</a:p>`;

export function shapeXml(
  id: number,
  body: string,
  flags: { placeholder?: boolean; hidden?: boolean } = {},
): string {
  const hidden = flags.hidden ? ' hidden="1"' : '';
  const placeholder = flags.placeholder ? '<p:ph type="body"/>' : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Sintética ${id}"${hidden}/><p:cNvSpPr/><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>`;
}

export function textShape(
  id: number,
  paragraphs: readonly (readonly string[])[],
  flags: { placeholder?: boolean; hidden?: boolean } = {},
): string {
  return shapeXml(id, paragraphs.map(paragraph).join(''), flags);
}

export function groupShape(id: number, body: string, hidden = false): string {
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Grupo"${hidden ? ' hidden="true"' : ''}/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${body}</p:grpSp>`;
}

export function tableShape(id: number, rows: readonly (readonly string[])[]): string {
  const grid = (rows[0] ?? []).map(() => '<a:gridCol w="1"/>').join('');
  const body = rows
    .map(
      (row) =>
        `<a:tr h="1">${row.map((text) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraph([text])}</a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`,
    )
    .join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabla"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="${TABLE_URI}"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

export function partXml(root: string, fixture: PptxPartFixture, strict = false): string {
  const p = strict ? PML.strict : PML.transitional;
  const a = strict ? DML.strict : DML.transitional;
  const r = strict ? PPTX_REL.strict : PPTX_REL.transitional;
  return `<p:${root} xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}" xmlns:mc="${MC}"${fixture.attributes ? ` ${fixture.attributes}` : ''}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${fixture.body ?? ''}</p:spTree></p:cSld></p:${root}>`;
}

export function presentationXml(fixture: PresentationFixture): string {
  const p = fixture.strict ? PML.strict : PML.transitional;
  const r = fixture.strict ? PPTX_REL.strict : PPTX_REL.transitional;
  const order = fixture.order ?? fixture.slides.map((_slide, index) => index);
  const slides = order
    .map((index) => `<p:sldId id="${256 + index}" r:id="rIdSlide${index + 1}"/>`)
    .join('');
  return `<p:presentation xmlns:p="${p}" xmlns:r="${r}" xmlns:mc="${MC}"><p:sldIdLst>${slides}</p:sldIdLst></p:presentation>`;
}

function slideParts(fixture: PresentationFixture): FixtureEntry[] {
  const rel = fixture.strict ? PPTX_REL.strict : PPTX_REL.transitional;
  const entries: FixtureEntry[] = [];
  fixture.slides.forEach((slide, index) => {
    entries.push([`ppt/slides/slide${index + 1}.xml`, partXml('sld', slide, fixture.strict)]);
    const layout =
      slide.layout === undefined
        ? []
        : [
            relationship(
              'rIdLayout',
              `${rel}/slideLayout`,
              `../slideLayouts/slideLayout${slide.layout + 1}.xml`,
            ),
          ];
    entries.push([
      `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      relationships([...layout, ...(slide.extraRelationships ?? [])]),
    ]);
  });
  return entries;
}

function layoutParts(fixture: PresentationFixture): FixtureEntry[] {
  const rel = fixture.strict ? PPTX_REL.strict : PPTX_REL.transitional;
  const entries: FixtureEntry[] = [];
  (fixture.layouts ?? []).forEach((layout, index) => {
    entries.push([
      `ppt/slideLayouts/slideLayout${index + 1}.xml`,
      partXml('sldLayout', layout, fixture.strict),
    ]);
    const master =
      layout.master === undefined
        ? []
        : [
            relationship(
              'rIdMaster',
              `${rel}/slideMaster`,
              `../slideMasters/slideMaster${layout.master + 1}.xml`,
            ),
          ];
    entries.push([
      `ppt/slideLayouts/_rels/slideLayout${index + 1}.xml.rels`,
      relationships([...master, ...(layout.extraRelationships ?? [])]),
    ]);
  });
  return entries;
}

function masterParts(fixture: PresentationFixture): FixtureEntry[] {
  const entries: FixtureEntry[] = [];
  (fixture.masters ?? []).forEach((master, index) => {
    entries.push([
      `ppt/slideMasters/slideMaster${index + 1}.xml`,
      partXml('sldMaster', master, fixture.strict),
    ]);
    entries.push([
      `ppt/slideMasters/_rels/slideMaster${index + 1}.xml.rels`,
      relationships(master.extraRelationships ?? []),
    ]);
  });
  return entries;
}

/** ZIP y relaciones en orden inverso al de las slides; ningún dato procede de una presentación real. */
export function pptxEntries(fixture: PresentationFixture): FixtureEntry[] {
  const rel = fixture.strict ? PPTX_REL.strict : PPTX_REL.transitional;
  const office = fixture.strict ? NS.strictDocument : NS.transitionalDocument;
  const slides = fixture.slides
    .map((_slide, index) =>
      relationship(`rIdSlide${index + 1}`, `${rel}/slide`, `slides/slide${index + 1}.xml`),
    )
    .reverse();
  return [
    ...[...slideParts(fixture), ...layoutParts(fixture), ...masterParts(fixture)].reverse(),
    ['[Content_Types].xml', contentTypes('pptx')],
    ['_rels/.rels', relationships([relationship('rIdDocument', office, 'ppt/presentation.xml')])],
    ['ppt/presentation.xml', presentationXml(fixture)],
    [
      'ppt/_rels/presentation.xml.rels',
      relationships([...slides, ...(fixture.extraRelationships ?? [])]),
    ],
  ];
}
