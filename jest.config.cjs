/** Jest raíz: solo las pruebas de `scripts/*.spec.ts` (estructura del repositorio, `env:check`). */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/scripts/**/*.spec.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/scripts/tsconfig.json' }] },
};
