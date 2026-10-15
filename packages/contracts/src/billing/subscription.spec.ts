import { TEST_CARDS } from './subscription';

describe('tarjetas de prueba (spec 009 RN-3)', () => {
  it('RN-3: 4242… aprueba y 4000…0002 rechaza, sin espacios', () => {
    expect(TEST_CARDS).toEqual({ approved: '4242424242424242', rejected: '4000000000000002' });
  });
});
