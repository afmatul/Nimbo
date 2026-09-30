// Reglas para las apps NestJS (`apps/api`, `apps/worker`).
// Las fronteras entre módulos viven en `boundaries.js` (se compone en la raíz); `import-x/no-cycle` y
// `typeorm-columns.js` siguen pendientes (PD-24).
import tseslint from 'typescript-eslint';

import base from './base.js';
import rls from './rls.js';

export default tseslint.config(...base, ...rls, {
  files: ['**/*.ts'],
  languageOptions: {
    parserOptions: {
      // Nest inyecta por el tipo del parámetro (`design:paramtypes`): con esto `consistent-type-imports`
      // no convierte a `import type` las clases que se usan en constructores decorados.
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
    },
  },
  rules: {
    // Nest inyecta por constructor: las clases vacías de módulos/decoradores son normales.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
});
