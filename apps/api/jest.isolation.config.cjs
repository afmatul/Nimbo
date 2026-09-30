const base = require('@nimbo/config/jest/base.cjs');

/**
 * Aislamiento entre cuentas (bloqueante en CI). Mismo arnés de contenedores que `int`; 003 agrega las pruebas reales.
 * `upload-cleanup.int-spec.ts` (005 T-51) también entra: el `worker` vence cargas de todos los dueños sin actor propio.
 */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: [
    '<rootDir>/test/isolation/**/*.iso-spec.ts',
    '<rootDir>/test/int/storage/upload-cleanup.int-spec.ts',
  ],
  globalSetup: '<rootDir>/test/int/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/int/setup/global-teardown.ts',
  testTimeout: 120_000,
  maxWorkers: 1,
  coverageThreshold: undefined,
};
