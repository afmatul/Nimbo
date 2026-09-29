import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { NextConfig } from 'next';

/** Raíz del monorepo: Next no debe tomar otro lockfile de más arriba como raíz del workspace. */
const REPO_ROOT = resolve(__dirname, '../..');
const REPO_DOTENV = resolve(REPO_ROOT, '.env');

// En local el `.env` vive en la raíz (como para `api` y `worker`); Next solo lee el de `apps/web`.
// `loadEnvFile` no pisa lo que ya está en el entorno: en contenedores y staging manda el entorno.
if (existsSync(REPO_DOTENV)) {
  process.loadEnvFile(REPO_DOTENV);
}

const nextConfig: NextConfig = {
  // Imagen mínima (`server.js` + `.next/static`), CA-28/CA-29. Nada se hornea: no hay `NEXT_PUBLIC_*`.
  output: 'standalone',
  outputFileTracingRoot: REPO_ROOT,
  reactStrictMode: true,
  // El lint corre con `pnpm lint` (flat config raíz), no dentro de `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
