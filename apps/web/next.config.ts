import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imagen mínima (`server.js` + `.next/static`), CA-28/CA-29. Nada se hornea: no hay `NEXT_PUBLIC_*`.
  output: 'standalone',
  reactStrictMode: true,
  // El lint corre con `pnpm lint` (flat config raíz), no dentro de `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
