const base = require('@nimbo/config/jest/base.cjs');

/** Aislamiento entre cuentas (bloqueante en CI). T-24 agrega la prueba marcador de CA-25. */
module.exports = {
  ...base,
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/isolation/**/*.iso-spec.ts'],
  coverageThreshold: undefined,
};
