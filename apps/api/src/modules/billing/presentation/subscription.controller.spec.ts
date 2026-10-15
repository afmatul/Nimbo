import { createActor, Role } from '../../../shared';
import type { SubscribeOutcome } from '../application/subscription-checkout';
import type { SubscriptionService } from '../application/subscription.service';
import { aPlan } from '../application/testing/plans';
import type { Invoice } from '../domain/entities/invoice.entity';
import type { Payment } from '../domain/entities/payment.entity';
import { PaymentRejectedError } from '../domain/errors/payment-rejected.error';
import { Subscription } from '../domain/subscription.entity';

import { SubscriptionController } from './subscription.controller';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const TEAM = aPlan({
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
});
const BODY = {
  planSlug: 'equipo',
  card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' },
  nit: 'CF',
};

const outcome = (status: Payment['status']): SubscribeOutcome => ({
  payment: { id: 'pago-1', status, reference: 'SIM-2026-000007' } as Payment,
  plan: TEAM,
  invoice: { id: 'factura-1', receiptEmail: 'ana@ejemplo.com' } as Invoice,
  subscription: Subscription.rehydrate({
    userId: ANA.id,
    planId: TEAM.id,
    planSlug: 'equipo',
    startedAt: new Date('2026-10-14T12:00:00.000Z'),
    expiresAt: new Date('2026-11-13T12:00:00.000Z'),
  }),
});

const setup = (status: Payment['status']) => {
  const subscribe = jest.fn().mockResolvedValue(outcome(status));
  const controller = new SubscriptionController({ subscribe } as unknown as SubscriptionService);
  return { controller, subscribe };
};

describe('SubscriptionController (spec 009 CA-3, CA-4)', () => {
  it('CA-3: responde la referencia, el plan, el vencimiento y el desglose de RN-2', async () => {
    const { controller } = setup('aprobada');

    await expect(controller.subscribe(ANA, BODY)).resolves.toEqual({
      reference: 'SIM-2026-000007',
      plan: { slug: 'equipo', name: 'Equipo' },
      expiresAt: '2026-11-13T12:00:00.000Z',
      amounts: { subtotalCents: 9821, vatCents: 1179, totalCents: 11_000 },
      receiptEmail: 'ana@ejemplo.com',
    });
  });

  it('RN-9: el CVC no pasa del controlador; el NIT sí, para la factura', async () => {
    const { controller, subscribe } = setup('aprobada');

    await controller.subscribe(ANA, BODY);

    expect(subscribe).toHaveBeenCalledWith(ANA, {
      planSlug: 'equipo',
      card: { number: '4242424242424242', expMonth: 12, expYear: 2030 },
      nit: 'CF',
    });
  });

  it('CA-4, B-3: un rechazo ya confirmado se traduce a `402 BILLING_PAYMENT_REJECTED`', async () => {
    const { controller } = setup('rechazada');

    await expect(controller.subscribe(ANA, BODY)).rejects.toBeInstanceOf(PaymentRejectedError);
  });
});
