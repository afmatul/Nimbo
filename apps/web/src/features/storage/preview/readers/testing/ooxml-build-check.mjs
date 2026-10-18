import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bundled = require('next/dist/compiled/webpack/webpack');
bundled.init();
const directory = mkdtempSync(join(tmpdir(), 'nimbo-ooxml-worker-'));
const count = (sources, pattern) => sources.filter((source) => pattern.test(source)).length;
const WEBPACK_CHUNK_LOADER =
  'importScripts(__webpack_require__.p + __webpack_require__.u(chunkId))';
try {
  const compiler = bundled.webpack({
    mode: 'production',
    target: 'web',
    entry: fileURLToPath(new URL('../ooxml-runtime.ts', import.meta.url)),
    output: { path: directory, filename: 'engine.js', publicPath: '/_next/static/' },
    optimization: { minimize: false },
    resolve: { extensions: ['.ts', '.mjs', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: fileURLToPath(new URL('./pdf-typescript-loader.cjs', import.meta.url)),
        },
      ],
    },
    performance: false,
  });
  const stats = await new Promise((resolve, reject) =>
    compiler.run((error, value) => (error ? reject(error) : resolve(value))),
  );
  await new Promise((resolve) => compiler.close(resolve));
  if (stats.hasErrors()) {
    // Diagnóstico de compilación: no interviene ninguna URL/archivo de cliente.
    process.stderr.write(stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
  } else {
    const assets = readdirSync(directory, { recursive: true }).filter(
      (path) => typeof path === 'string',
    );
    const scripts = assets
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(join(directory, path), 'utf8'));
    const summary = {
      localWorkerEntries: readFileSync(join(directory, 'engine.js'), 'utf8').match(
        /new Worker\(new URL\([^)]*__webpack_require__\.u\(/g,
      )?.length,
      workerChunks: count(scripts, /SaxesParser|saxes/),
      wasmAssets: assets.filter((path) => path.endsWith('.wasm')).length,
      inlineWasm: count(scripts, /data:application\/wasm|WebAssembly\./),
      blobWorkers: count(scripts, /createObjectURL/),
      // Salida clásica como la de Next: webpack carga los chunks locales del worker solo con esta forma.
      unexpectedImportScripts: scripts
        .map((source) => source.replaceAll(WEBPACK_CHUNK_LOADER, ''))
        .filter((source) => /importScripts\(/.test(source)).length,
      dynamicCode: count(scripts, /\beval\(|new Function\(/),
      cdnReferences: count(
        scripts,
        /unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|cdn\.skypack|esm\.sh/,
      ),
    };
    process.stdout.write(JSON.stringify(summary));
    const expected = { localWorkerEntries: 1, wasmAssets: 0, inlineWasm: 0, blobWorkers: 0 };
    const clean =
      summary.unexpectedImportScripts === 0 &&
      summary.dynamicCode === 0 &&
      summary.cdnReferences === 0;
    const matches = Object.entries(expected).every(([key, value]) => summary[key] === value);
    if (!clean || !matches || summary.workerChunks < 1) process.exitCode = 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
