const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

/** Unitarias de `web`. Las páginas (Server Components) se prueban con `react-dom/server` en entorno `node`. */
module.exports = createJestConfig({
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  clearMocks: true,
  // Los formularios se prueban tecleando con user-event; con varios workers 5 s no alcanzan.
  testTimeout: 30_000,
});
