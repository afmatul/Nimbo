// Frontera de `apps/api/src/shared` con `@nimbo/contracts` (ADR-0020, review 001 I-2): `shared` no conoce los contratos
// de los módulos. La raíz de `@nimbo/contracts` reexporta `identity`, así que se permite una lista cerrada de nombres
// raíz (salud, errores, validación genérica y los roles y códigos `SHARED_*` de `contracts/shared`, 003 T-02/T-04); cualquier otro nombre, las subrutas y las rutas relativas a
// `packages/contracts` son error. Al agregar un contrato raíz genérico que `shared` necesite, súmalo a la lista.
const ROOT_CONTRACT_NAMES = [
  'ErrorResponse',
  'FieldIssueResponse',
  'HEALTH_CHECK_NAMES',
  'HEALTH_CHECK_STATUSES',
  'HealthCheckName',
  'HealthCheckStatus',
  'HealthLiveResponse',
  'HealthReadyResponse',
  'INVALID_REASON',
  'REQUIRED_REASON',
  'ROLES',
  'RoleName',
  'SHARED_ERROR_CODES',
  'SharedErrorCode',
  'UNKNOWN_FIELD_REASON',
  'errorResponseSchema',
  'fieldIssueSchema',
  'healthLiveResponseSchema',
  'healthReadyResponseSchema',
  'toFieldIssues',
];

const MESSAGE =
  '`shared` solo importa contratos raíz genéricos de `@nimbo/contracts` (ADR-0020). Recibe el esquema o la fábrica ' +
  'del módulo por parámetro en lugar de importarlos.';

export const SHARED_FILES = ['apps/api/src/shared/**/*.ts'];

export default [
  {
    files: SHARED_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@nimbo/contracts', allowImportNames: ROOT_CONTRACT_NAMES, message: MESSAGE },
          ],
          patterns: [
            { group: ['@nimbo/contracts/*', '**/packages/contracts/**'], message: MESSAGE },
          ],
        },
      ],
    },
  },
];
