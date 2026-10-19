// Jest carga zip.js como CJS; este proceso aislado ejerce la entrada ESM publicada que usa el bundle.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith('.') &&
      context.parentURL?.endsWith('.ts') &&
      !/\.[a-z]+$/.test(specifier)
    )
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});

const URL_SIGNED = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE';
const scenario = process.argv[2] ?? 'valid';
const requests = [];

function serve(bytes) {
  globalThis.fetch = async (url, init) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('Range') ?? '');
    if (url !== URL_SIGNED || match === null) throw new Error('Petición inesperada');
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), bytes.length - 1);
    requests.push({
      start,
      end,
      omit: init.credentials === 'omit',
      headers: [...new Headers(init.headers).keys()],
    });
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  };
}

async function fixture(fixtures) {
  const slide = `<p:sld xmlns:p="urn:p">${'<t>texto</t>'.repeat(4000)}</p:sld>`;
  const entries = [...fixtures.ooxmlEntries('pptx'), ['ppt/slides/slide1.xml', slide]];
  if (scenario !== 'crc') return fixtures.zipOf(entries);
  const stored = await fixtures.zipOf(entries, { level: 0 });
  const at = stored.lastIndexOf(0x78);
  stored[at] ^= 1;
  return stored;
}

/** XLSX deflactado real: libro, shared strings, estilos de fecha, fórmula sin cache y chartsheet. */
async function xlsxFixture() {
  const { zipOf } = await import('./ooxml-fixtures.ts');
  const { row, xlsxEntries } = await import('./xlsx-fixtures.ts');
  const data =
    row(1, [
      ['A1', 't="s"', '<v>0</v>'],
      ['B1', 's="1"', '<v>46262</v>'],
      ['C1', '', '<f>NOW()</f>'],
    ]) + row(2, [['A2', '', `<v>${'9'.repeat(15)}</v>`]]);
  return zipOf(
    xlsxEntries({
      strict: scenario === 'xlsx-strict',
      sheets: [
        { name: 'Cronograma', data },
        { name: 'Gráfico', type: 'chartsheet' },
      ],
      sharedStrings: ['<r><t>Fase </t></r><r><t>0</t></r>'],
      styles: '<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>',
    }),
  );
}

async function runXlsx() {
  const bytes = await xlsxFixture();
  if (scenario === 'xlsx-fallback') delete globalThis.DecompressionStream;
  // Proceso aislado: las APIs se retiran después de crear el fixture y antes de importar el lector.
  const missingApi =
    scenario === 'xlsx-no-from-entries'
      ? 'Object.fromEntries'
      : scenario === 'xlsx-no-flat-map'
        ? 'Array.prototype.flatMap'
        : undefined;
  if (missingApi === 'Object.fromEntries') delete Object.fromEntries;
  if (missingApi === 'Array.prototype.flatMap') delete Array.prototype.flatMap;
  serve(bytes);
  const { openZipPackage } = await import('../ooxml-package-reader.ts');
  const { openOoxmlDocument } = await import('../ooxml-relations.ts');
  const { openXlsxWorkbook } = await import('../xlsx-reader.ts');
  const pkg = await openZipPackage({ url: URL_SIGNED, signal: new AbortController().signal });
  const workbook = await openXlsxWorkbook(pkg, await openOoxmlDocument(pkg, 'xlsx'));
  const projection = await workbook.readSheet(0, { offset: 0, current: () => true });
  await pkg.close();
  const native = typeof globalThis.DecompressionStream;
  const output = { ok: true, preview: workbook.preview, projection, requests, native, missingApi };
  process.stdout.write(JSON.stringify(output));
}

async function pptxFixture() {
  const { zipOf } = await import('./ooxml-fixtures.ts');
  const { pptxEntries, textShape, shapeXml, paragraph, groupShape, tableShape } =
    await import('./pptx-fixtures.ts');
  const body =
    groupShape(
      2,
      shapeXml(
        3,
        paragraph(['Hola ', 'mundo']) +
          '<a:p><a:fld id="{1}" type="slidenum"><a:t>42</a:t></a:fld></a:p>',
      ),
    ) + tableShape(4, [['A', 'B']]);
  return zipOf(
    pptxEntries({
      strict: scenario === 'pptx-strict',
      slides: [{ layout: 0, body }, { attributes: 'show="false"' }],
      layouts: [
        {
          master: 0,
          body:
            textShape(2, [['Click to add title']], { placeholder: true }) +
            textShape(3, [['Layout']]),
        },
      ],
      masters: [{ body: textShape(2, [['Master']]) }],
    }),
  );
}

async function runPptx() {
  const bytes = await pptxFixture();
  if (scenario === 'pptx-fallback') delete globalThis.DecompressionStream;
  serve(bytes);
  const { openZipPackage } = await import('../ooxml-package-reader.ts');
  const { openOoxmlDocument } = await import('../ooxml-relations.ts');
  const { openPptxPresentation } = await import('../pptx-reader.ts');
  const pkg = await openZipPackage({ url: URL_SIGNED, signal: new AbortController().signal });
  try {
    const presentation = await openPptxPresentation(pkg, await openOoxmlDocument(pkg, 'pptx'));
    const projection = await presentation.readSlide(0, { current: () => true });
    const native = typeof globalThis.DecompressionStream;
    process.stdout.write(
      JSON.stringify({ ok: true, preview: presentation.preview, projection, requests, native }),
    );
  } finally {
    await pkg.close();
  }
}

try {
  if (scenario.startsWith('pptx')) {
    await runPptx();
    process.exit();
  }
  if (scenario.startsWith('xlsx')) {
    await runXlsx();
    process.exit();
  }
  const fixtures = await import('./ooxml-fixtures.ts');
  const bytes = await fixture(fixtures);
  // Navegadores del target de Next sin deflate-raw nativo: debe actuar el respaldo zlib en JS.
  if (scenario === 'fallback') delete globalThis.DecompressionStream;
  serve(bytes);
  const { openZipPackage } = await import('../ooxml-package-reader.ts');
  const { openOoxmlDocument } = await import('../ooxml-relations.ts');
  const { parseXmlPart } = await import('../ooxml-xml-reader.ts');
  const pkg = await openZipPackage({ url: URL_SIGNED, signal: new AbortController().signal });
  const document = await openOoxmlDocument(pkg, 'pptx');
  let texts = 0;
  await parseXmlPart(pkg, '/ppt/slides/slide1.xml', {
    open: (e) => (texts += e.local === 't' ? 1 : 0),
  });
  await pkg.close();
  const output = { ok: true, mainPart: document.mainPart, texts, requests, size: bytes.length };
  process.stdout.write(
    JSON.stringify({ ...output, native: typeof globalThis.DecompressionStream }),
  );
} catch (error) {
  const reason = ['corrupt', 'protected', 'unavailable', 'memory'].includes(error?.reason)
    ? error.reason
    : 'harness';
  process.stdout.write(JSON.stringify({ ok: false, reason }));
  process.exitCode = 1;
}
