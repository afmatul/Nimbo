import type { RestoreResponse, TrashItem } from '@nimbo/contracts';

import { MY_FILES_LABEL } from '../storage/routes';

import { dayText } from './backoffice-dates';

/** Resultado de una restauración de Soporte, tal como se le avisa (011b CA-11, CA-17; spec §6, mensajes clave). */
export interface TrashNotice {
  readonly tone: 'success' | 'error';
  readonly title: string;
  readonly detail: string;
}

/** «Mis archivos» o «Mis archivos / Legal»: dónde estaba (o queda) un elemento. */
export const locationText = (folderName: string | null | undefined): string =>
  folderName === null || folderName === undefined
    ? MY_FILES_LABEL
    : `${MY_FILES_LABEL} / ${folderName}`;

/** El motivo queda en la auditoría de la persona; se dice con su nombre de pila, nunca con el de quien restauró. */
const auditLine = (firstName: string): string => `El motivo quedó en la auditoría de ${firstName}.`;

/** Dónde quedó: en su lugar, con un nombre nuevo (CA-14 de 006) o en la raíz porque la carpeta ya no está (CA-15). */
export function restoredNotice(
  item: TrashItem,
  response: RestoreResponse,
  firstName: string,
): TrashNotice {
  const folder = item.originalFolder?.name;
  const audit = auditLine(firstName);
  if (response.outcome === 'moved_to_root') {
    return {
      tone: 'success',
      title: `La carpeta original ya no está disponible. Restauramos «${response.originalName}» en ${MY_FILES_LABEL}.`,
      detail: audit,
    };
  }
  if (response.outcome === 'renamed') {
    return {
      tone: 'success',
      title: `Restauramos «${response.originalName}» como «${response.item.name}» porque ya existía uno con ese nombre.`,
      detail: `Quedó en «${folder ?? MY_FILES_LABEL}». ${audit}`,
    };
  }
  return {
    tone: 'success',
    title: `Restauramos «${response.originalName}» en ${locationText(folder)}.`,
    detail: audit,
  };
}

/**
 * `404` del servidor: la retención terminó o el elemento ya no es una raíz de esa papelera (el cliente lo restauró o
 * vació la papelera). «Venció el» solo si `purgeAt` ya pasó; si no, la fecha sería futura. Nada cambió (CA-12).
 */
export function unavailableNotice(item: TrashItem, firstName: string, now: Date): TrashNotice {
  const expired = new Date(item.purgeAt) <= now;
  return {
    tone: 'error',
    title: `Ya no se puede restaurar «${item.name}».`,
    detail: expired
      ? `Su retención venció el ${dayText(item.purgeAt)}. Nada cambió.`
      : `Ya no está en la papelera de ${firstName}. Nada cambió.`,
  };
}

/** `422` de profundidad (CA-12): solo el cliente puede mover la carpeta original; Soporte no mueve carpetas (RN-3). */
export const depthExceededText = (item: TrashItem, maxDepth: string, firstName: string): string =>
  `«${item.name}» superaría ${maxDepth} niveles de carpetas en «${locationText(item.originalFolder?.name)}». Nada cambió. Pídele a ${firstName} que mueva la carpeta original a un nivel más alto y vuelve a intentarlo.`;
