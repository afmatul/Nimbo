// `apps/web` no importa mockups (CA-8, CLAUDE.md «Prohibiciones»): son referencia, no código de la app.
const MESSAGE = 'Los mockups son solo referencia: copia el patrón a `components/` o `features/`.';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/docs/design/mockups/**'], message: MESSAGE },
            { group: ['@mockups/*', '@mockups/**'], message: MESSAGE },
          ],
        },
      ],
    },
  },
];
