import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { Payment, PaymentDraft } from '../domain/entities/payment.entity';
import { BillingInvalidInputError } from '../domain/errors/billing-invalid-input.error';
import type { PaymentCard } from '../domain/payment-card';
import { Money } from '../domain/value-objects/money';

import { PaymentService } from './payment.service';
import type { IPaymentGateway } from './ports/i-payment-gateway.port';
import type { IPaymentRepository } from './ports/i-payment-repository.port';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-14T12:00:00.000Z');
const PLAN_ID = '10000000-0000-4000-8000-000000000003';
const VALID: PaymentCard = { number: '4242424242424242', expMonth: 12, expYear: 2030 };

const setup = (status: 'aprobada' | 'rechazada') => {
  const gateway: IPaymentGateway = {
    authorize: jest.fn(() => Promise.resolve({ status, brand: 'visa' })),
  };
  const recorded: PaymentDraft[] = [];
  const payments: IPaymentRepository = {
    record: jest.fn((_actor: Actor, draft: PaymentDraft): Promise<Payment> => {
      recorded.push(draft);
      return Promise.resolve({
        ...draft,
        id: 'pago-1',
        userId: ANA.id,
        reference: 'SIM-2026-000001',
      });
    }),
  };
  const service = new PaymentService(gateway, payments, new FixedClock(NOW));
  return { service, gateway, payments, recorded };
};

const order = (card: PaymentCard = VALID) => ({
  planId: PLAN_ID,
  amount: Money.ofCents(11_000),
  card,
});

describe('PaymentService.charge (spec 009 RN-3, RN-9; plan §2, B-3)', () => {
  it('RN-3: un pago aprobado se registra con marca, últimos 4 y la hora del reloj', async () => {
    const { service, recorded } = setup('aprobada');

    const result = await service.charge(ANA, order());

    expect(recorded).toEqual([
      {
        planId: PLAN_ID,
        amount: Money.ofCents(11_000),
        status: 'aprobada',
        cardBrand: 'visa',
        cardLast4: '4242',
        createdAt: NOW,
      },
    ]);
    expect(result).toMatchObject({
      id: 'pago-1',
      status: 'aprobada',
      reference: 'SIM-2026-000001',
    });
  });

  it('RN-3, B-3: un rechazo se registra y se devuelve; no lanza', async () => {
    const { service, recorded } = setup('rechazada');

    const result = await service.charge(ANA, order());

    expect(result.status).toBe('rechazada');
    expect(recorded.map((draft) => draft.status)).toEqual(['rechazada']);
  });

  it('RN-9: una tarjeta vencida es 422 con el campo, sin consultar la pasarela ni registrar', async () => {
    const { service, gateway, payments } = setup('aprobada');

    const expired = service.charge(ANA, order({ ...VALID, expMonth: 9, expYear: 2026 }));

    await expect(expired).rejects.toBeInstanceOf(BillingInvalidInputError);
    await expect(expired).rejects.toMatchObject({
      status: 422,
      fields: [{ field: 'card.expMonth', reason: 'CARD_EXPIRED' }],
    });
    expect(gateway.authorize).not.toHaveBeenCalled();
    expect(payments.record).not.toHaveBeenCalled();
  });
});
