import { ROLES, type RoleName } from '@nimbo/contracts';

const CLIENT_HOME = '/archivos';
const INTERNAL_HOME = '/interno';

/** Roles del grupo `(cliente)` (003 §6.9). */
export const CLIENT_ROLES: readonly RoleName[] = ['CLIENT'];

/** Roles del grupo `(interno)`: todo rol que no es de cliente, para que un rol nuevo no quede sin área. */
export const INTERNAL_ROLES: readonly RoleName[] = ROLES.filter(
  (role) => !CLIENT_ROLES.includes(role),
);

/** Inicio de cada rol (003 §6.9, D-5): Mis archivos para el cliente y el área interna para los roles internos. */
export function homePathFor(role: RoleName): string {
  return CLIENT_ROLES.includes(role) ? CLIENT_HOME : INTERNAL_HOME;
}
