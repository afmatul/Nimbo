import type { RoleName } from '@nimbo/contracts';

const CLIENT_HOME = '/archivos';
const INTERNAL_HOME = '/interno';

/** Inicio de cada rol (003 §6.9, D-5): Mis archivos para el cliente y el área interna para los roles internos. */
export function homePathFor(role: RoleName): string {
  return role === 'CLIENT' ? CLIENT_HOME : INTERNAL_HOME;
}
