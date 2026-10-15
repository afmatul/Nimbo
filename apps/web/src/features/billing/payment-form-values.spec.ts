import { TEST_CARDS } from '@nimbo/contracts';

import { formFieldOf, toSubscribeRequest } from './payment-form-values';

const VALUES = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', nit: 'CF' };

describe('valores del formulario de pago (spec 009 RN-9)', () => {
  it('RN-9: quita los espacios del número y separa el vencimiento MM/AA', () => {
    expect(toSubscribeRequest('equipo', VALUES)).toEqual({
      ok: true,
      request: {
        planSlug: 'equipo',
        card: { number: TEST_CARDS.approved, expMonth: 12, expYear: 2030, cvc: '123' },
        nit: 'CF',
      },
    });
  });

  it('RN-9: un vencimiento que no es MM/AA es un error del campo, en español', () => {
    expect(toSubscribeRequest('equipo', { ...VALUES, expiry: '1230' })).toEqual({
      ok: false,
      issues: [{ field: 'expiry', message: 'Escribe el vencimiento como MM/AA.' }],
    });
  });

  it('CA-5: una tarjeta que no es de prueba y un NIT mal formado se marcan en su campo', () => {
    const result = toSubscribeRequest('equipo', {
      ...VALUES,
      number: '5555 5555 5555 4444',
      nit: '12-3',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((issue) => issue.field)).toEqual(['number', 'nit']);
  });

  it.each([
    ['card.number', 'number'],
    ['card.expMonth', 'expiry'],
    ['card.expYear', 'expiry'],
    ['card.cvc', 'cvc'],
    ['nit', 'nit'],
    ['planSlug', undefined],
  ])('CA-5: el campo %s de la API corresponde a %s del formulario', (apiField, formField) => {
    expect(formFieldOf(apiField)).toBe(formField);
  });
});
