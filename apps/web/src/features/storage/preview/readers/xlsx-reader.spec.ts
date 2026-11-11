import { OoxmlError, openZipPackage } from './ooxml-package-reader';
import { openOoxmlDocument } from './ooxml-relations';
import { SIGNED_URL, serveObject } from './testing/object-server';
import { relationship, relationships, zipOf } from './testing/ooxml-fixtures';
import { REL, row, xlsxEntries, type WorkbookFixture } from './testing/xlsx-fixtures';
import { openXlsxWorkbook } from './xlsx-reader';
import { SHEET_WINDOW_ROWS } from './xlsx-sheet';

jest.mock('./zip-core', () => jest.requireActual('@zip.js/zip.js/index-native.cjs'));

async function open(fixture: WorkbookFixture) {
  const server = serveObject(await zipOf(xlsxEntries(fixture)));
  const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
  try {
    const document = await openOoxmlDocument(pkg, 'xlsx');
    return { server, pkg, workbook: await openXlsxWorkbook(pkg, document) };
  } catch (error) {
    await pkg.close();
    throw error;
  }
}

async function sheet(fixture: WorkbookFixture, index = 0, offset = 0) {
  const { pkg, workbook } = await open(fixture);
  try {
    return await workbook.readSheet(index, { offset, current: () => true });
  } finally {
    await pkg.close();
  }
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

const cells = (data: string, extra: Partial<WorkbookFixture> = {}) =>
  sheet({ sheets: [{ name: 'Hoja', data }], ...extra }).then((value) =>
    value.rows.flatMap(({ cells: list }) => list.map(({ text, type }) => [text, type])),
  );

const STYLES =
  '<numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
  '<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="9"/><xf numFmtId="165"/><xf numFmtId="21"/></cellXfs>';

describe('XLSX T-09b: libro, orden y unidades', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'CA-1: orden de <sheets>, estado y tipo de cada unidad (strict=%s), no el de los .rels ni el ZIP',
    async (strict) => {
      const { pkg, workbook } = await open({
        strict,
        sheets: [
          { name: 'Cronograma' },
          { name: 'Oculta', state: 'hidden' },
          { name: 'Muy oculta', state: 'veryHidden' },
          { name: 'Gráfico', type: 'chartsheet' },
          { name: 'Diálogo', type: 'dialogsheet' },
          { name: 'Macros', type: 'xlMacrosheet' },
        ],
      });
      expect(workbook.preview).toEqual({
        kind: 'xlsx',
        sheets: [
          { name: 'Cronograma', type: 'worksheet', state: 'visible' },
          { name: 'Oculta', type: 'worksheet', state: 'hidden' },
          { name: 'Muy oculta', type: 'worksheet', state: 'veryHidden' },
          { name: 'Gráfico', type: 'chartsheet', state: 'visible' },
          { name: 'Diálogo', type: 'dialogsheet', state: 'visible' },
          { name: 'Macros', type: 'macrosheet', state: 'visible' },
        ],
      });
      expect(JSON.stringify(workbook.preview).includes('xl/')).toBe(false);
      for (const index of [3, 4, 5])
        expect(await workbook.readSheet(index, { offset: 0, current: () => true })).toEqual({
          index,
          columns: 0,
          rows: [],
          missingCache: 0,
        });
      await pkg.close();
    },
  );

  it('CA-1: libro sin hojas es un vacío válido; hoja sin datos no tiene filas', async () => {
    const { pkg, workbook } = await open({ sheets: [] });
    try {
      expect(workbook.preview.sheets).toEqual([]);
    } finally {
      await pkg.close();
    }
    expect(await sheet({ sheets: [{ name: 'Vacía' }] })).toEqual({
      index: 0,
      columns: 0,
      rows: [],
      missingCache: 0,
    });
  });

  it('CA-11: hipervínculo, imagen y externalLink externos se ignoran sin seguirse', async () => {
    const { pkg, workbook } = await open({
      sheets: [{ name: 'Uno' }],
      extraRelationships: [
        relationship('rIdLink', `${REL.transitional}/hyperlink`, 'https://evil.test/a', true),
        relationship('rIdImg', `${REL.transitional}/image`, 'https://evil.test/i.png', true),
        relationship('rIdExt', `${REL.transitional}/externalLink`, 'https://evil.test/x', true),
        relationship('rIdOle', `${REL.transitional}/oleObject`, 'https://evil.test/o', true),
        relationship('rIdMedia', `${REL.transitional}/audio`, 'https://evil.test/m', true),
      ],
    });
    expect(workbook.preview.sheets).toHaveLength(1);
    const urls = jest.mocked(globalThis.fetch).mock.calls.map(([url]) => url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url === SIGNED_URL)).toBe(true);
    await pkg.close();
  });

  it.each(['worksheet', 'chartsheet', 'dialogsheet', 'xlMacrosheet'] as const)(
    'CA-2/11: una relación estructural %s External es corrupta y nunca se obtiene',
    async (type) => {
      expect(await reasonOf(open({ sheets: [{ name: 'Externa', type, external: true }] }))).toBe(
        'corrupt',
      );
      expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
        true,
      );
    },
  );

  it('CA-11: relaciones externas de la hoja tampoco provocan fetch ni alteran valores', async () => {
    const entries = xlsxEntries({
      sheets: [{ name: 'Datos', data: row(1, [['A1', '', '<v>7</v>']]) }],
    });
    entries.push([
      'xl/worksheets/_rels/sheet1.xml.rels',
      relationships(
        ['hyperlink', 'image', 'oleObject', 'externalLink', 'video'].map((type) =>
          relationship(type, `${REL.transitional}/${type}`, `https://evil.test/${type}`, true),
        ),
      ),
    ]);
    serveObject(await zipOf(entries));
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
    try {
      const book = await openXlsxWorkbook(pkg, await openOoxmlDocument(pkg, 'xlsx'));
      expect((await book.readSheet(0, { offset: 0, current: () => true })).rows).toEqual([
        { row: 1, cells: [{ column: 1, text: '7', type: 'number' }] },
      ]);
      expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
        true,
      );
    } finally {
      await pkg.close();
    }
  });

  it.each([
    ['hoja estructural externa', { sheets: [{ name: 'Uno', external: true }] }],
    ['estado desconocido', { sheets: [{ name: 'Uno', state: 'oculta' }] }],
    ['nombre vacío', { sheets: [{ name: '' }] }],
    [
      'sharedStrings externa',
      {
        sheets: [{ name: 'Uno' }],
        extraRelationships: [
          relationship('rIdS', `${REL.transitional}/sharedStrings`, 'https://evil.test/s', true),
        ],
      },
    ],
  ] as const)('CA-2: %s es corrupto', async (_label, fixture) => {
    expect(await reasonOf(open(fixture as WorkbookFixture))).toBe('corrupt');
  });

  it('CA-2: r:id faltante, duplicado o de tipo ajeno es corrupto', async () => {
    const base = xlsxEntries({ sheets: [{ name: 'Uno' }, { name: 'Dos' }] });
    const workbook = (sheets: string) =>
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL.transitional}"><sheets>${sheets}</sheets></workbook>`;
    for (const sheets of [
      '<sheet name="A" sheetId="1"/>',
      '<sheet name="A" sheetId="1" r:id="rIdSheet1"/><sheet name="B" sheetId="2" r:id="rIdSheet1"/>',
      '<sheet name="A" sheetId="1" r:id="rIdNo"/>',
    ]) {
      const entries = base.map(([name, content]) =>
        name === 'xl/workbook.xml'
          ? ([name, workbook(sheets)] as const)
          : ([name, content] as const),
      );
      serveObject(await zipOf(entries));
      const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
      expect(
        await reasonOf(openOoxmlDocument(pkg, 'xlsx').then((d) => openXlsxWorkbook(pkg, d))),
      ).toBe('corrupt');
      await pkg.close();
      jest.restoreAllMocks();
    }
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'CA-2: tipo de relación %s no se acepta por herencia del mapa de tipos',
    async (kind) => {
      const entries = xlsxEntries({ sheets: [{ name: 'Datos' }] }).map(
        ([name, content]) =>
          [
            name,
            name === 'xl/_rels/workbook.xml.rels'
              ? String(content).replace(
                  `${REL.transitional}/worksheet`,
                  `${REL.transitional}/${kind}`,
                )
              : content,
          ] as const,
      );
      serveObject(await zipOf(entries));
      const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
      try {
        const document = await openOoxmlDocument(pkg, 'xlsx');
        expect(await reasonOf(openXlsxWorkbook(pkg, document))).toBe('corrupt');
      } finally {
        await pkg.close();
      }
    },
  );

  it.each([
    ['xl/workbook.xml', '<root/>'],
    ['xl/workbook.xml', '<workbook xmlns="urn:ajeno"/>'],
    ['xl/styles.xml', '<root/>'],
    ['xl/worksheets/sheet1.xml', '<root/>'],
    [
      'xl/sharedStrings.xml',
      '<root xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>dato</t></si></root>',
    ],
  ])('CA-2: %s con raíz ajena falla en vez de producir un vacío válido', async (part, xml) => {
    const entries = xlsxEntries({
      sheets: [{ name: 'Datos', data: row(1, [['A1', 't="s"', '<v>0</v>']]) }],
      styles: '<cellXfs><xf numFmtId="0"/></cellXfs>',
      sharedStrings: ['<t>dato</t>'],
    }).map(([name, content]) => [name, name === part ? xml : content] as const);
    serveObject(await zipOf(entries));
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
    try {
      const reading = openXlsxWorkbook(pkg, await openOoxmlDocument(pkg, 'xlsx')).then((book) =>
        book.readSheet(0, { offset: 0, current: () => true }),
      );
      expect(await reasonOf(reading)).toBe('corrupt');
    } finally {
      await pkg.close();
    }
  });
});

