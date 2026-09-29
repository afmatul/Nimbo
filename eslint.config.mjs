// Flat config raíz. Cada app/paquete toma su variante de `@nimbo/config/eslint/*`;
// `docs/**` (incluidos los mockups) queda fuera del lint (CA-4, CA-8).
import base from '@nimbo/config/eslint/base.js';
import nest from '@nimbo/config/eslint/nest.js';
import next from '@nimbo/config/eslint/next.js';
import sharedBoundaries from '@nimbo/config/eslint/shared-boundaries.js';
import tseslint from 'typescript-eslint';

const withRoot = (config) => ({
  ...config,
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const scoped = (configs, files) => configs.map((config) => ({ ...withRoot(config), files }));

export default tseslint.config(
  {
    ignores: [
      'docs/**',
      '**/dist/**',
      '**/dist-worker/**',
      '**/dist-int/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      'pnpm-lock.yaml',
    ],
  },
  ...base.map(withRoot),
  ...scoped(nest, ['apps/api/**/*.ts', 'apps/worker/**/*.ts']),
  ...scoped(next, ['apps/web/**/*.{ts,tsx}']),
  ...sharedBoundaries,
);
