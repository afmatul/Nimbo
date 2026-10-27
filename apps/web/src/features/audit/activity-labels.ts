import { formatBytes, type AuditEventResponse, type RoleName } from '@nimbo/contracts';

import type { ActivityOriginFilter } from './hooks/use-activity';

/**
 * Textos de «Mi actividad» (plan 004 §2, tuteo). Salen de este catálogo, nunca del evento: el evento no trae nombres
 * de archivo ni del actor (D-2, D-3).
 */

/** Acción que la web aún no conoce (el catálogo de la API es más nuevo): se muestra sin romper. */
export const UNKNOWN_ACTIVITY_LABEL = 'Actividad en tu cuenta';

export const ORIGIN_FILTER_LABELS: Readonly<Record<ActivityOriginFilter, string>> = {
  all: 'Todo',
  self: 'Yo',
  staff: 'Personal de Nimbo',
};

const SELF_LABEL = 'Tú';
/** Origen de la purga programada de la papelera: su actor es el dueño, pero no la pidió (CA-7). */
const SCHEDULED_LABEL = 'Nimbo (automático)';
/** Origen `staff` con un rol sin rótulo propio. */
const STAFF_LABEL = ORIGIN_FILTER_LABELS.staff;

const STAFF_ROLE_LABELS: Readonly<Partial<Record<RoleName, string>>> = {
  SUPPORT: 'Soporte de Nimbo',
  ADMIN: 'Administración de Nimbo',
  OPERATOR: 'Operación de Nimbo',
};

/**
 * Cómo se lee una acción: en segunda persona si la hiciste tú; con el rol como sujeto si fue el personal; impersonal
 * si la hizo una tarea programada (`trigger: 'scheduled'`, CA-7).
 */
interface ActionText {
  /** Ausente si la acción solo la hace el personal (011): nunca se lee en segunda persona. */
  readonly self?: (what: string) => string;
  readonly staff: (what: string, actor: string) => string;
  readonly scheduled?: (what: string, plural: boolean) => string;
}

const REJECTED_UPLOAD = 'Se rechazó una carga';

/** La misma frase la lea quien la lea: los cambios de la suscripción (010) no los hace el personal (CA-23). */
const sameText = (text: string): ActionText => ({ self: () => text, staff: () => text });

const ACTION_TEXTS: Readonly<Record<string, ActionText>> = {
  'file.upload_completed': { self: (w) => `Subiste ${w}`, staff: (w, a) => `${a} subió ${w}` },
  'file.upload_rejected': { self: () => REJECTED_UPLOAD, staff: () => REJECTED_UPLOAD },
  'file.download_url_issued': {
    self: (w) => `Descargaste ${w}`,
    staff: (w, a) => `${a} descargó ${w}`,
  },
  'node.trashed': {
    self: (w) => `Enviaste ${w} a la papelera`,
    staff: (w, a) => `${a} envió ${w} a la papelera`,
  },
  'node.restored': { self: (w) => `Restauraste ${w}`, staff: (w, a) => `${a} restauró ${w}` },
  'node.purged': {
    self: (w) => `Eliminaste definitivamente ${w}`,
    staff: (w, a) => `${a} eliminó definitivamente ${w}`,
    scheduled: (w, plural) =>
      `${plural ? 'Se eliminaron' : 'Se eliminó'} definitivamente ${w} al vencer en la papelera`,
  },
  'trash.emptied': {
    self: () => 'Vaciaste la papelera',
    staff: (_w, a) => `${a} vació la papelera`,
  },
  /** Acciones internas sobre tu cuenta (011, CA-16): el sujeto es solo el rol. */
  'account.suspended': {
    staff: (_w, a) => `${a} suspendió tu cuenta`,
  },
  'account.reactivated': {
    staff: (_w, a) => `${a} reactivó tu cuenta`,
  },
  'account.internal_created': {
    staff: (_w, a) => `${a} creó tu cuenta`,
  },
  'client.files_viewed': {
    staff: (_w, a) => `${a} consultó la lista de tus archivos (sin abrir su contenido)`,
  },
  /** Ajustes de la cuenta (011b CA-9, RN-4): el evento no trae cifras ni fechas, solo la acción y el rol. */
  'account.quota_adjusted': {
    staff: (_w, a) => `${a} ajustó la cuota de tu cuenta`,
  },
  'account.validity_adjusted': {
    staff: (_w, a) => `${a} extendió la vigencia de tu plan`,
  },
  /** Suscripción (010 CA-6, CA-22): sin plan ni tarjeta en el evento; la pasada automática actúa como el dueño. */
  'subscription.auto_renew_changed': sameText('Cambiaste la renovación automática'),
  'subscription.renewed': sameText('Se renovó tu plan'),
  'subscription.renewal_rejected': sameText('Se rechazó el cobro de la renovación'),
  'subscription.read_only_entered': sameText(
    'Tu suscripción venció y tu cuenta quedó en solo lectura',
  ),
  'subscription.read_only_exited': sameText('Tu cuenta salió de solo lectura'),
  'subscription.plan_change_scheduled': sameText('Programaste un cambio de plan'),
  'subscription.plan_change_cancelled': sameText('Cancelaste el cambio de plan'),
  'subscription.plan_change_applied': sameText('Se aplicó tu cambio de plan'),
  'subscription.plan_change_discarded': sameText(
    'Se descartó tu cambio de plan: ese plan ya no está disponible',
  ),
};