describe('XLSX T-09b: celdas, shared strings y fórmulas', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1: tipos básicos con valores literales cacheados, sin redondear números General', async () => {
    const data = row(1, [
      ['A1', 't="inlineStr"', '<is><t>Hola</t></is>'],
      ['B1', 't="str"', '<v>texto</v>'],
      ['C1', 't="b"', '<v>1</v>'],
      ['D1', 't="b"', '<v>0</v>'],
      ['E1', 't="e"', '<v>#DIV/0!</v>'],
      ['F1', '', '<v>0.30000000000000004</v>'],
      ['G1', 't="n"', '<v>-12</v>'],
    ]);
    expect(await cells(data)).toEqual([
      ['Hola', 'text'],
      ['texto', 'text'],
      ['VERDADERO', 'boolean'],
      ['FALSO', 'boolean'],
      ['#DIV/0!', 'error'],
      ['0.30000000000000004', 'number'],
      ['-12', 'number'],
    ]);
  });

  it('CA-1: shared strings con rich text y espacios, sin texto fonético', async () => {
    const sharedStrings = [
      '<t>Uno</t>',
      '<r><t>Dos </t></r><r><rPr><b/></rPr><t xml:space="preserve"> y medio </t></r>',
      '<t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh>',
    ];
    const data = row(1, [
      ['A1', 't="s"', '<v>2</v>'],
      ['B1', 't="s"', '<v>0</v>'],
      ['C1', 't="s"', '<v>1</v>'],
    ]);
    expect(await cells(data, { sharedStrings })).toEqual([
      ['漢字', 'text'],
      ['Uno', 'text'],
      ['Dos  y medio ', 'text'],
    ]);
  });

  it.each([
    ['índice fuera de rango', row(1, [['A1', 't="s"', '<v>5</v>']]), ['<t>a</t>']],
    ['índice no numérico', row(1, [['A1', 't="s"', '<v>x</v>']]), ['<t>a</t>']],
    ['shared string sin parte', row(1, [['A1', 't="s"', '<v>0</v>']]), undefined],
    ['booleano inválido', row(1, [['A1', 't="b"', '<v>2</v>']]), undefined],
    ['número inválido', row(1, [['A1', '', '<v>1,5</v>']]), undefined],
    ['tipo desconocido', row(1, [['A1', 't="zz"', '<v>1</v>']]), undefined],
    ['referencia inválida', row(1, [['1A', '', '<v>1</v>']]), undefined],
    ['referencia de otra fila', row(1, [['A2', '', '<v>1</v>']]), undefined],
    ['columna fuera del formato', row(1, [['XFE1', '', '<v>1</v>']]), undefined],
    ['fila fuera del formato', '<row r="1048577"><c><v>1</v></c></row>', undefined],
  ])('CA-2: %s es corrupto', async (_label, data, sharedStrings) => {
    expect(await reasonOf(cells(data, sharedStrings === undefined ? {} : { sharedStrings }))).toBe(
      'corrupt',
    );
  });

  it('CA-1: fórmula con valor guardado muestra el cache; sin cache, «Sin valor guardado» y contador', async () => {
    const data =
      row(1, [
        ['A1', '', '<f>1+1</f><v>2</v>'],
        ['B1', 't="str"', '<f>"a"&amp;"b"</f><v>ab</v>'],
        ['C1', '', '<f>NOW()</f>'],
        ['D1', 't="e"', '<f>1/0</f><v>#DIV/0!</v>'],
      ]) + row(2, [['A2', '', '<f t="shared" si="0"/>']]);
    const projection = await sheet({ sheets: [{ name: 'Hoja', data }] });
    expect(projection.rows.flatMap((r) => r.cells.map(({ text, type }) => [text, type]))).toEqual([
      ['2', 'number'],
      ['ab', 'text'],
      ['Sin valor guardado', 'no-cache'],
      ['#DIV/0!', 'error'],
      ['Sin valor guardado', 'no-cache'],
    ]);
    expect(projection.missingCache).toBe(2);
  });

  it('CA-1/11: fórmulas shared y array solo muestran cache, aunque <f> contenga una acción externa', async () => {
    const data = row(1, [
      ['A1', '', '<f t="shared" si="0" ref="A1:B1">WEBSERVICE("https://evil.test/")</f><v>17</v>'],
      ['B1', '', '<f t="shared" si="0"/><v>23</v>'],
      ['C1', '', '<f t="array" ref="C1:D1">1+1</f><v>99</v>'],
      ['D1', '', '<v>98</v>'],
      ['E1', '', '<f t="array" ref="E1">1+1</f>'],
    ]);
    expect(await cells(data)).toEqual([
      ['17', 'number'],
      ['23', 'number'],
      ['99', 'number'],
      ['98', 'number'],
      ['Sin valor guardado', 'no-cache'],
    ]);
    expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
      true,
    );
  });

  it('CA-1: cache numérica vacía en <v/> equivale a fórmula sin valor guardado', async () => {
    expect(
      await cells(
        row(1, [
          ['A1', '', '<f>1+1</f><v/>'],
          ['B1', '', '<f t="shared" si="0"/><v></v>'],
          ['C1', '', '<f t="array" ref="C1">1+1</f><v/>'],
          ['D1', 't="str"', '<f>""</f><v/>'],
        ]),
      ),
    ).toEqual([
      ['Sin valor guardado', 'no-cache'],
      ['Sin valor guardado', 'no-cache'],
      ['Sin valor guardado', 'no-cache'],
      ['', 'text'],
    ]);
  });

  it('CA-1: celdas y filas dispersas conservan número de fila y columna; celdas vacías se omiten', async () => {
    const data =
      '<row r="2"><c r="C2"><v>1</v></c><c><v>2</v></c><c r="F2" s="0"/></row>' +
      '<row r="7" spans="1:3"><c r="B7" t="inlineStr"><is><t>x</t></is></c></row>' +
      '<row r="8"/>' +
      '<row><c><v>9</v></c></row>';
    const projection = await sheet({ sheets: [{ name: 'Hoja', data }] });
    expect(projection.rows).toEqual([
      {
        row: 2,
        cells: [
          { column: 3, text: '1', type: 'number' },
          { column: 4, text: '2', type: 'number' },
        ],
      },
      { row: 7, cells: [{ column: 2, text: 'x', type: 'text' }] },
      { row: 9, cells: [{ column: 1, text: '9', type: 'number' }] },
    ]);
    expect(projection.columns).toBe(4);
  });
});

