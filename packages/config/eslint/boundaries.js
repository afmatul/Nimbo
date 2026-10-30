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
  // `editing` y `sharing` solo para implementar `IUserDirectory` (016, DF-74) e `IShareeDirectory` (012, DF-84), como
  // `billing → storage`.
  identity: ['notifications', 'audit', 'editing', 'sharing'],
  // `storage` para implementar `IPlanLimitsProvider` (DF-51) y subir facturas (`IObjectStorage`); `identity` por el evento
  // de cuenta verificada (ADR-0019) y las fachadas de lectura de la 009 (`VerifiedClientLister`, `AccountContactReader`).
  billing: ['notifications', 'audit', 'storage', 'identity'],
  // `access` lee tablas de `storage` y `sharing` por SQL, sin importarlos (regla 3).
  access: [],
  // Sin `billing` (DF-51, opción A) ni `identity` (DF-59).
  storage: ['access', 'audit', 'realtime'],
  sharing: ['access', 'storage', 'audit'],
  // Sin `billing`: con `identity → editing` cerraría `editing → billing → identity → editing` (plan 016 §2).
  editing: ['storage', 'access', 'realtime', 'audit'],
  // `audit` para los resultados de la indexación (019 CA-21, DF-78; transversal sin dependencias, regla 5).
  intelligence: ['storage', 'access', 'billing', 'realtime', 'audit'],
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
