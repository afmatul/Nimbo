import { z } from 'zod';

/** Roles del sistema (spec 003 §2). Mismos valores que `Role` de `api`; `roles-contract.spec.ts` lo comprueba. */
export const ROLES = ['CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR'] as const;

export const roleSchema = z.enum(ROLES);

/** Roles de las cuentas internas: los que puede tener un alta del backoffice (spec 011 CA-5). */
export const INTERNAL_ROLES = ['ADMIN', 'SUPPORT', 'OPERATOR'] as const;

export type RoleName = z.infer<typeof roleSchema>;
export type InternalRoleName = (typeof INTERNAL_ROLES)[number];
