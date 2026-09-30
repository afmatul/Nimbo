import { Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { IDeviceRepository } from '../../application/ports/i-device-repository.port';
import type { Device } from '../../domain/device.entity';

import { toDispositivoRow } from './device.mapper';

interface UpsertedRow {
  readonly id: string;
  readonly inserted: boolean;
}

/**
 * Alta o actualización en una sola sentencia (DT-19): dos inicios de sesión simultáneos desde un navegador nuevo dejan
 * una fila y un solo `isNew`. `xmax = 0` solo en la fila recién insertada; si ya existía, conserva su `id`.
 */
const UPSERT_SEEN_SQL = `
  INSERT INTO dispositivo (id, usuario_id, huella_hash, agente_usuario, ultima_ip, ultimo_acceso)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (usuario_id, huella_hash) DO UPDATE
    SET agente_usuario = EXCLUDED.agente_usuario,
        ultima_ip      = EXCLUDED.ultima_ip,
        ultimo_acceso  = EXCLUDED.ultimo_acceso
  RETURNING id, (xmax = 0) AS inserted`;

/** `IDeviceRepository` sobre `dispositivo` (plan §6.4), con el `EntityManager` de `TransactionContext`. */
@Injectable()
export class TypeOrmDeviceRepository implements IDeviceRepository {
  constructor(private readonly context: TransactionContext) {}

  async upsertSeen(
    device: Device,
  ): Promise<{ readonly deviceId: string; readonly isNew: boolean }> {
    const row = toDispositivoRow(device);
    const [upserted] = (await this.context
      .manager()
      .query(UPSERT_SEEN_SQL, [
        row.id,
        row.usuarioId,
        row.huellaHash,
        row.agenteUsuario,
        row.ultimaIp,
        row.ultimoAcceso,
      ])) as UpsertedRow[];
    if (upserted === undefined) {
      throw new Error('El alta del dispositivo no devolvió fila.');
    }
    return { deviceId: upserted.id, isNew: upserted.inserted };
  }
}
