import type { RoleName } from '@nimbo/contracts';

import { ACTIVITY_PATH } from '../audit/routes';

const CLIENT_HOME = '/archivos';
const INTERNAL_HOME = '/interno';
const INTERNAL_ACTIVITY = '/interno/actividad';

const ADMIN_ACCOUNTS = '/admin/cuentas';

/** Rutas del área interna (011 plan §2): un solo lugar para `backoffice`, `identity` y `audit`. */
export const INTERNAL_PATHS = {
  supportFiles: '/soporte/metadatos',
  adminAccounts: ADMIN_ACCOUNTS,
  adminNewAccount: `${ADMIN_ACCOUNTS}/nueva`,
  /** Las mismas métricas agregadas (011 CA-12), en el área de cada rol. */
  adminMetrics: '/admin/metricas',
  operatorMetrics: '/operacion/metricas',
} as const;

/** Ficha de una cuenta (011 CA-1 a CA-4): la URL lleva solo el id, nunca el correo (RNF-17, PD-101). */
export function adminAccountPath(accountId: string): string {
  return `${ADMIN_ACCOUNTS}/${encodeURIComponent(accountId)}`;
}

/** Metadatos de los archivos de un cliente desde su ficha (011 CA-13, estado `desde-admin`), también por id. */
export function adminAccountFilesPath(accountId: string): string {
  return `${adminAccountPath(accountId)}/metadatos`;
}

/** Roles del grupo `(cliente)` (003 §6.9); los del grupo `(interno)` son `INTERNAL_ROLES` de `contracts`. */
export const CLIENT_ROLES: readonly RoleName[] = ['CLIENT'];

/** Primera pantalla del área de cada rol interno (011 CA-17); el cliente no tiene área interna. */
const AREA_HOME: Partial<Readonly<Record<RoleName, string>>> = {
  SUPPORT: INTERNAL_PATHS.supportFiles,
  ADMIN: INTERNAL_PATHS.adminAccounts,
  OPERATOR: INTERNAL_PATHS.operatorMetrics,
};

/** Inicio de cada rol (003 §6.9, D-5): Mis archivos para el cliente y `/interno` (que lleva a su área) para los internos. */
export function homePathFor(role: RoleName): string {
  return CLIENT_ROLES.includes(role) ? CLIENT_HOME : INTERNAL_HOME;
}

/** Pantalla donde empieza el área interna del rol, o `null` para el cliente; `/interno` redirige aquí (011 CA-17). */
export function areaHomePathFor(role: RoleName): string | null {
  return AREA_HOME[role] ?? null;
}

/** «Mi actividad» de cada rol (004, 011 CA-17): la del cliente en su marco y la de los internos en el marco interno. */
export function activityPathFor(role: RoleName): string {
  return CLIENT_ROLES.includes(role) ? ACTIVITY_PATH : INTERNAL_ACTIVITY;
}
