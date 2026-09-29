import { Session } from '../../domain/session.entity';

import type { SesionOrmEntity } from './sesion.orm-entity';

export function toSessionDomain(row: SesionOrmEntity): Session {
  return Session.rehydrate({
    id: row.id,
    userId: row.usuarioId,
    deviceId: row.dispositivoId,
    refreshHash: row.refreshHash,
    refreshAnteriorHash: row.refreshAnteriorHash,
    rotadoEn: row.rotadoEn,
    creadaEn: row.creadaEn,
    ultimoUso: row.ultimoUso,
    expiraEn: row.expiraEn,
    revocadaEn: row.revocadaEn,
  });
}

export function toSesionRow(session: Session): SesionOrmEntity {
  return {
    id: session.id,
    usuarioId: session.userId,
    dispositivoId: session.deviceId,
    refreshHash: session.refreshHash,
    refreshAnteriorHash: session.refreshAnteriorHash,
    rotadoEn: session.rotadoEn,
    creadaEn: session.creadaEn,
    ultimoUso: session.ultimoUso,
    expiraEn: session.expiraEn,
    revocadaEn: session.revocadaEn,
  };
}
