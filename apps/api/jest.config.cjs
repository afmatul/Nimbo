const base = require('@nimbo/config/jest/base.cjs');

/**
 * Unitarias: `src/**\/*.spec.ts` y las de los dobles de prueba de `test/support` (p. ej. la suite de contrato del
 * verificador de tokens, 003 T-06) y los cálculos de `test/perf` (020 T-09; la corrida real no es una prueba).
 * Integración y aislamiento tienen su propia configuración.
 */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: [
    ...base.testMatch,
    '<rootDir>/test/support/**/*.spec.ts',
    '<rootDir>/test/perf/**/*.spec.ts',
  ],
};
