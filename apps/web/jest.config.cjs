const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

/** Unitarias de `web`. Las páginas (Server Components) se prueban con `react-dom/server` en entorno `node`. */
module.exports = createJestConfig({
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // `pnpm test` corre `api` y `web` a la vez: con todos los núcleos para cada uno, las guardas de tiempo de `api`
  // (redact-deep, R-8) y las esperas de las vistas fallan por pura contención.
  maxWorkers: '50%',
  // Los formularios se prueban tecleando con user-event; con varios workers 5 s no alcanzan.
  testTimeout: 30_000,
});
