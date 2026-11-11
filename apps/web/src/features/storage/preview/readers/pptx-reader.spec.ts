import { OoxmlError, openZipPackage } from './ooxml-package-reader';
import { openOoxmlDocument } from './ooxml-relations';
import { openPptxPresentation } from './pptx-reader';
import { SIGNED_URL, serveObject } from './testing/object-server';
import { relationship, relationships, zipOf, type FixtureEntry } from './testing/ooxml-fixtures';
import { holdPart } from './testing/pptx-cancellation';
import {
  groupShape,
  paragraph,
  PML,
  PPTX_REL,
  pptxEntries,
  shapeXml,
  tableShape,
  textShape,
  type PresentationFixture,
} from './testing/pptx-fixtures';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

async function openEntries(
  entries: readonly FixtureEntry[],
  options: Parameters<typeof zipOf>[1] = {},
) {
  const server = serveObject(await zipOf(entries, options));
  const controller = new AbortController();
  const pkg = await openZipPackage({ url: SIGNED_URL, signal: controller.signal });
  try {
    const presentation = await openPptxPresentation(pkg, await openOoxmlDocument(pkg, 'pptx'));
    return { pkg, presentation, server, controller };
  } catch (error) {
    await pkg.close();
    throw error;
  }
}

async function blocks(fixture: PresentationFixture, index = 0) {
  const { pkg, presentation } = await openEntries(pptxEntries(fixture));
  try {
    return (await presentation.readSlide(index, { current: () => true })).blocks;
  } finally {
    await pkg.close();
  }
}

async function reasonOf(operation: Promise<unknown>): Promise<string> {
  const outcome: unknown = await operation.then(
    () => 'ok',
    (error: unknown) => error,
  );
  if (outcome === 'ok') return outcome;
  expect(outcome).toBeInstanceOf(OoxmlError);
  expect((outcome as OoxmlError).message).toBe('No se pudo leer el paquete OOXML.');
  expect(Reflect.has(outcome as object, 'cause')).toBe(false);
  return (outcome as OoxmlError).reason;
}

const text = (value: string) => ({ kind: 'text', text: value });

describe('PPTX T-09b: presentación y orden', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'CA-1: sldIdLst determina orden y hidden usa sld/@show (strict=%s)',
    async (strict) => {
      const { pkg, presentation } = await openEntries(
        pptxEntries({
          strict,
          slides: [
            { body: textShape(2, [['Uno']]) },
            { body: textShape(2, [['Dos']]), attributes: 'show="false"' },
            { body: textShape(2, [['Tres']]), attributes: 'show="1"' },
          ],
          order: [2, 0, 1],
        }),
      );
      try {
        expect(presentation.preview).toEqual({
          kind: 'pptx',
          slides: [
            { index: 0, state: 'visible' },
            { index: 1, state: 'visible' },
            { index: 2, state: 'hidden' },
          ],
        });
        for (const [index, value] of ['Tres', 'Uno', 'Dos'].entries())
          expect(await presentation.readSlide(index, { current: () => true })).toEqual({
            index,
            blocks: [text(value)],
          });
        expect(JSON.stringify(presentation.preview)).not.toMatch(/ppt\/|rId/);
      } finally {
        await pkg.close();
      }
    },
  );

  it('CA-1: presentación sin slides y slide vacía son vacíos válidos', async () => {
    const { pkg, presentation } = await openEntries(pptxEntries({ slides: [] }));
    try {
      expect(presentation.preview).toEqual({ kind: 'pptx', slides: [] });
    } finally {
      await pkg.close();
    }
    expect(await blocks({ slides: [{}] })).toEqual([]);
  });

  it('CA-1: Fallback también determina la lista de slides de la presentación', async () => {
    const fixture: PresentationFixture = { slides: [{ body: textShape(2, [['Fallback']]) }, {}] };
    const entries = pptxEntries(fixture).map(
      ([name, content]) =>
        [
          name,
          name === 'ppt/presentation.xml'
            ? String(content)
                .replace(
                  '<p:sldIdLst>',
                  '<mc:AlternateContent><mc:Choice Requires="p"><p:sldIdLst><p:sldId id="300" r:id="rIdSlide2"/></p:sldIdLst></mc:Choice><mc:Fallback><p:sldIdLst>',
                )
                .replace(
                  '</p:sldIdLst></p:presentation>',
                  '</p:sldIdLst></mc:Fallback></mc:AlternateContent></p:presentation>',
                )
            : content,
        ] as const,
    );
    const { pkg, presentation } = await openEntries(entries);
    try {
      expect(presentation.preview.slides).toHaveLength(2);
      expect((await presentation.readSlide(0, { current: () => true })).blocks).toEqual([
        text('Fallback'),
      ]);
    } finally {
      await pkg.close();
    }
  });

  it.each(['show="off"', 'showMasterSp="yes"'])(
    'CA-2: booleano OOXML inválido %s es corrupto',
    async (attributes) => {
      expect(await reasonOf(openEntries(pptxEntries({ slides: [{ attributes }] })))).toBe(
        'corrupt',
      );
    },
  );

  it.each([
    'r:id ausente',
    'r:id duplicado',
    'id duplicado',
    'target duplicado',
    'tipo incorrecto',
    'External',
    'parte faltante',
    'raíz incorrecta',
  ])('CA-2: %s en la presentación es corrupto', async (fault) => {
    let entries = pptxEntries({ slides: [{}, {}] });
    entries = entries.map(([name, content]) => {
      let xml = String(content);
      if (name === 'ppt/presentation.xml') {
        if (fault === 'r:id ausente') xml = xml.replace('r:id="rIdSlide1"', '');
        if (fault === 'r:id duplicado') xml = xml.replace('r:id="rIdSlide2"', 'r:id="rIdSlide1"');
        if (fault === 'id duplicado') xml = xml.replace('id="257"', 'id="256"');
        if (fault === 'raíz incorrecta') xml = '<p:root xmlns:p="' + PML.transitional + '"/>';
      }
      if (name === 'ppt/_rels/presentation.xml.rels') {
        if (fault === 'target duplicado')
          xml = xml.replace('slides/slide2.xml', 'slides/slide1.xml');
        if (fault === 'tipo incorrecto')
          xml = xml.replace(`${PPTX_REL.transitional}/slide`, `${PPTX_REL.transitional}/hyperlink`);
        if (fault === 'External')
          xml = relationships([
            relationship(
              'rIdSlide1',
              `${PPTX_REL.transitional}/slide`,
              'https://evil.test/slide',
              true,
            ),
          ]);
      }
      return [name, xml] as const;
    });
    if (fault === 'parte faltante')
      entries = entries.filter(([name]) => name !== 'ppt/slides/slide1.xml');
    expect(await reasonOf(openEntries(entries))).toBe('corrupt');
  });
});

