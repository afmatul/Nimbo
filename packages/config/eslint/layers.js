// Capas dentro de cada módulo, de sus subcarpetas con capas propias (`storage/search`, `storage/preview`; PD-151) y de
// `shared` (CA-6, Art. VIII.2). Usa `@typescript-eslint/no-restricted-imports`, una
// regla distinta de la de `boundaries.js`: si ambas usaran `no-restricted-imports`, la última apagaría a la otra.
const RULE = '@typescript-eslint/no-restricted-imports';

const DOMAIN_MESSAGE =
  '`domain` no puede depender de frameworks ni librerías; solo `domain/`, `shared/domain` y `node:*`.';
const APPLICATION_MESSAGE =
  '`application` no importa `infrastructure` ni `presentation`: declara un puerto.';

/** Cualquier ruta que entre en una de estas capas, a cualquier profundidad. */
const intoLayers = (names) => `(^|/)(${names.join('|')})(/|$)`;

const TESTS = ['**/*.spec.ts', '**/*.int-spec.ts', '**/*.iso-spec.ts'];

export default [
  {
    files: [
      'apps/api/src/modules/*/domain/**/*.ts',
      'apps/api/src/modules/*/*/domain/**/*.ts',
      'apps/api/src/shared/domain/**/*.ts',
    ],
    ignores: TESTS,
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            // Paquetes: todo lo que no es relativo ni de Node.
            { regex: String.raw`^(?!\.|node:)`, message: DOMAIN_MESSAGE },
            {
              regex: intoLayers(['application', 'infrastructure', 'presentation']),
              message: DOMAIN_MESSAGE,
            },
            // `shared` solo por `shared/domain`: ni su `index.ts` (reexporta infraestructura) ni sus archivos sueltos.
            {
              regex: String.raw`^(\.\./)+shared(/(?!(domain|application|infrastructure|presentation)(/|$))[^/]*)?$`,
              message: DOMAIN_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/api/src/modules/*/application/**/*.ts',
      'apps/api/src/modules/*/*/application/**/*.ts',
      'apps/api/src/shared/application/**/*.ts',
    ],
    ignores: TESTS,
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            { regex: intoLayers(['infrastructure', 'presentation']), message: APPLICATION_MESSAGE },
          ],
        },
      ],
    },
  },
];
