import type { RoleName } from '@nimbo/contracts';

import { ACTIVITY_PATH } from '../audit/routes';

const CLIENT_HOME = '/archivos';
const INTERNAL_HOME = '/interno';
const INTERNAL_ACTIVITY = '/interno/actividad';

/** Rutas del área interna (011 plan §2): un solo lugar para `backoffice`, `identity` y `audit`. */
export const INTERNAL_PATHS = {
  supportFiles: '/soporte/metadatos',
} as const;

/** Roles del grupo `(cliente)` (003 §6.9); los del grupo `(interno)` son `INTERNAL_ROLES` de `contracts`. */
export const CLIENT_ROLES: readonly RoleName[] = ['CLIENT'];

/**
 * Primera pantalla del área de los roles que ya la tienen (011 CA-17). Admin y Operador se suman con sus páginas en
 * T-13 y T-11; mientras tanto, `/interno` les muestra el marcador.
 */
const AREA_HOME: Partial<Readonly<Record<RoleName, string>>> = {
  SUPPORT: INTERNAL_PATHS.supportFiles,
};

/** Inicio de cada rol (003 §6.9, D-5): Mis archivos para el cliente y `/interno` (que lleva a su área) para los internos. */
export function homePathFor(role: RoleName): string {
  return CLIENT_ROLES.includes(role) ? CLIENT_HOME : INTERNAL_HOME;
}

/** Pantalla donde empieza el área interna del rol, o `null` si aún no tiene; `/interno` redirige aquí (011 CA-17). */
export function areaHomePathFor(role: RoleName): string | null {
  return AREA_HOME[role] ?? null;
}

/** «Mi actividad» de cada rol (004, 011 CA-17): la del cliente en su marco y la de los internos en el marco interno. */
export function activityPathFor(role: RoleName): string {
  return CLIENT_ROLES.includes(role) ? ACTIVITY_PATH : INTERNAL_ACTIVITY;
}
