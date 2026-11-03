import type { NodeAccessLevel } from '@nimbo/contracts';

/**
 * La única regla de permisos en pantalla (plan 012b §1, RN-1): sin `OWNER` no hay «Compartir» ni escrituras; la API
 * vuelve a decidir (012 CA-14).
 */
export function isOwner(level: NodeAccessLevel): boolean {
  return level === 'OWNER';
}

/** Editar en línea un `.docx` (016): el propietario y el Editor; el Lector abre y descarga (012 CA-14, CA-15). */
export function canEditDocx(level: NodeAccessLevel): boolean {
  return level !== 'VIEWER';
}

/** Nivel del actor sobre un elemento de la fila y «Compartir», que abre el diálogo (spec 012b CA-1, CA-6). */
export interface RowSharing {
  readonly level: NodeAccessLevel;
  readonly onShare: () => void;
}
