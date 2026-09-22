const base = require('@nimbo/config/jest/base.cjs');

/** Aislamiento entre cuentas (bloqueante en CI). Mismo arnés de contenedores que `int`; 003 agrega las pruebas reales. */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/isolation/**/*.iso-spec.ts'],
  globalSetup: '<rootDir>/test/int/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/int/setup/global-teardown.ts',
  testTimeout: 120_000,
  maxWorkers: 1,
  coverageThreshold: undefined,
};
