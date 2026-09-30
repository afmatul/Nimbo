import { Device } from '../../domain/device.entity';

import { toDeviceDomain, toDispositivoRow } from './device.mapper';

const SEEN_AT = new Date('2026-09-30T14:00:00.000Z');
const DEVICE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const USER_ID = '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b';
const SECRET_HASH = 'c'.repeat(64);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const aDevice = (ip: string | null = '203.0.113.7'): Device =>
  Device.register({
    id: DEVICE_ID,
    userId: USER_ID,
    secretHash: SECRET_HASH,
    userAgent: USER_AGENT,
    ip,
    now: SEEN_AT,
  });

describe('device.mapper', () => {
  it('CA-17: `toDispositivoRow` escribe el hash de la huella, la IP como texto y la fecha', () => {
    expect(toDispositivoRow(aDevice())).toEqual({
      id: DEVICE_ID,
      usuarioId: USER_ID,
      huellaHash: SECRET_HASH,
      agenteUsuario: USER_AGENT,
      ultimaIp: '203.0.113.7',
      ultimoAcceso: SEEN_AT,
    });
  });

  it.each([['203.0.113.7'], ['2001:db8::1'], [null]])(
    'CA-17: un dispositivo con IP %s va y vuelve de la fila con todos sus campos',
    (ip) => {
      const device = aDevice(ip);

      const back = toDeviceDomain(toDispositivoRow(device));

      expect(back).toEqual(device);
      expect(back).toBeInstanceOf(Device);
    },
  );

  it('CA-24: de la fila al dominio solo viaja el hash de la huella', () => {
    const back = toDeviceDomain(toDispositivoRow(aDevice()));

    expect(Object.keys(back).sort()).toEqual(
      ['agenteUsuario', 'id', 'secretHash', 'ultimaIp', 'ultimoAcceso', 'userId'].sort(),
    );
    expect(back.secretHash).toBe(SECRET_HASH);
  });
});