const UNIT_NOUNS: Readonly<Record<NonNullable<AuditEventResponse['resourceType']>, string>> = {
  file: '1 archivo',
  folder: '1 carpeta',
  upload: '1 carga',
};

/** Recurso sin tipo ni cantidad: la acción es sobre la cuenta (mockup, pregunta 2). */
const ACCOUNT_RESOURCE = 'Cuenta';
/** Objeto de la frase cuando el evento no dice qué ni cuántos. */
const SOME_ITEM = '1 elemento';

function isScheduled(event: AuditEventResponse): boolean {
  return event.trigger === 'scheduled';
}

/** «Tú», «Nimbo (automático)» o el rol del personal, nunca nombre ni correo (D-2). */
export function activityActorLabel(event: AuditEventResponse): string {
  if (isScheduled(event)) return SCHEDULED_LABEL;
  if (event.origin === 'self') return SELF_LABEL;
  return STAFF_ROLE_LABELS[event.actorRole] ?? STAFF_LABEL;
}

function isPlural({ itemCount }: AuditEventResponse): boolean {
  return itemCount !== null && itemCount !== 1;
}

/** «3 elementos», «1 archivo» o `null` si el evento no dice qué ni cuántos. */
function quantityOf(event: AuditEventResponse): string | null {
  if (isPlural(event)) return `${String(event.itemCount)} elementos`;
  return event.resourceType === null ? null : UNIT_NOUNS[event.resourceType];
}

export function activityActionLabel(event: AuditEventResponse): string {
  const text = ACTION_TEXTS[event.action];
  if (text === undefined) return UNKNOWN_ACTIVITY_LABEL;
  const what = quantityOf(event) ?? SOME_ITEM;
  if (isScheduled(event) && text.scheduled !== undefined) {
    return text.scheduled(what, isPlural(event));
  }
  if (event.origin === 'self' && text.self !== undefined) return text.self(what);
  return text.staff(what, activityActorLabel(event));
}

/** Tipo y cantidad del recurso, con su tamaño si lo trae: «1 archivo, 12 MB» (D-3). */
export function activityResourceLabel(event: AuditEventResponse): string {
  const quantity = quantityOf(event) ?? ACCOUNT_RESOURCE;
  return event.sizeBytes === null ? quantity : `${quantity}, ${formatBytes(event.sizeBytes)}`;
}