describe('XLSX T-09b: estilos mínimos de fecha, hora y porcentaje', () => {
  afterEach(() => jest.restoreAllMocks());

  it('CA-1: fechas 1900/1904, serial 60, fecha+hora, hora, porcentajes y Strict t="d"', async () => {
    const data = row(1, [
      ['A1', 's="1"', '<v>46262</v>'],
      ['B1', 's="1"', '<v>60</v>'],
      ['C1', 's="2"', '<v>46262.75</v>'],
      ['D1', 's="5"', '<v>0.5</v>'],
      ['E1', 's="3"', '<v>0.35</v>'],
      ['F1', 's="4"', '<v>0.125</v>'],
      ['G1', 's="0"', '<v>46262</v>'],
      ['H1', 't="d"', '<v>2026-08-28T18:30:00</v>'],
      ['I1', 's="1"', '<f>TODAY()</f><v>46262</v>'],
    ]);
    expect(await cells(data, { styles: STYLES })).toEqual([
      ['28/08/2026', 'date'],
      ['29/02/1900', 'date'],
      ['28/08/2026 18:00', 'date'],
      ['12:00:00', 'date'],
      ['35 %', 'percent'],
      ['12.5 %', 'percent'],
      ['46262', 'number'],
      ['28/08/2026 18:30', 'date'],
      ['28/08/2026', 'date'],
    ]);
    expect(
      await cells(row(1, [['A1', 's="1"', '<v>44800</v>']]), { styles: STYLES, date1904: true }),
    ).toEqual([['28/08/2026', 'date']]);
  });

  it.each([
    ['estilo inexistente', row(1, [['A1', 's="9"', '<v>1</v>']])],
    ['estilo inexistente en fecha ISO', row(1, [['A1', 's="9" t="d"', '<v>2026-08-28</v>']])],
    ['fecha ISO inválida', row(1, [['A1', 't="d"', '<v>2026-02-30</v>']])],
  ])('CA-2: %s es corrupto', async (_label, data) => {
    expect(await reasonOf(cells(data, { styles: STYLES }))).toBe('corrupt');
  });

  it.each([false, true])(
    'CA-1: fecha sin rollover y hora ISO en ZIP real (strict=%s)',
    async (strict) => {
      const data = row(1, [
        ['A1', 's="1"', '<v>46262.999999</v>'],
        ['B1', 's="5" t="d"', '<v>2026-08-28T18:30:00</v>'],
        ['C1', 's="1"', '<v>2958465.999999</v>'],
      ]);
      expect(await cells(data, { strict, styles: STYLES })).toEqual([
        ['28/08/2026', 'date'],
        ['18:30:00', 'date'],
        ['31/12/9999', 'date'],
      ]);
    },
  );

  it('CA-1: serial fuera del calendario con formato de fecha se muestra como número guardado', async () => {
    expect(await cells(row(1, [['A1', 's="1"', '<v>-5</v>']]), { styles: STYLES })).toEqual([
      ['-5', 'number'],
    ]);
  });
});

