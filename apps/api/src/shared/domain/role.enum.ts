/** Roles del sistema (`design-model.md` T1). Los internos nunca leen contenido de archivos (Art. IX.1). */
export enum Role {
  CLIENT = 'CLIENT',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
  OPERATOR = 'OPERATOR',
}

/** Los cuatro roles, para rutas de «gestionar la propia sesión»: `@Roles(...ALL_ROLES)` (003 §6.1). */
export const ALL_ROLES: readonly Role[] = Object.freeze(Object.values(Role));