describe('PPTX T-09b: texto visible, grupos, tablas y Fallback', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'CA-1: runs, párrafos, br y fld cacheado sin evaluación (strict=%s)',
    async (strict) => {
      const body = shapeXml(
        2,
        paragraph(['Hola ', 'mundo']) +
          '<a:p><a:r><a:t>A</a:t></a:r><a:br/><a:fld id="{1}" type="slidenum"><a:t>42</a:t></a:fld><a:r><a:t>B</a:t></a:r></a:p>' +
          paragraph(['Final']),
      );
      expect(await blocks({ strict, slides: [{ body }] })).toEqual([
        text('Hola mundo\nA\n42B\nFinal'),
      ]);
    },
  );

  it('CA-1: grupos anidados y tablas preservan orden, filas, celdas y párrafos', async () => {
    const body =
      groupShape(2, textShape(3, [['Grupo']]) + groupShape(4, textShape(5, [['Anidado']]))) +
      tableShape(6, [
        ['A', 'B'],
        ['', 'C\nD'],
      ]) +
      textShape(7, [['Final']]);
    expect(await blocks({ slides: [{ body }] })).toEqual([
      text('Grupo'),
      text('Anidado'),
      {
        kind: 'table',
        rows: [
          ['A', 'B'],
          ['', 'C\nD'],
        ],
      },
      text('Final'),
    ]);
  });

  it('CA-1: solo Fallback de AlternateContent, también anidado; Choice no se duplica', async () => {
    const body =
      '<mc:AlternateContent><mc:Choice Requires="p">' +
      textShape(2, [['No Choice']]) +
      '</mc:Choice><mc:Fallback>' +
      textShape(3, [['Fallback']]) +
      '<mc:AlternateContent><mc:Choice Requires="a">' +
      textShape(4, [['No anidado']]) +
      '</mc:Choice><mc:Fallback>' +
      textShape(5, [['Fallback anidado']]) +
      '</mc:Fallback></mc:AlternateContent></mc:Fallback></mc:AlternateContent>';
    expect(await blocks({ slides: [{ body }] })).toEqual([
      text('Fallback'),
      text('Fallback anidado'),
    ]);
  });

  it('CA-1/11: no toma texto de timing, transiciones, extensiones, charts ni SmartArt', async () => {
    const graphic = (id: number, uri: string) =>
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name=""/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="${uri}"><a:p><a:r><a:t>EXCLUIDO</a:t></a:r></a:p></a:graphicData></a:graphic></p:graphicFrame>`;
    const body =
      textShape(2, [['Visible']]) +
      graphic(3, 'http://schemas.openxmlformats.org/drawingml/2006/chart') +
      graphic(4, 'http://schemas.openxmlformats.org/drawingml/2006/diagram') +
      '<p:extLst>' +
      textShape(5, [['EXCLUIDO']]) +
      '</p:extLst>';
    expect(await blocks({ slides: [{ body }] })).toEqual([text('Visible')]);
  });

  it('CA-1: shapes y grupos hidden no se proyectan; placeholder con texto propio sí', async () => {
    const body =
      textShape(2, [['No']], { hidden: true }) +
      groupShape(3, textShape(4, [['No grupo']]), true) +
      textShape(5, [[]], { placeholder: true }) +
      textShape(6, [['Propio']], { placeholder: true });
    expect(await blocks({ slides: [{ body }] })).toEqual([text('Propio')]);
  });

  it('CA-1: field sin texto cacheado no se evalúa ni hereda texto de plantilla', async () => {
    const body = shapeXml(2, '<a:p><a:fld id="{1}" type="slidenum"/></a:p>');
    expect(await blocks({ slides: [{ body }] })).toEqual([]);
  });

  it('CA-1/7: abrir solo lee cabeceras; aborto en mitad de XML grande y relectura sin truncar', async () => {
    const value = 'dato '.repeat(450_000);
    const entries = pptxEntries({ slides: [{ body: textShape(2, [[value]]) }] });
    const bytes = await zipOf(entries, { level: 0 });
    const { pkg, presentation, server, controller } = await openEntries(entries, { level: 0 });
    const unit = new AbortController();
    let chunks = 0;
    const readPart = pkg.readPart;
    const spy = jest.spyOn(pkg, 'readPart').mockImplementation((part, consume, signal) =>
      readPart(
        part,
        (chunk) => {
          consume(chunk);
          if (++chunks === 1) unit.abort();
        },
        signal,
      ),
    );
    try {
      expect(
        server.requests.reduce((total, { start, end }) => total + end - start + 1, 0),
      ).toBeLessThan(bytes.length / 2);
      expect(
        await reasonOf(
          presentation.readSlide(0, { signal: unit.signal, current: () => !unit.signal.aborted }),
        ),
      ).toBe('unavailable');
      expect(chunks).toBe(1);
      expect(controller.signal.aborted).toBe(false);
      spy.mockRestore();
      expect((await presentation.readSlide(0, { current: () => true })).blocks).toEqual([
        text(value),
      ]);
    } finally {
      controller.abort();
      await pkg.close();
    }
  });
});

describe('PPTX T-09b: layout/master y relaciones', () => {
  afterEach(() => jest.restoreAllMocks());

  const layers = (attributes = '', layoutAttributes = ''): PresentationFixture => ({
    slides: [
      {
        attributes,
        layout: 0,
        body: textShape(2, [[]], { placeholder: true }) + textShape(3, [['Slide']]),
      },
    ],
    layouts: [
      {
        attributes: layoutAttributes,
        master: 0,
        body:
          textShape(2, [['Click to add title']], { placeholder: true }) +
          textShape(3, [['Layout']]),
      },
    ],
    masters: [
      {
        body:
          textShape(2, [['Texto de plantilla']], { placeholder: true }) +
          textShape(3, [['Master']]),
      },
    ],
  });

  it.each([false, true])(
    'CA-1: decoración no-placeholder una vez por capa; no hereda ejemplos (strict=%s)',
    async (strict) => {
      expect(await blocks({ ...layers(), strict })).toEqual([
        text('Master'),
        text('Layout'),
        text('Slide'),
      ]);
    },
  );

  it.each(['0', 'false'])('CA-1: sld showMasterSp=%s no muestra layout/master', async (value) => {
    expect(await blocks(layers(`showMasterSp="${value}"`))).toEqual([text('Slide')]);
  });

  it('CA-1: showMasterSp del layout oculta master, sin ocultar decoración propia del layout', async () => {
    expect(await blocks(layers('', 'showMasterSp="0"'))).toEqual([text('Layout'), text('Slide')]);
  });

  it('CA-1: texto idéntico en shapes distintas no se elimina por una deduplicación de strings', async () => {
    expect(
      await blocks({ slides: [{ body: textShape(2, [['Igual']]) + textShape(3, [['Igual']]) }] }),
    ).toEqual([text('Igual'), text('Igual')]);
  });

  it.each(['slideLayout', 'slideMaster'])(
    'CA-2/11: relación estructural %s External es corrupta',
    async (kind) => {
      const external = relationship(
        'external',
        `${PPTX_REL.transitional}/${kind}`,
        'https://evil.test/structural',
        true,
      );
      const fixture = layers();
      const entries = pptxEntries(fixture).map(
        ([name, content]) =>
          [
            name,
            name ===
            (kind === 'slideLayout'
              ? 'ppt/slides/_rels/slide1.xml.rels'
              : 'ppt/slideLayouts/_rels/slideLayout1.xml.rels')
              ? relationships([external])
              : content,
          ] as const,
      );
      const { pkg, presentation } = await openEntries(entries);
      try {
        expect(await reasonOf(presentation.readSlide(0, { current: () => true }))).toBe('corrupt');
        expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
          true,
        );
      } finally {
        await pkg.close();
      }
    },
  );

  it('CA-11: hyperlinks/media externos se ignoran; notes/comments/OLE/imagenes no se leen', async () => {
    const links = [
      'hyperlink',
      'image',
      'audio',
      'video',
      'oleObject',
      'notesSlide',
      'comments',
      'chart',
      'diagramData',
    ].map((kind) =>
      relationship(kind, `${PPTX_REL.transitional}/${kind}`, `https://evil.test/${kind}`, true),
    );
    expect(
      await blocks({ slides: [{ body: textShape(2, [['Seguro']]), extraRelationships: links }] }),
    ).toEqual([text('Seguro')]);
    expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
      true,
    );
  });

  it.each([
    'ppt/slides/slide1.xml',
    'ppt/slideLayouts/slideLayout1.xml',
    'ppt/slideMasters/slideMaster1.xml',
  ])('CA-2: raíz incorrecta en %s se informa como corrupto', async (part) => {
    const entries = pptxEntries(layers()).map(
      ([name, content]) => [name, name === part ? '<root/>' : content] as const,
    );
    const reading = openEntries(entries).then(async ({ pkg, presentation }) => {
      try {
        await presentation.readSlide(0, { current: () => true });
      } finally {
        await pkg.close();
      }
    });
    expect(await reasonOf(reading)).toBe('corrupt');
  });

  it('CA-2: parte de layout faltante y relación duplicada no producen éxito parcial', async () => {
    for (const fault of ['missing', 'duplicate']) {
      let entries = pptxEntries(layers());
      if (fault === 'missing')
        entries = entries.filter(([name]) => name !== 'ppt/slideLayouts/slideLayout1.xml');
      else
        entries = entries.map(
          ([name, content]) =>
            [
              name,
              name === 'ppt/slides/_rels/slide1.xml.rels'
                ? relationships([
                    relationship(
                      'rIdLayout',
                      `${PPTX_REL.transitional}/slideLayout`,
                      '../slideLayouts/slideLayout1.xml',
                    ),
                    relationship(
                      'rIdLayout',
                      `${PPTX_REL.transitional}/slideLayout`,
                      '../slideLayouts/slideLayout1.xml',
                    ),
                  ])
                : content,
            ] as const,
        );
      const { pkg, presentation } = await openEntries(entries);
      try {
        expect(await reasonOf(presentation.readSlide(0, { current: () => true }))).toBe('corrupt');
      } finally {
        await pkg.close();
      }
    }
  });

  it.each([
    '/ppt/slides/_rels/slide1.xml.rels',
    '/ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    '/ppt/slideMasters/_rels/slideMaster1.xml.rels',
  ])(
    'CA-7: relaciones de unidad %s reciben la señal local y no bloquean la siguiente lectura',
    async (part) => {
      const { pkg, presentation, controller } = await openEntries(pptxEntries(layers()));
      const unit = new AbortController();
      const ready = holdPart(pkg, part);
      const reading = reasonOf(
        presentation.readSlide(0, { signal: unit.signal, current: () => !unit.signal.aborted }),
      );
      try {
        const origin = await Promise.race([
          ready,
          reading.then((reason) => {
            throw new Error(`La lectura terminó antes del rango: ${reason}`);
          }),
        ]);
        await origin.held;
        unit.abort();
        expect(origin.pending).toBe(0);
        expect(await reading).toBe('unavailable');
        expect(controller.signal.aborted).toBe(false);
        expect((await presentation.readSlide(0, { current: () => true })).blocks).toEqual([
          text('Master'),
          text('Layout'),
          text('Slide'),
        ]);
      } finally {
        controller.abort();
        await reading;
        await pkg.close();
      }
    },
  );
});
