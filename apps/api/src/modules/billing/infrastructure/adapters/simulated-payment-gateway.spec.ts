import { TEST_CARDS } from '@nimbo/contracts';

import type { IPaymentGateway } from '../../application/ports/i-payment-gateway.port';
import { Money } from '../../domain/value-objects/money';

import { SimulatedPaymentGateway } from './simulated-payment-gateway';

const AMOUNT = Money.ofCents(11_000);
const card = (number: string) => ({ number, expMonth: 12, expYear: 2030 });

describe('SimulatedPaymentGateway (spec 009 RN-3)', () => {
  const gateway: IPaymentGateway = new SimulatedPaymentGateway();

  it('RN-3: 4242 4242 4242 4242 aprueba siempre', async () => {
    await expect(gateway.authorize(card(TEST_CARDS.approved), AMOUNT)).resolves.toEqual({
      status: 'aprobada',
      brand: 'visa',
    });
  });

  it('RN-3: 4000 0000 0000 0002 rechaza siempre', async () => {
    await expect(gateway.authorize(card(TEST_CARDS.rejected), AMOUNT)).resolves.toEqual({
      status: 'rechazada',
      brand: 'visa',
    });
  });
});
