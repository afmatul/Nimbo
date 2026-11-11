import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bundled = require('next/dist/compiled/webpack/webpack');
bundled.init();
const directory = mkdtempSync(join(tmpdir(), 'nimbo-pdf-worker-'));
try {
  const compiler = bundled.webpack({
    mode: 'production',
    target: 'web',
    entry: fileURLToPath(new URL('../pdfjs-runtime.ts', import.meta.url)),
    output: {
      path: directory,
      filename: 'engine.js',
      library: { type: 'module' },
      assetModuleFilename: 'assets/[name].[contenthash][ext]',
      publicPath: '/_next/static/',
    },
    experiments: { outputModule: true },
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
    // El número de chunks JS depende del bundler; los invariantes son worker local y ningún CDN.
    const scripts = assets
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(join(directory, path), 'utf8'));
    const summary = {
      wasm: assets.filter((path) => path.endsWith('.wasm')).length,
      cmaps: assets.filter((path) => path.endsWith('.bcmap')).length,
      fonts: assets.filter((path) => /\.(ttf|pfb)$/.test(path)).length,
      icc: assets.filter((path) => path.endsWith('.icc')).length,
      localWorkerEntries: readFileSync(join(directory, 'engine.js'), 'utf8').match(
        /new Worker\(new URL\([^)]*__webpack_require__\.u\(/g,
      )?.length,
      cdnReferences: scripts.filter((source) =>
        /unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|mozilla\.github\.io/.test(source),
      ).length,
      scriptingAssets: assets.filter((path) => /quickjs|scripting|sandbox/.test(path)).length,
    };
    process.stdout.write(JSON.stringify(summary));
    if (
      summary.wasm !== 3 ||
      summary.cmaps !== 168 ||
      summary.fonts !== 14 ||
      summary.icc !== 1 ||
      summary.localWorkerEntries !== 1 ||
      summary.cdnReferences !== 0 ||
      summary.scriptingAssets !== 0
    )
      process.exitCode = 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
