import { renewRequestSchema, subscribeRequestSchema, TEST_CARDS } from './subscription';

const VALID = {
  planSlug: 'equipo',
  card: { number: TEST_CARDS.approved, expMonth: 12, expYear: 2030, cvc: '123' },
  nit: 'CF',
};

const reasonsOf = (input: unknown): { field: string; code: string }[] => {
  const result = subscribeRequestSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code }));
};

describe('tarjetas de prueba (spec 009 RN-3; 010 RN-2, B-2)', () => {
  it('RN-3 y RN-2: 4242… aprueba, 4000…0002 rechaza y 4000…0341 solo falla en el cobro recurrente', () => {
    expect(TEST_CARDS).toEqual({
      approved: '4242424242424242',
      rejected: '4000000000000002',
      recurringDeclined: '4000000000000341',
    });
  });
});

describe('subscribeRequestSchema (spec 009 RN-9, CA-5)', () => {
  it('RN-9: acepta las tres tarjetas de prueba y un NIT `CF` o de 5 a 12 dígitos', () => {
    for (const number of Object.values(TEST_CARDS)) {
      for (const nit of ['CF', '12345', '123456789012']) {
        expect(
          subscribeRequestSchema.safeParse({ ...VALID, nit, card: { ...VALID.card, number } })
            .success,
        ).toBe(true);
      }
    }
  });

  it.each([
    [
      'número con espacios',
      { card: { ...VALID.card, number: '4242 4242 4242 4242' } },
      'card.number',
    ],
    ['número de 15 dígitos', { card: { ...VALID.card, number: '424242424242424' } }, 'card.number'],
    [
      'tarjeta que no es de prueba',
      { card: { ...VALID.card, number: '5555555555554444' } },
      'card.number',
    ],
    ['mes 13', { card: { ...VALID.card, expMonth: 13 } }, 'card.expMonth'],
    ['CVC de 4 dígitos', { card: { ...VALID.card, cvc: '1234' } }, 'card.cvc'],
    ['NIT de 4 dígitos', { nit: '1234' }, 'nit'],
    ['NIT con letras', { nit: '12345-K' }, 'nit'],
  ])('CA-5: %s es inválido en %s', (_case, patch, field) => {
    expect(reasonsOf({ ...VALID, ...patch }).map((issue) => issue.field)).toContain(field);
  });

  it('CA-5: una tarjeta que no es de prueba lleva el motivo `CARD_NOT_ACCEPTED`', () => {
    const result = subscribeRequestSchema.safeParse({
      ...VALID,
      card: { ...VALID.card, number: '5555555555554444' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ params: { reason: 'CARD_NOT_ACCEPTED' } });
  });

  it('CA-5: el esquema es estricto (sin campos de más, también dentro de `card`)', () => {
    expect(reasonsOf({ ...VALID, extra: 1 })).toEqual([{ field: '', code: 'unrecognized_keys' }]);
    expect(reasonsOf({ ...VALID, card: { ...VALID.card, holder: 'Ana' } })).toEqual([
      { field: 'card', code: 'unrecognized_keys' },
    ]);
  });
});

describe('renewRequestSchema (spec 010 CA-8, CA-26)', () => {
  const RENEW = {
    card: VALID.card,
    nit: 'CF',
    expectedExpiresAt: '2026-11-13T12:00:00.000Z',
  };

  it('CA-8: acepta la tarjeta, el NIT y el `vence_en` que vio el cliente', () => {
    expect(renewRequestSchema.safeParse(RENEW).success).toBe(true);
  });

  it('CA-26: sin `expectedExpiresAt` o con un texto que no es fecha, se rechaza', () => {
    const { expectedExpiresAt: _omitted, ...withoutDate } = RENEW;
    expect(renewRequestSchema.safeParse(withoutDate).success).toBe(false);
    expect(renewRequestSchema.safeParse({ ...RENEW, expectedExpiresAt: 'mañana' }).success).toBe(
      false,
    );
  });

  it('RN-9: valida la tarjeta como al contratar y no admite campos extra', () => {
    expect(
      renewRequestSchema.safeParse({ ...RENEW, card: { ...RENEW.card, number: '1234' } }).success,
    ).toBe(false);
    expect(renewRequestSchema.safeParse({ ...RENEW, planSlug: 'pro' }).success).toBe(false);
  });
});
