// Fronteras entre módulos de `apps/api` (ADR-0010, Art. VIII, CA-5): el grafo completo de `architecture.md` §3
// (PD-24, PD-38, PD-47). Los ciclos los detecta `cycles.js` (CA-7).
//
// Cada regla mira el texto del import: un módulo se nombra por su carpeta (`../../identity`,
// `../../../../modules/identity`), y entrar por dentro de otro (`../../access/infrastructure/…`) es error aunque la
// arista esté permitida: solo se importa desde su `index.ts` (Art. VIII.3).

/** `architecture.md` §3: cada módulo y los módulos cuya fachada puede importar. Cambiarlo exige ADR. */
const ALLOWED = {
  audit: [],
  realtime: [],
  // Transversales: solo `notifications → realtime` (regla 5).
  notifications: ['realtime'],
  identity: ['notifications', 'audit'],
  // `storage` solo para implementar `IPlanLimitsProvider` (DF-51); `identity` solo por contratos de eventos (ADR-0019).
  billing: ['notifications', 'audit', 'storage', 'identity'],
  // `access` lee tablas de `storage` y `sharing` por SQL, sin importarlos (regla 3).
  access: [],
  // Sin `billing` (DF-51, opción A) ni `identity` (DF-59).
  storage: ['access', 'audit', 'realtime'],
  sharing: ['access', 'storage', 'audit'],
  editing: ['storage', 'access', 'billing', 'realtime', 'audit'],
  intelligence: ['storage', 'access', 'billing', 'realtime'],
  optimizer: ['storage', 'access'],
  backoffice: ['audit', 'identity', 'billing', 'storage'],
};

const MODULES = Object.keys(ALLOWED);

const alternatives = (names) => names.join('|');

/** Import relativo a la carpeta de uno de `names`, con o sin el segmento `modules/`. */
const moduleImport = (names) => `^(\\.{1,2}/)+(modules/)?(${alternatives(names)})(/.*)?$`;

/** Import relativo que entra por dentro de uno de `names` en lugar de usar su `index.ts`. */
const deepImport = (names) => `^(\\.{1,2}/)+(modules/)?(${alternatives(names)})/.+$`;

const except = (allowed) => MODULES.filter((name) => !allowed.includes(name));

const moduleFiles = (name) => [`apps/api/src/modules/${name}/**/*.ts`];

/**
 * `from` solo puede importar `shared`, sus propios archivos y la fachada de los módulos de `allowed`. El mensaje
 * nombra el módulo para que el error diga qué frontera se cruzó.
 */
const onlyImports = (from, allowed) => ({
  files: moduleFiles(from),
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: moduleImport(except([from, ...allowed])),
            message:
              `\`${from}\` solo importa \`shared\`` +
              (allowed.length === 0
                ? ''
                : ` y las fachadas de ${allowed.map((n) => `\`${n}\``).join(', ')}`) +
              ' (ADR-0010). Si necesitas algo de otro módulo, pide un puerto en lugar de importarlo.',
          },
          ...(allowed.length === 0
            ? []
            : [
                {
                  regex: deepImport(allowed),
                  message: `\`${from}\` importa otros módulos solo desde su \`index.ts\` (Art. VIII.3).`,
                },
              ]),
        ],
      },
    ],
  },
});

export default [
  ...Object.entries(ALLOWED).map(([from, allowed]) => onlyImports(from, allowed)),
  // Composición del worker: de `storage` solo `StorageWorkerModule`, y solo desde `storage/index.ts` (plan 005 §3b).
  {
    files: ['apps/api/src/worker.module.ts', 'apps/api/src/worker.main.ts', 'apps/worker/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: './modules/storage',
              allowImportNames: ['StorageWorkerModule'],
              message: 'El worker importa de `storage` solo `StorageWorkerModule`.',
            },
          ],
          patterns: [
            {
              regex: deepImport(['storage']),
              message: 'El worker importa `storage` solo desde `storage/index.ts`.',
            },
          ],
        },
      ],
    },
  },
];
