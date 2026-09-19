// Reglas para las apps NestJS (`apps/api`, `apps/worker`).
// T-28/T-29 agregan aquí `boundaries.js` (fronteras y capas), `import-x/no-cycle` y `typeorm-columns.js`.
import tseslint from 'typescript-eslint';

import base from './base.js';

export default tseslint.config(...base, {
  files: ['**/*.ts'],
  rules: {
    // Nest inyecta por constructor: las clases vacías de módulos/decoradores son normales.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
});
