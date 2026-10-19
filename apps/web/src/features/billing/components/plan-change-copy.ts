import { formatGtq, type Plan, type SubscriptionView } from '@nimbo/contracts';

import { longDayLabel } from '../../../lib/format-date';
import { formatPlanBytes } from '../../../lib/format-plan';

import type { Card } from './subscription-copy';

/** Lo que el cliente pierde al bajar (spec 010 CA-21): título y una línea por límite que baja. */
export interface DowngradeWarning {
  readonly title: string;
  readonly items: readonly string[];
}

const versionsItem = (current: Plan, target: Plan): string | null =>
  target.retainedVersions >= current.retainedVersions
    ? null
    : `Versiones: ${target.name} guarda ${String(target.retainedVersions)} por archivo y ${current.name} guarda ${String(current.retainedVersions)}. Cuando subas la siguiente versión de un archivo, se eliminarán sus versiones anteriores que pasen de ${String(target.retainedVersions)}. La versión actual nunca se borra.`;

const spaceItem = (target: Plan, usedBytes: number | null): string | null =>
  usedBytes === null || usedBytes <= Number(target.quotaBytes)
    ? null
    : `Espacio: ${target.name} incluye ${formatPlanBytes(target.quotaBytes)} y usas ${formatPlanBytes(String(usedBytes))}. No perderás archivos ni carpetas, pero no podrás subir hasta liberar espacio.`;

const editingItem = (current: Plan, target: Plan): string | null =>
  target.maxEditors === 0 && current.maxEditors > 0
    ? `Edición: en ${target.name} los .docx se abren solo en lectura.`
    : null;

/** CA-21: el aviso de la confirmación, o `null` si el plan nuevo no baja nada que se use. */
export const downgradeWarning = (
  current: Plan,
  target: Plan,
  usedBytes: number | null,
): DowngradeWarning | null => {
  const items = [
    versionsItem(current, target),
    spaceItem(target, usedBytes),
    editingItem(current, target),
  ].filter((item): item is string => item !== null);
  if (items.length === 0) return null;
  const onlyVersions = items.length === 1 && versionsItem(current, target) !== null;
  return {
    title: onlyVersions
      ? `${target.name} guarda menos versiones que tu plan actual.`
      : `${target.name} incluye menos que tu plan actual.`,
    items,
  };
};

/** Una fila del resumen de la confirmación. */
export interface SummaryRow {
  readonly label: string;
  readonly value: string;
}

/** Qué dice la confirmación: título, descripción, resumen y el botón (mockups `planes--confirmar-*`). */
export interface ChangeCopy {
  readonly title: string;
  readonly description: string;
  readonly rows: readonly SummaryRow[];
  readonly confirmLabel: string;
}

const chargeValue = (target: Plan, card: Card | null): string =>
  target.priceCents === 0
    ? 'Ninguno'
    : `${formatGtq(target.priceCents)}${card === null ? '' : ` con ${card.brand.toUpperCase()} ···· ${card.last4}`}`;

/** CA-27: en solo lectura, bajar a Personal se aplica ya y sin cobro. */
const immediateCopy = (): ChangeCopy => ({
  title: '¿Cambiar a Personal ahora?',
  description:
    'Tu suscripción venció. El cambio se aplica de inmediato, sin cobro, y tu cuenta deja de estar en solo lectura.',
  rows: [
    { label: 'Plan nuevo', value: 'Personal · desde hoy' },
    { label: 'Cobro', value: 'Ninguno' },
  ],
  confirmLabel: 'Cambiar a Personal ahora',
});

const scheduledDescription = (subscription: SubscriptionView, target: Plan): string => {
  if (subscription.status === 'readOnly') {
    return `Tu suscripción venció. El cambio se aplica cuando renueves tu plan, con el precio completo de ${target.name}.`;
  }
  if (target.priceCents === 0) {
    return `Hasta esa fecha conservas ${subscription.plan.name}. Ese día pasas a Personal, que es gratis y no vence. Mientras el cambio esté programado no podrás renovar por adelantado.`;
  }
  return `Hasta esa fecha conservas ${subscription.plan.name} y sus límites. Hoy no se cobra nada.`;
};

/** CA-16: el cambio se programa para el `vence_en` (en solo lectura, para cuando renueve). */
export const changeCopy = (
  subscription: SubscriptionView,
  target: Plan,
  card: Card | null,
): ChangeCopy => {
  const readOnly = subscription.status === 'readOnly';
  if (readOnly && target.priceCents === 0) return immediateCopy();
  const when = subscription.expiresAt === null ? '' : longDayLabel(subscription.expiresAt);
  const chargeLabel = target.priceCents === 0 ? 'Cobro' : 'Cobro al renovar';
  return {
    title: readOnly ? `¿Cambiar a ${target.name}?` : `¿Cambiar a ${target.name} el ${when}?`,
    description: scheduledDescription(subscription, target),
    rows: [
      ...(readOnly
        ? []
        : [{ label: 'Plan actual', value: `${subscription.plan.name} · hasta el ${when}` }]),
      {
        label: 'Plan nuevo',
        value: readOnly ? `${target.name} · al renovar` : `${target.name} · desde el ${when}`,
      },
      { label: chargeLabel, value: chargeValue(target, card) },
    ],
    confirmLabel: `Programar cambio a ${target.name}`,
  };
};

/** Error del catálogo en dos partes, como el mockup `planes--cambio-error`: la primera frase en negrita. */
export const splitMessage = (
  message: string,
): { readonly title: string; readonly body: string } => {
  const end = message.indexOf('. ');
  return end === -1
    ? { title: message, body: '' }
    : { title: message.slice(0, end + 1), body: message.slice(end + 2) };
};
