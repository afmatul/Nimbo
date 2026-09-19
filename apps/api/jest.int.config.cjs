const base = require('@nimbo/config/jest/base.cjs');

/** Integración (Testcontainers): un juego de contenedores por corrida (`globalSetup`), suites en serie. */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/int/**/*.int-spec.ts'],
  globalSetup: '<rootDir>/test/int/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/int/setup/global-teardown.ts',
  testTimeout: 120_000,
  maxWorkers: 1,
  coverageThreshold: undefined,
};
