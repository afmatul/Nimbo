const base = require('@nimbo/config/jest/base.cjs');

/** Unitarias del paquete delgado (solo `healthcheck.ts`). T-22 agrega `jest.int.config.cjs`. */
module.exports = { ...base, rootDir: __dirname, coverageThreshold: undefined };