describe('XLSX T-09b: estructura que emite Excel 16 (saneada, sin ruta ni autor)', () => {
  afterEach(() => jest.restoreAllMocks());

  const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  const X14AC = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac';
  const SML_T = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  it('CA-1: mc:AlternateContent, x14ac, extLst, calcChain y tema no alteran la proyección', async () => {
    const workbook =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${SML_T}" xmlns:r="${REL.transitional}" xmlns:mc="${MC}" mc:Ignorable="x15" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main">` +
      '<fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="30430"/><workbookPr defaultThemeVersion="202300"/>' +
      `<mc:AlternateContent><mc:Choice Requires="x15"><x15ac:absPath xmlns:x15ac="http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac" url="X:\\"/></mc:Choice></mc:AlternateContent>` +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="1" windowHeight="1"/></bookViews>' +
      '<sheets><sheet name="Cronograma" sheetId="1" r:id="rIdSheet1"/><sheet name="Supuestos" sheetId="2" state="hidden" r:id="rIdSheet2"/></sheets>' +
      '<calcPr calcId="191029"/><extLst><ext uri="{1}"><x15:workbookPr chartTrackingRefBase="1"/></ext></extLst></workbook>';
    const sheet1 =
      `<worksheet xmlns="${SML_T}" xmlns:mc="${MC}" mc:Ignorable="x14ac" xmlns:x14ac="${X14AC}"><dimension ref="A1:E2"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>` +
      '<sheetFormatPr baseColWidth="10" defaultRowHeight="14.4" x14ac:dyDescent="0.3"/><sheetData>' +
      '<row r="1" spans="1:5" x14ac:dyDescent="0.3"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2" spans="1:5" x14ac:dyDescent="0.3"><c r="A2" t="s"><v>1</v></c><c r="B2" s="1"><v>46262</v></c><c r="C2" s="2"><v>0.35</v></c><c r="D2"><f>C2*2</f><v>0.7</v></c><c r="E2" t="b"><v>1</v></c></row>' +
      '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    const styles =
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/></font></fonts>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0"/><xf numFmtId="164" fontId="0" applyNumberFormat="1"/><xf numFmtId="9" fontId="0" applyNumberFormat="1"/></cellXfs>';
    const entries = xlsxEntries({
      sheets: [{ name: 'Cronograma' }, { name: 'Supuestos', state: 'hidden' }],
      sharedStrings: ['<t>Fase</t>', '<t>Requisitos</t>'],
      styles,
      extraRelationships: [
        relationship('rIdTheme', `${REL.transitional}/theme`, 'theme/theme1.xml'),
        relationship('rIdCalc', `${REL.transitional}/calcChain`, 'calcChain.xml'),
      ],
    }).map(([name, content]) => {
      if (name === 'xl/workbook.xml') return [name, workbook] as const;
      if (name === 'xl/worksheets/sheet1.xml') return [name, sheet1] as const;
      return [name, content] as const;
    });
    serveObject(
      await zipOf([
        ...entries,
        ['xl/theme/theme1.xml', '<a:theme xmlns:a="urn:a"/>'],
        ['xl/calcChain.xml', `<calcChain xmlns="${SML_T}"/>`],
      ]),
    );
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: new AbortController().signal });
    const book = await openXlsxWorkbook(pkg, await openOoxmlDocument(pkg, 'xlsx'));
    expect(book.preview.sheets.map(({ name, state }) => [name, state])).toEqual([
      ['Cronograma', 'visible'],
      ['Supuestos', 'hidden'],
    ]);
    const projection = await book.readSheet(0, { offset: 0, current: () => true });
    expect(projection.rows.flatMap((r) => r.cells.map(({ text, type }) => [text, type]))).toEqual([
      ['Fase', 'text'],
      ['Requisitos', 'text'],
      ['28/08/2026', 'date'],
      ['35 %', 'percent'],
      ['0.7', 'number'],
      ['VERDADERO', 'boolean'],
    ]);
    await pkg.close();
  });
});

describe('XLSX T-09b: ventana de filas navegable', () => {
  afterEach(() => jest.restoreAllMocks());

  const many = Array.from({ length: SHEET_WINDOW_ROWS * 2 + 5 }, (_, index) =>
    row(index + 1, [[`A${index + 1}`, '', `<v>${index + 1}</v>`]]),
  ).join('');

  it('CA-1: todas las filas son alcanzables por ventanas sucesivas, sin truncar', async () => {
    const { pkg, workbook } = await open({ sheets: [{ name: 'Larga', data: many }] });
    const seen: number[] = [];
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const page = await workbook.readSheet(0, { offset, current: () => true });
      seen.push(...page.rows.map(({ row: number }) => number));
      expect(page.rows.length).toBeLessThanOrEqual(SHEET_WINDOW_ROWS);
      offset = page.nextOffset;
    }
    expect(seen).toEqual(Array.from({ length: SHEET_WINDOW_ROWS * 2 + 5 }, (_, i) => i + 1));
    await pkg.close();
  });

  it('CA-7: una ventana obsoleta se corta sin publicar filas', async () => {
    const { pkg, workbook } = await open({ sheets: [{ name: 'Larga', data: many }] });
    let calls = 0;
    const reading = workbook.readSheet(0, { offset: 0, current: () => ++calls < 3 });
    expect(await reasonOf(reading)).toBe('unavailable');
    await pkg.close();
  });

  it('CA-1: offsets 0 → 200 → 400 con primera fila >1, huecos y última ventana parcial', async () => {
    const numbers = Array.from({ length: 405 }, (_, i) => 7 + i * 3);
    const data = numbers.map((n) => row(n, [[`C${n}`, '', `<v>${n}</v>`]])).join('');
    const { pkg, workbook } = await open({ sheets: [{ name: 'Dispersa', data }] });
    try {
      const seen: number[] = [];
      for (const offset of [0, 200, 400]) {
        const page = await workbook.readSheet(0, { offset, current: () => true });
        expect(page.rows.map(({ row }) => row)).toEqual(numbers.slice(offset, offset + 200));
        expect(page.nextOffset).toBe(offset === 400 ? undefined : offset + 200);
        seen.push(...page.rows.map(({ row }) => row));
      }
      expect(seen).toEqual(numbers);
      expect(new Set(seen).size).toBe(405);
      expect(await workbook.readSheet(0, { offset: 600, current: () => true })).toEqual({
        index: 0,
        columns: 0,
        rows: [],
        missingCache: 0,
      });
    } finally {
      await pkg.close();
    }
  });

  it('CA-1: una ventana de 200 filas vacías no oculta datos de la siguiente', async () => {
    const data =
      Array.from({ length: 200 }, (_, i) => `<row r="${i + 1}"/>`).join('') +
      row(900, [['A900', '', '<v>42</v>']]);
    const { pkg, workbook } = await open({ sheets: [{ name: 'Huecos', data }] });
    try {
      const first = await workbook.readSheet(0, { offset: 0, current: () => true });
      expect(first.rows).toEqual([]);
      expect(first.nextOffset).toBe(200);
      const last = await workbook.readSheet(0, { offset: 200, current: () => true });
      expect(last.rows).toEqual([{ row: 900, cells: [{ column: 1, text: '42', type: 'number' }] }]);
      expect(last.nextOffset).toBeUndefined();
    } finally {
      await pkg.close();
    }
  });

  it('CA-1: shared strings solo se resuelven para la ventana pedida', async () => {
    const sharedStrings = Array.from({ length: SHEET_WINDOW_ROWS + 1 }, (_, i) => `<t>s${i}</t>`);
    const data = Array.from({ length: SHEET_WINDOW_ROWS + 1 }, (_, index) =>
      row(index + 1, [[`A${index + 1}`, 't="s"', `<v>${index}</v>`]]),
    ).join('');
    const second = await sheet(
      { sheets: [{ name: 'S', data }], sharedStrings },
      0,
      SHEET_WINDOW_ROWS,
    );
    expect(second.rows).toEqual([
      {
        row: SHEET_WINDOW_ROWS + 1,
        cells: [{ column: 1, text: `s${SHEET_WINDOW_ROWS}`, type: 'text' }],
      },
    ]);
    expect(second.nextOffset).toBeUndefined();
  });
});

describe('XLSX T-09b: shared strings >512 KiB con zip.js y SAX reales', () => {
  afterEach(() => jest.restoreAllMocks());

  const strings = Array.from({ length: 9000 }, (_, i) => `<t>${i}:${'dato'.repeat(16)}</t>`);

  async function large(index: number) {
    const entries = xlsxEntries({
      sheets: [{ name: 'Grande', data: row(1, [['A1', 't="s"', `<v>${index}</v>`]]) }],
      sharedStrings: strings,
    });
    // Almacenado para observar rangos de varios chunks aun con datos muy compresibles.
    const bytes = await zipOf(entries, { level: 0 });
    expect(bytes.length).toBeGreaterThan(512 * 1024);
    const server = serveObject(bytes);
    const controller = new AbortController();
    const pkg = await openZipPackage({ url: SIGNED_URL, signal: controller.signal });
    const workbook = await openXlsxWorkbook(pkg, await openOoxmlDocument(pkg, 'xlsx'));
    return { pkg, workbook, server, controller };
  }

  it.each([0, 8999])(
    'CA-1/11: resuelve el índice requerido %i y permite releer sin colgar peticiones',
    async (index) => {
      const { pkg, workbook, server } = await large(index);
      try {
        const chunks: number[] = [];
        const readPart = pkg.readPart;
        jest.spyOn(pkg, 'readPart').mockImplementation((part, consume) =>
          readPart(part, (chunk) => {
            if (part.endsWith('/sharedStrings.xml')) chunks.push(chunk.length);
            consume(chunk);
          }),
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          const page = await workbook.readSheet(0, { offset: 0, current: () => true });
          expect(page.rows[0]?.cells[0]?.text).toBe(`${index}:${'dato'.repeat(16)}`);
        }
        expect(chunks.length).toBeGreaterThan(index === 0 ? 1 : 2);
        expect(Math.max(...chunks)).toBeLessThan(512 * 1024);
        expect(jest.mocked(globalThis.fetch).mock.calls.every(([url]) => url === SIGNED_URL)).toBe(
          true,
        );
        expect(server.requests.every(({ credentials }) => credentials === 'omit')).toBe(true);
      } finally {
        await pkg.close();
      }
    },
  );

  it('CA-2: índice ausente al final de una tabla grande es corrupt, sin éxito parcial', async () => {
    const { pkg, workbook } = await large(9000);
    try {
      expect(await reasonOf(workbook.readSheet(0, { offset: 0, current: () => true }))).toBe(
        'corrupt',
      );
    } finally {
      await pkg.close();
    }
  });

  it('CA-7: una shared string obsoleta interrumpe la relectura y la siguiente ventana sigue utilizable', async () => {
    const { pkg, workbook } = await large(8999);
    let checks = 0;
    try {
      expect(
        await reasonOf(workbook.readSheet(0, { offset: 0, current: () => ++checks < 20 })),
      ).toBe('unavailable');
      const page = await workbook.readSheet(0, { offset: 0, current: () => true });
      expect(page.rows[0]?.cells[0]?.text.startsWith('8999:')).toBe(true);
    } finally {
      await pkg.close();
    }
  });

  it('CA-7: abortar durante shared strings termina saneado y no inicia rangos posteriores', async () => {
    const { pkg, workbook, controller, server } = await large(8999);
    const readPart = pkg.readPart;
    jest.spyOn(pkg, 'readPart').mockImplementation((part, consume) =>
      readPart(part, (chunk) => {
        consume(chunk);
        if (part.endsWith('/sharedStrings.xml')) controller.abort();
      }),
    );
    try {
      expect(await reasonOf(workbook.readSheet(0, { offset: 0, current: () => true }))).toBe(
        'unavailable',
      );
      const started = server.requests.length;
      await new Promise((resolve) => setImmediate(resolve));
      expect(server.requests.length).toBe(started);
      expect(server.signals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      await pkg.close();
    }
  });
});
