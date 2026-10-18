import { expiredMessage, planDiscardedMessage, reminderMessage } from './renewal-messages';

const NOTICE = {
  to: 'ana@ejemplo.com',
  userId: '11111111-1111-4111-8111-111111111111',
  expiresAt: new Date('2026-11-13T18:00:00.000Z'),
};
const KEY = `${NOTICE.userId}.${String(NOTICE.expiresAt.getTime())}`;

describe('correos de la renovación (spec 010 CA-2, CA-5, CA-7, CA-29)', () => {
  it('CA-5: con la tarjeta que se cobrará, el plan y el monto, y una clave por periodo', () => {
    const message = reminderMessage(NOTICE, {
      planName: 'Equipo',
      amountCents: 11_000,
      card: { brand: 'visa', last4: '4242' },
    });

    expect(message).toMatchObject({
      to: 'ana@ejemplo.com',
      recipientId: NOTICE.userId,
      tag: 'billing.renewal-reminder',
      idempotencyKey: `billing.renewal-reminder.${KEY}`,
    });
    expect(message.text).toContain('13 de noviembre de 2026');
    expect(message.text).toContain('Se renovará por Q110.00 (plan Equipo) con VISA ···· 4242.');
    expect(message.idempotencyKey).not.toContain(':');
  });

  it('CA-5: sin renovación automática avisa que quedará en solo lectura', () => {
    const message = reminderMessage(NOTICE, {
      planName: 'Equipo',
      amountCents: 11_000,
      card: null,
    });

    expect(message.text).toContain('Si no renuevas, tu cuenta quedará en solo lectura.');
  });

  it('CA-21: la bajada a Personal no cobra', () => {
    const message = reminderMessage(NOTICE, { planName: 'Personal', amountCents: 0, card: null });

    expect(message.text).toContain('Ese día pasas a Personal, sin cobro.');
  });

  it('CA-2, CA-7: el de vencida dice que venció, qué se puede hacer y cómo renovar', () => {
    const message = expiredMessage(NOTICE, 'Equipo');

    expect(message).toMatchObject({
      tag: 'billing.expired',
      idempotencyKey: `billing.expired.${KEY}`,
    });
    expect(message.text).toContain('Puedes ver y descargar tus archivos, pero no subir ni editar.');
    expect(message.text).toContain('Renueva desde Plan y facturación');
  });

  it('CA-29: el cambio descartado nombra el plan que ya no existe y hasta cuándo se renovó', () => {
    const message = planDiscardedMessage(NOTICE, {
      discarded: 'Pro',
      renewed: 'Equipo',
      renewedUntil: new Date('2026-12-13T18:00:00.000Z'),
    });

    expect(message.tag).toBe('billing.plan-discarded');
    expect(message.text).toContain('El plan Pro ya no está disponible');
    expect(message.text).toContain('hasta el 13 de diciembre de 2026');
  });

  it('el HTML escapa lo que viene de datos', () => {
    const message = expiredMessage(NOTICE, '<b>Equipo</b>');

    expect(message.html).toContain('&lt;b&gt;Equipo&lt;/b&gt;');
  });
});
