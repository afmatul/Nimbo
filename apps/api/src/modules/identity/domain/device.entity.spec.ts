import { Device } from './device.entity';

describe('Device', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');

  const register = (userAgent: string): Device =>
    Device.register({
      id: '11111111-2222-4333-8444-555555555555',
      userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
      secretHash: 'a'.repeat(64),
      userAgent,
      ip: '203.0.113.10',
      now,
    });

  it('trunca el agente de usuario a 512 caracteres y acepta uno vacío', () => {
    expect(register('').agenteUsuario).toBe('');
    expect(register('x'.repeat(600)).agenteUsuario).toHaveLength(512);
    expect(register('Mozilla/5.0').agenteUsuario).toBe('Mozilla/5.0');
  });

  it('guarda solo el hash del secreto', () => {
    const device = register('Mozilla/5.0');
    expect(device.secretHash).toBe('a'.repeat(64));
    expect(JSON.stringify(device)).not.toContain('cookie-secreta');
  });

  it('actualiza el último acceso, el agente y la IP en una instancia nueva', () => {
    const original = register('Mozilla/5.0');
    const later = new Date(now.getTime() + 60_000);
    const seen = original.seen({ userAgent: 'y'.repeat(600), ip: '198.51.100.4', now: later });

    expect(seen).not.toBe(original);
    expect(seen.ultimoAcceso).toEqual(later);
    expect(seen.agenteUsuario).toHaveLength(512);
    expect(seen.ultimaIp).toBe('198.51.100.4');
    expect(seen.secretHash).toBe(original.secretHash);
    expect(original.agenteUsuario).toBe('Mozilla/5.0');
    expect(original.ultimaIp).toBe('203.0.113.10');
  });
});
