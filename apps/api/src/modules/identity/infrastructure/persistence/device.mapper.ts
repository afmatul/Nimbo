import { Device } from '../../domain/device.entity';

import type { DispositivoOrmEntity } from './dispositivo.orm-entity';

/** `Device.register` solo recorta el agente de usuario, que en la fila ya cabe en 512: reconstruye sin cambios. */
export function toDeviceDomain(row: DispositivoOrmEntity): Device {
  return Device.register({
    id: row.id,
    userId: row.usuarioId,
    secretHash: row.huellaHash,
    userAgent: row.agenteUsuario,
    ip: row.ultimaIp,
    now: row.ultimoAcceso,
  });
}

export function toDispositivoRow(device: Device): DispositivoOrmEntity {
  return {
    id: device.id,
    usuarioId: device.userId,
    huellaHash: device.secretHash,
    agenteUsuario: device.agenteUsuario,
    ultimaIp: device.ultimaIp,
    ultimoAcceso: device.ultimoAcceso,
  };
}
