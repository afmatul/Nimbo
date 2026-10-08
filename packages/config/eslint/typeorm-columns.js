// Tipos de columna en las entidades de TypeORM (DF-06, DF-23, DF-24; CLAUDE.md «Tamaños en bytes siempre `bigint`»):
// una propiedad que termina en `Bytes` se guarda en `bigint`, y una de dinero (`Centavos`/`Cents`) en enteros, nunca
// en `numeric`, `decimal` ni coma flotante. Las propiedades se reconocen por el nombre, como en el E-R. Va en la raíz
// después de `nest.js`, porque repite los selectores de `rls.js` para no apagarlos en las entidades.
import { RLS_RESTRICTED_SYNTAX } from './rls.js';

const BYTES_MESSAGE = 'Los tamaños en bytes se guardan en `bigint` (DF-06).';
const MONEY_MESSAGE =
  'El dinero se guarda en centavos enteros, no en `numeric`, `decimal` ni flotantes (DF-23).';

const COLUMN = "Decorator > CallExpression[callee.name='Column']";
const BYTES = 'PropertyDefinition[key.name=/Bytes$/]';
const MONEY = 'PropertyDefinition[key.name=/(Centavos|Cents)$/]';
const NOT_INTEGER = '/^(numeric|decimal|float|real|double precision|money)$/';

/** El tipo llega como primer argumento (`@Column('bigint', …)`) o como `type` del objeto (`@Column({ type })`). */
const typeIs = (property, test) => [
  `${property} > ${COLUMN} > Literal.arguments:first-child[value${test}]`,
  `${property} > ${COLUMN} > ObjectExpression.arguments:first-child > Property[key.name='type'][value.value${test}]`,
];

const TYPEORM_RESTRICTED_SYNTAX = [
  ...typeIs(BYTES, "!='bigint'").map((selector) => ({ selector, message: BYTES_MESSAGE })),
  ...typeIs(MONEY, `=${NOT_INTEGER}`).map((selector) => ({ selector, message: MONEY_MESSAGE })),
];

export default [
  {
    files: ['**/*.orm-entity.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...RLS_RESTRICTED_SYNTAX, ...TYPEORM_RESTRICTED_SYNTAX],
    },
  },
];
