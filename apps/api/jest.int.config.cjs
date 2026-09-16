const base = require('@nimbo/config/jest/base.cjs');

/** Integración (Testcontainers). T-17 agrega `globalSetup`/`globalTeardown` y el arnés. */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/int/**/*.int-spec.ts'],
  coverageThreshold: undefined,
};
