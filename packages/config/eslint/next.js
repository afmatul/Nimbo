// Reglas para `apps/web` (Next.js 15, App Router): `@next/eslint-plugin-next` core-web-vitals + hooks de React.
// T-29 agrega aquí la prohibición de importar `docs/design/mockups/**` (CA-8).
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

import base from './base.js';

export default tseslint.config(...base, {
  files: ['**/*.{ts,tsx}'],
  plugins: {
    '@next/next': nextPlugin,
    'react-hooks': reactHooks,
  },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
    ...reactHooks.configs.recommended.rules,
    // App Router sin `pages/`: la regla buscaría un directorio que no existe.
    '@next/next/no-html-link-for-pages': 'off',
  },
});
