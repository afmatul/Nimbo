import { z } from 'zod';

/** Roles del sistema (spec 003 §2). Mismos valores que `Role` de `api`; `roles-contract.spec.ts` lo comprueba. */
export const ROLES = ['CLIENT', 'ADMIN', 'SUPPORT', 'OPERATOR'] as const;

export const roleSchema = z.enum(ROLES);

export type RoleName = z.infer<typeof roleSchema>;
