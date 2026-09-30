import type { RoleName } from '@nimbo/contracts';

/** Nombre visible de cada rol (003 DT-12); `Record` exhaustivo: un rol nuevo en `contracts` no compila sin su etiqueta. */
export const ROLE_LABELS: Readonly<Record<RoleName, string>> = {
  CLIENT: 'Cliente',
  ADMIN: 'Administrador',
  SUPPORT: 'Soporte',
  OPERATOR: 'Operador',
};
