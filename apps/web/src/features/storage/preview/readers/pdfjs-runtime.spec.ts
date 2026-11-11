import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

describe('configuración local PDF.js T-08a', () => {
  it('CA-11: bundler emite un worker local y los assets de render, sin CDN ni scripting', async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'testing/pdf-build-check.mjs'),
    ]);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      wasm: 3,
      cmaps: 168,
      fonts: 14,
      icc: 1,
      localWorkerEntries: 1,
      cdnReferences: 0,
      scriptingAssets: 0,
    });
  });
  it('CA-11: worker del mismo paquete fijado, sin CDN, scripting ni URL de objeto', () => {
    const entry = readFileSync(join(__dirname, '../workers/pdfjs.worker.ts'), 'utf8');
    const runtime = readFileSync(join(__dirname, 'pdfjs-runtime.ts'), 'utf8');
    const adapter = readFileSync(join(__dirname, 'pdfjs-adapter.ts'), 'utf8');
    const manifest = JSON.parse(
      readFileSync(require.resolve('pdfjs-dist/package.json'), 'utf8'),
    ) as { version: string };
    expect(manifest.version).toBe('6.4.299');
    expect(entry).toContain("import 'pdfjs-dist/build/pdf.worker.mjs'");
    expect(runtime).toContain("new URL('../workers/pdfjs.worker.ts', import.meta.url)");
    expect(/https?:|cdn|eval\(|createObjectURL|importScripts\(/.test(entry + runtime)).toBe(false);
    expect(adapter).toContain('enableXfa: false');
    expect(adapter).not.toMatch(/src\.url|httpHeaders|AnnotationLayer|ScriptingManager/);
    expect(adapter).toContain('disableAutoFetch: true');
    expect(adapter).toContain('disableStream: true');
  });
  it('CA-11: assets locales del motor no usan el helper de objetos firmados y omiten credenciales', () => {
    const runtime = readFileSync(join(__dirname, 'pdfjs-runtime.ts'), 'utf8');
    expect(runtime).not.toMatch(/object-bytes|pdf-range-transport|fetchObjectBytes/);
    expect(runtime).toMatch(
      /fetch\(resourceUrl\(kind, filename\), \{ credentials: 'omit', signal \}\)/,
    );
  });
});
