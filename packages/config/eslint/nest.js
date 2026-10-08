// Reglas para las apps NestJS (`apps/api`, `apps/worker`).
// Fronteras (`boundaries.js`), capas (`layers.js`) y tipos de columna (`typeorm-columns.js`) se componen en la raíz:
// dependen de rutas concretas y la raíz reemplaza los `files` de esta configuración. Aquí, ciclos (CA-7).
import tseslint from 'typescript-eslint';

import base from './base.js';
import cycles from './cycles.js';
import rls from './rls.js';

export default tseslint.config(...base, ...rls, ...cycles, {
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
