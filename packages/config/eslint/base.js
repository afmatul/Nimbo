// Base ESLint (flat config) para todo el monorepo: TypeScript estricto con reglas tipadas,
// import-x para importaciones y Prettier desactivando las reglas de formato.
// Las fronteras entre módulos y capas (CA-5 a CA-8) se agregan en `nest.js`/`next.js` (spec 000, T-28/T-29).
import eslintConfigPrettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { flatConfigs as importXConfigs } from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export const GENERATED_IGNORES = [
  '**/dist/**',
  '**/dist-worker/**',
  '**/.next/**',
  '**/coverage/**',
  '**/node_modules/**',
];

export default tseslint.config(
  { ignores: GENERATED_IGNORES },
  ...tseslint.configs.strictTypeChecked,
  importXConfigs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // `import type` explícito ayuda a que el lint de capas distinga tipos de dependencias reales.
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/no-unresolved': 'off',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Resolución de `.ts`/`.tsx` con el tsconfig más cercano (y, desde T-28, el alias `@nimbo/api/*`).
    files: ['**/*.{ts,tsx}'],
    settings: {
      'import-x/extensions': ['.ts', '.tsx', '.js', '.jsx'],
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          // Relativos a la raíz del repositorio (`pnpm lint` se ejecuta allí).
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json', 'scripts/tsconfig.json'],
        }),
      ],
    },
    rules: {
      // TypeScript ya verifica los nombres exportados.
      'import-x/named': 'off',
    },
  },
  {
    // Archivos de configuración en JS: sin reglas tipadas.
    files: ['**/*.{js,cjs,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Pruebas: los mocks y `describe`/`it` aceptan promesas y expresiones sueltas.
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.int-spec.ts', '**/*.iso-spec.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  eslintConfigPrettier,
);
