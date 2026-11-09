import { createHash } from 'node:crypto';

import { limitNetworkOf, networkHashOf } from './limit-network';

describe('limitNetworkOf (plan 013 §5, RN-7)', () => {
  it('RN-7: una IPv4 cuenta sola (/32)', () => {
    expect(limitNetworkOf('203.0.113.7')).toBe('203.0.113.7/32');
    expect(limitNetworkOf('203.0.113.8')).not.toBe(limitNetworkOf('203.0.113.7'));
  });

  it('RN-7: una IPv4 mapeada en IPv6 es la misma red que la IPv4', () => {
    expect(limitNetworkOf('::ffff:203.0.113.7')).toBe('203.0.113.7/32');
    expect(limitNetworkOf('::FFFF:cb00:7107')).toBe('203.0.113.7/32');
  });

  it.each([
    ['2001:db8:85a3:12::1', '2001:db8:85a3:12::/64'],
    ['2001:0db8:85a3:0012:ffff:ffff:ffff:ffff', '2001:db8:85a3:12::/64'],
    ['2001:DB8:85A3:12:abcd::', '2001:db8:85a3:12::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::203.0.113.7', '64:ff9b:0:0::/64'],
  ])('RN-7: la IPv6 %s cuenta por su /64 (%s)', (ip, network) => {
    expect(limitNetworkOf(ip)).toBe(network);
  });

  it('RN-7: rotar dentro de un /64 no cambia la red; otro /64 sí', () => {
    const network = limitNetworkOf('2001:db8:85a3:12::1');

    expect(limitNetworkOf('2001:db8:85a3:12:9f3e:1c2d:aa01:7')).toBe(network);
    expect(limitNetworkOf('2001:db8:85a3:13::1')).not.toBe(network);
  });
});

describe('networkHashOf (plan 013 §5, RN-7, S-3)', () => {
  it('S-3: es el SHA-256 de la red, nunca la IP ni la red en claro', () => {
    const hash = networkHashOf('2001:db8:85a3:12::1');

    expect(hash).toBe(createHash('sha256').update('2001:db8:85a3:12::/64').digest('hex'));
    expect(hash).not.toContain('2001');
  });

  it('RN-7: dos IP del mismo /64 dan el mismo hash', () => {
    expect(networkHashOf('2001:db8:85a3:12:9f3e::7')).toBe(networkHashOf('2001:db8:85a3:12::1'));
  });

  it('RN-7: un valor que no es IP (vacío o texto) no lanza y cuenta como una red propia', () => {
    expect(networkHashOf('')).toBe(createHash('sha256').update('/32').digest('hex'));
    expect(networkHashOf('no-es-ip')).not.toBe(networkHashOf(''));
  });
});
