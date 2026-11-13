import {
  formatBytes,
  type AuditActionName,
  type AuditEventResponse,
  type RoleName,
} from '@nimbo/contracts';

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
/** Visitante de un enlace público (013 CA-18, 013c CA-16): su actor es el dueño, pero no fue él. */
const PUBLIC_LINK_LABEL = 'Alguien con el enlace';
/** Origen `staff` con un rol sin rótulo propio. */
const STAFF_LABEL = ORIGIN_FILTER_LABELS.staff;

const STAFF_ROLE_LABELS: Readonly<Partial<Record<RoleName, string>>> = {
  /** Otro cliente sobre tu cuenta: quien recibió una compartición y salió de ella (012 CA-23), sin nombre ni correo. */
  CLIENT: 'Una persona con acceso',
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

/** La misma frase la lea quien la lea: lo que hace Nimbo o un visitante, no una persona que se nombre (010 CA-23). */
const sameText = (text: string | ((what: string) => string)): ActionText => {
  const build = typeof text === 'string' ? (): string => text : text;
  return { self: build, staff: build };
};

/** Acción que hace el cliente o, sobre su cuenta, otra persona (el personal o alguien con acceso compartido). */
const byWho = (
  self: (what: string) => string,
  staff: (what: string, actor: string) => string,
): ActionText => ({ self, staff });

/** Acción que solo hace el personal (011): el sujeto es solo el rol, nunca la segunda persona. */
const staffOnly = (staff: (what: string, actor: string) => string): ActionText => ({ staff });

/** Archivos, papelera y versiones (005, 006, 014, 016). */
const FILE_TEXTS = {
  'file.upload_completed': byWho(
    (w) => `Subiste ${w}`,
    (w, a) => `${a} subió ${w}`,
  ),
  'file.upload_rejected': sameText(REJECTED_UPLOAD),
  'file.download_url_issued': byWho(
    (w) => `Descargaste ${w}`,
    (w, a) => `${a} descargó ${w}`,
  ),
  'node.trashed': byWho(
    (w) => `Enviaste ${w} a la papelera`,
    (w, a) => `${a} envió ${w} a la papelera`,
  ),
  'node.restored': byWho(
    (w) => `Restauraste ${w}`,
    (w, a) => `${a} restauró ${w}`,
  ),
  'node.purged': {
    self: (w) => `Eliminaste definitivamente ${w}`,
    staff: (w, a) => `${a} eliminó definitivamente ${w}`,
    scheduled: (w, plural) =>
      `${plural ? 'Se eliminaron' : 'Se eliminó'} definitivamente ${w} al vencer en la papelera`,
  },
  'trash.emptied': byWho(
    () => 'Vaciaste la papelera',
    (_w, a) => `${a} vació la papelera`,
  ),
  'file.version_restored': byWho(
    (w) => `Restauraste una versión anterior de ${w}`,
    (w, a) => `${a} restauró una versión anterior de ${w}`,
  ),
  'file.version_pruned': sameText(
    (w) => `Se eliminó una versión antigua de ${w} por el límite de versiones de tu plan`,
  ),
  'file.version_created': byWho(
    (w) => `Guardaste una versión nueva de ${w} al editarlo`,
    (w, a) => `${a} guardó una versión nueva de ${w} al editarlo`,
  ),
  'edit.session_opened': byWho(
    (w) => `Abriste ${w} para editarlo`,
    (w, a) => `${a} abrió ${w} para editarlo`,
  ),
  'edit.save_failed': sameText((w) => `No se pudo guardar la edición de ${w}`),
} as const satisfies Readonly<Record<string, ActionText>>;

/** Preparación para el asistente (019) y optimización (021): las hace Nimbo, así que van sin sujeto. */
const PROCESSING_TEXTS = {
  'file.indexed': sameText((w) => `Se preparó ${w} para el asistente`),
  'file.index_unindexable': sameText((w) => `El asistente no puede leer ${w}`),
  'file.index_failed': sameText((w) => `No se pudo preparar ${w} para el asistente`),
  'file.index_retried': byWho(
    (w) => `Reintentaste preparar ${w} para el asistente`,
    (w, a) => `${a} reintentó preparar ${w} para el asistente`,
  ),
  'file.optimized': sameText((w) => `Se optimizó ${w}`),
  'file.optimization_discarded': sameText((w) => `Se descartó la optimización de ${w}`),
  'file.optimization_failed': sameText((w) => `No se pudo optimizar ${w}`),
} as const satisfies Readonly<Record<string, ActionText>>;

/**
 * Compartición (012) y enlaces públicos (013): sin nombres, correos, tokens ni IP. Quien sale de una compartición es
 * «Una persona con acceso» (`share.revoked`, CA-23); lo que hace un visitante del enlace va sin sujeto (CA-18).
 */
const SHARING_TEXTS = {
  'share.granted': byWho(
    (w) => `Compartiste ${w}`,
    (w, a) => `${a} compartió ${w}`,
  ),
  'share.level_changed': byWho(
    (w) => `Cambiaste el nivel de acceso de ${w}`,
    (w, a) => `${a} cambió el nivel de acceso de ${w}`,
  ),
  'share.revoked': byWho(
    (w) => `Dejaste de compartir ${w}`,
    (w, a) => `${a} quitó un acceso compartido a ${w}`,
  ),
  /**
   * Enlace público (013c CA-16, CA-17): generar y revocar los hace el dueño; descargar y el bloqueo vienen del
   * visitante (`trigger: 'public_link'`) y se leen con `staff`, cuyo sujeto es «Alguien con el enlace».
   */
  'public_link.created': {
    self: (w) => `Generaste un enlace público de ${w}`,
    staff: (w, a) => `${a} generó un enlace público de ${w}`,
  },
  'public_link.revoked': {
    self: (w) => `Revocaste un enlace público de ${w}`,
    staff: (w, a) => `${a} revocó un enlace público de ${w}`,
  },
  'public_link.downloaded': { staff: (w, a) => `${a} descargó ${w}` },
  'public_link.locked': {
    staff: (w) => `Se bloquearon los intentos de contraseña del enlace de ${w}`,
  },
} as const satisfies Readonly<Record<string, ActionText>>;

/**
 * Acciones internas sobre tu cuenta o el catálogo (011, 011b CA-9, RN-4): el evento trae `extraBytes` y `until`, o
 * `expiresAt`, pero la frase solo dice la acción y el rol; las cifras vigentes se ven en el resumen de espacio.
 */
const ACCOUNT_TEXTS = {
  'account.suspended': staffOnly((_w, a) => `${a} suspendió tu cuenta`),
  'account.reactivated': staffOnly((_w, a) => `${a} reactivó tu cuenta`),
  'account.internal_created': staffOnly((_w, a) => `${a} creó tu cuenta`),
  'account.bootstrap_admin': sameText('Se creó la cuenta de administración inicial'),
  'client.files_viewed': staffOnly(
    (_w, a) => `${a} consultó la lista de tus archivos (sin abrir su contenido)`,
  ),
  'account.quota_adjusted': staffOnly((_w, a) => `${a} ajustó la cuota de tu cuenta`),
  'account.validity_adjusted': staffOnly((_w, a) => `${a} extendió la vigencia de tu plan`),
  'plan.created': staffOnly((_w, a) => `${a} creó un plan`),
  'plan.deactivated': staffOnly((_w, a) => `${a} desactivó un plan`),
} as const satisfies Readonly<Record<string, ActionText>>;

/** Suscripción (010 CA-6, CA-22): sin plan ni tarjeta en el evento; la pasada automática actúa como el dueño. */
const SUBSCRIPTION_TEXTS = {
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
} as const satisfies Readonly<Record<string, ActionText>>;

/** Un texto por cada acción del catálogo de `contracts`: si la API suma una sin texto aquí, la web no compila. */
const ACTION_TEXTS: Readonly<Record<AuditActionName, ActionText>> = {
  ...FILE_TEXTS,
  ...PROCESSING_TEXTS,
  ...SHARING_TEXTS,
  ...ACCOUNT_TEXTS,
  ...SUBSCRIPTION_TEXTS,
};

/** Si la web tiene un texto propio para `action`; si no, se muestra `UNKNOWN_ACTIVITY_LABEL`. */
export function hasActivityLabel(action: string): action is AuditActionName {
  return Object.hasOwn(ACTION_TEXTS, action);
}

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

function isPublicLinkVisit(event: AuditEventResponse): boolean {
  return event.trigger === 'public_link';
}

/**
 * «Tú», «Nimbo (automático)», «Alguien con el enlace» o el rol del personal, nunca nombre ni correo (D-2). El
 * `trigger` se mira antes que el origen: la purga programada y la visita a un enlace llegan con origen `self`.
 */
export function activityActorLabel(event: AuditEventResponse): string {
  if (isScheduled(event)) return SCHEDULED_LABEL;
  if (isPublicLinkVisit(event)) return PUBLIC_LINK_LABEL;
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
  if (!hasActivityLabel(event.action)) return UNKNOWN_ACTIVITY_LABEL;
  const text = ACTION_TEXTS[event.action];
  const what = quantityOf(event) ?? SOME_ITEM;
  if (isScheduled(event) && text.scheduled !== undefined) {
    return text.scheduled(what, isPlural(event));
  }
  const ownAction = event.origin === 'self' && !isPublicLinkVisit(event);
  if (ownAction && text.self !== undefined) return text.self(what);
  return text.staff(what, activityActorLabel(event));
}

/** Tipo y cantidad del recurso, con su tamaño si lo trae: «1 archivo, 12 MB» (D-3). */
export function activityResourceLabel(event: AuditEventResponse): string {
  const quantity = quantityOf(event) ?? ACCOUNT_RESOURCE;
  return event.sizeBytes === null ? quantity : `${quantity}, ${formatBytes(event.sizeBytes)}`;
}
