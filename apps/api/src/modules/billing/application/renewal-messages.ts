import { formatGtq } from '@nimbo/contracts';

import type { MailMessage } from '../../notifications';

import { formatBillingDate, formatBillingLastDay } from './billing-date';
import { billingMail } from './mail-message';

const REMINDER_TAG = 'billing.renewal-reminder';
const EXPIRED_TAG = 'billing.expired';
const DISCARDED_TAG = 'billing.plan-discarded';
const RENEW_HINT = 'Renueva desde Plan y facturación en Nimbo.';

/** A quién y de qué periodo: el correo del dueño, su id y el `vence_en` que nombra el aviso (parte de la clave). */
export interface RenewalNotice {
  readonly to: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

/** El siguiente ciclo (RN-4): su plan y monto y, si se cobrará solo, la tarjeta para mostrar (marca y últimos 4). */
export interface UpcomingCharge {
  readonly planName: string;
  readonly amountCents: number;
  readonly card: { readonly brand: string; readonly last4: string } | null;
}

const keyOf = ({ userId, expiresAt }: RenewalNotice): string =>
  `${userId}.${String(expiresAt.getTime())}`;

/** Asunto, líneas y etiqueta de un correo de la renovación. */
interface RenewalMail {
  readonly subject: string;
  readonly lines: readonly string[];
  readonly tag: string;
}

const mail = (notice: RenewalNotice, { subject, lines, tag }: RenewalMail) =>
  billingMail({
    to: notice.to,
    recipientId: notice.userId,
    subject,
    lines,
    tag,
    key: keyOf(notice),
  });

/** Solo se cobra si el ciclo cuesta: bajar a Personal no cobra (CA-21). */
const chargeLines = ({ planName, amountCents, card }: UpcomingCharge): readonly string[] => {
  if (amountCents === 0) return ['Ese día pasas a Personal, sin cobro.'];
  const amount = `${formatGtq(amountCents)} (plan ${planName})`;
  if (card === null) {
    return [
      `No se renovará solo. El siguiente periodo cuesta ${amount}.`,
      `Si no renuevas, tu cuenta quedará en solo lectura. ${RENEW_HINT}`,
    ];
  }
  return [`Se renovará por ${amount} con ${card.brand.toUpperCase()} ···· ${card.last4}.`];
};

/** CA-5 (RN-8): un aviso por periodo, N días antes de `vence_en`. */
export const reminderMessage = (notice: RenewalNotice, charge: UpcomingCharge): MailMessage =>
  mail(notice, {
    subject: 'Tu plan de Nimbo vence pronto',
    lines: [`Tu plan vence el ${formatBillingLastDay(notice.expiresAt)}.`, ...chargeLines(charge)],
    tag: REMINDER_TAG,
  });

/** CA-2 y CA-7: venció sin pago; la cuenta queda en solo lectura con su plan (spec §6). */
export const expiredMessage = (notice: RenewalNotice, planName: string): MailMessage =>
  mail(notice, {
    subject: 'Tu suscripción de Nimbo venció',
    lines: [
      `Tu plan ${planName} venció el ${formatBillingDate(notice.expiresAt)}.`,
      'Tu suscripción venció. Puedes ver y descargar tus archivos, pero no subir ni editar.',
      RENEW_HINT,
    ],
    tag: EXPIRED_TAG,
  });

/** CA-29: el plan programado se desactivó; se renovó con el actual hasta `renewedUntil`. */
export const planDiscardedMessage = (
  notice: RenewalNotice,
  plans: { readonly discarded: string; readonly renewed: string; readonly renewedUntil: Date },
): MailMessage =>
  mail(notice, {
    subject: 'Tu cambio de plan no se aplicó',
    lines: [
      `El plan ${plans.discarded} ya no está disponible, así que no cambiamos tu plan.`,
      `Renovamos tu plan ${plans.renewed} hasta el ${formatBillingLastDay(plans.renewedUntil)}.`,
    ],
    tag: DISCARDED_TAG,
  });
