// Jest base (unitarias) para apps y paquetes: ts-jest, pruebas junto al código y
// umbral de cobertura del 60 % en la lógica de negocio (`application/` y `domain/`), Art. III.4.
// `isolatedModules: true` en tsconfig hace que ts-jest solo transpile; el tipado lo verifica `pnpm typecheck`.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
    '!src/**/*.module.ts',
  ],
  coverageThreshold: {
    './src/**/application/**/*.ts': { lines: 60, statements: 60, branches: 60, functions: 60 },
    './src/**/domain/**/*.ts': { lines: 60, statements: 60, branches: 60, functions: 60 },
  },
  clearMocks: true,
};
