import type { Device } from '../../domain/device.entity';
import type { IDeviceRepository } from '../ports/i-device-repository.port';

/** Doble en memoria de `IDeviceRepository`: único por `(usuario_id, huella_hash)`, como `ON CONFLICT` (DT-19). */
export class InMemoryDeviceRepository implements IDeviceRepository {
  private readonly devices = new Map<string, Device>();

  all(): readonly Device[] {
    return [...this.devices.values()];
  }

  upsertSeen(device: Device): Promise<{ readonly deviceId: string; readonly isNew: boolean }> {
    const key = `${device.userId}|${device.secretHash}`;
    const existing = this.devices.get(key);
    if (existing === undefined) {
      this.devices.set(key, device);
      return Promise.resolve({ deviceId: device.id, isNew: true });
    }
    this.devices.set(
      key,
      existing.seen({
        userAgent: device.agenteUsuario,
        ip: device.ultimaIp,
        now: device.ultimoAcceso,
      }),
    );
    return Promise.resolve({ deviceId: existing.id, isNew: false });
  }
}
