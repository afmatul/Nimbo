/** Roles del sistema (`design-model.md` T1). Los internos nunca leen contenido de archivos (Art. IX.1). */
export enum Role {
  CLIENT = 'CLIENT',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
  OPERATOR = 'OPERATOR',
}

/**
 * Los cuatro roles, para rutas de «gestionar la propia sesión»: `@Roles(...ALL_ROLES)` (003 §6.1). Tupla no vacía
 * para que el *spread* cumpla la firma de `@Roles`; `actor.spec.ts` comprueba que coincide con `Object.values(Role)`.
 */
export const ALL_ROLES: readonly [Role, ...Role[]] = Object.freeze([
  Role.CLIENT,
  Role.ADMIN,
  Role.SUPPORT,
  Role.OPERATOR,
] as const);
