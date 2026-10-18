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

try {
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
