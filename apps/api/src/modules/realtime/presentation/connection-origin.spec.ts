import { connectionOrigin } from './connection-origin';

const DIRECT_ADDRESS = '172.18.0.5';

describe('connectionOrigin (plan §2)', () => {
  it('CA-14: detrás de Traefik usa el último valor de `x-forwarded-for` (un salto)', () => {
    const origin = connectionOrigin({
      headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' },
      address: DIRECT_ADDRESS,
    });

    expect(origin).toBe('203.0.113.7');
  });

  it('CA-14: con la cabecera repetida toma el último valor de la última', () => {
    const origin = connectionOrigin({
      headers: { 'x-forwarded-for': ['10.0.0.1', '198.51.100.2 , 203.0.113.9 '] },
      address: DIRECT_ADDRESS,
    });

    expect(origin).toBe('203.0.113.9');
  });

  it.each([
    ['sin cabecera', {}],
    ['con la cabecera vacía', { 'x-forwarded-for': ' ' }],
  ])('CA-14: %s usa la dirección de la conexión', (_, headers) => {
    expect(connectionOrigin({ headers, address: DIRECT_ADDRESS })).toBe(DIRECT_ADDRESS);
  });
});
