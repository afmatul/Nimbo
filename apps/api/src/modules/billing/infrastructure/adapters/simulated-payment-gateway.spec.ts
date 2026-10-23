import { TEST_CARDS } from '@nimbo/contracts';

import type { IPaymentGateway } from '../../application/ports/i-payment-gateway.port';
import { Money } from '../../domain/value-objects/money';

import { SimulatedPaymentGateway } from './simulated-payment-gateway';

const AMOUNT = Money.ofCents(11_000);
const card = (number: string) => ({ number, expMonth: 12, expYear: 2030 });
const REFERENCE = /^SIM-TOK-(ok|decline)-[0-9a-f-]{36}$/;

describe('SimulatedPaymentGateway (spec 009 RN-3; 010 RN-2, B-2, M-2)', () => {
  const gateway: IPaymentGateway = new SimulatedPaymentGateway();

  it('RN-3: 4242 4242 4242 4242 aprueba y emite una referencia sin el número', async () => {
    const result = await gateway.authorize(card(TEST_CARDS.approved), AMOUNT);

    expect(result).toMatchObject({ status: 'aprobada', brand: 'visa', last4: '4242' });
    expect(result.instrumentRef).toMatch(REFERENCE);
    expect(result.instrumentRef).not.toContain(TEST_CARDS.approved);
  });

  it('RN-3: 4000 0000 0000 0002 rechaza siempre, con últimos 4 y sin referencia', async () => {
    await expect(gateway.authorize(card(TEST_CARDS.rejected), AMOUNT)).resolves.toEqual({
      status: 'rechazada',
      brand: 'visa',
      last4: '0002',
      instrumentRef: null,
    });
  });

  it('B-2: 4000 0000 0000 0341 aprueba con el cliente presente', async () => {
    const result = await gateway.authorize(card(TEST_CARDS.recurringDeclined), AMOUNT);

    expect(result).toMatchObject({ status: 'aprobada', last4: '0341' });
    expect(result.instrumentRef).toMatch(REFERENCE);
  });

  it('RN-2: la referencia de 4242 aprueba sin el cliente y se devuelve la misma', async () => {
    const { instrumentRef } = await gateway.authorize(card(TEST_CARDS.approved), AMOUNT);

    await expect(gateway.authorize(instrumentRef as string, AMOUNT)).resolves.toEqual({
      status: 'aprobada',
      brand: 'visa',
      last4: '4242',
      instrumentRef,
    });
  });

  it('B-2: la referencia de 0341 se rechaza en el cobro recurrente', async () => {
    const { instrumentRef } = await gateway.authorize(card(TEST_CARDS.recurringDeclined), AMOUNT);

    await expect(gateway.authorize(instrumentRef as string, AMOUNT)).resolves.toEqual({
      status: 'rechazada',
      brand: 'visa',
      last4: '0341',
      instrumentRef: null,
    });
  });

  it('una referencia que no emitió el simulador es un error de programación', async () => {
    await expect(gateway.authorize('otra-pasarela', AMOUNT)).rejects.toThrow(/desconocida/);
  });
});
