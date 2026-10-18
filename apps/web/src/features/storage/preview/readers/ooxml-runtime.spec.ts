import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const source = (path: string): string => readFileSync(join(__dirname, path), 'utf8');

describe('worker OOXML local T-09a', () => {
  it('CA-11: el bundler emite un worker local sin WASM, blobs, CDN ni código dinámico', async () => {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
      join(__dirname, 'testing/ooxml-build-check.mjs'),
    ]);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toMatchObject({
      localWorkerEntries: 1,
      wasmAssets: 0,
      inlineWasm: 0,
      blobWorkers: 0,
      unexpectedImportScripts: 0,
      dynamicCode: 0,
      cdnReferences: 0,
    });
  });

  it('CA-11: worker local, zip.js sin workers anidados y bytes solo por el helper único', () => {
    expect(source('ooxml-runtime.ts')).toContain(
      "new Worker(new URL('../workers/ooxml.worker.ts', import.meta.url)",
    );
    expect(source('../workers/ooxml.worker.ts')).toContain('configure({ useWebWorkers: false })');
    expect(source('zip-core.ts')).toContain("from '@zip.js/zip.js/lib/zip-core-native.js'");
    const ooxml = [
      'ooxml-range-reader.ts',
      'ooxml-package-reader.ts',
      'ooxml-xml-reader.ts',
      'ooxml-relations.ts',
      'ooxml-worker-client.ts',
      'ooxml-runtime.ts',
      'zip-core.ts',
      '../workers/ooxml-protocol.ts',
      '../workers/ooxml-session.ts',
      '../workers/ooxml.worker.ts',
    ].map(source);
    expect(
      ooxml.some((code) => /\bfetch\(|XMLHttpRequest|HttpRangeReader|importScripts/.test(code)),
    ).toBe(false);
    expect(source('ooxml-range-reader.ts')).toContain('fetchObjectBytes(');
  });
});
