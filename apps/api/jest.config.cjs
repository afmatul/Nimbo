const base = require('@nimbo/config/jest/base.cjs');

/** Unitarias: `src/**\/*.spec.ts`. Integración y aislamiento tienen su propia configuración. */
module.exports = { ...base, rootDir: __dirname };
