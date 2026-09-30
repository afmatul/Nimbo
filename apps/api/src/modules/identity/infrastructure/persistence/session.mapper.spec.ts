import { Session } from '../../domain/session.entity';

import { toSesionRow, toSessionDomain } from './session.mapper';

const OPENED_AT = new Date('2026-09-30T14:00:00.000Z');
const ROTATED_AT = new Date('2026-10-01T09:30:00.000Z');
const REVOKED_AT = new Date('2026-10-02T08:00:00.000Z');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const USER_ID = '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b';
const DEVICE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const aSession = (): Session =>
  Session.open({
    id: SESSION_ID,
    userId: USER_ID,
    deviceId: DEVICE_ID,
    secretHash: 'a'.repeat(64),
    now: OPENED_AT,
    maxLifetime: THIRTY_DAYS_MS,
  });

describe('session.mapper', () => {
  it('CA-24: `toSesionRow` escribe las columnas de `sesion` con los hashes, nunca un secreto', () => {
    expect(toSesionRow(aSession())).toEqual({
      id: SESSION_ID,
      usuarioId: USER_ID,
      dispositivoId: DEVICE_ID,
      refreshHash: 'a'.repeat(64),
      refreshAnteriorHash: null,
      rotadoEn: null,
      creadaEn: OPENED_AT,
      ultimoUso: OPENED_AT,
      expiraEn: new Date(OPENED_AT.getTime() + THIRTY_DAYS_MS),
      revocadaEn: null,
    });
  });

  it('CA-24: una sesión rotada y revocada va y vuelve de la fila con todos sus campos', () => {
    const session = aSession().rotate('b'.repeat(64), ROTATED_AT).revoke(REVOKED_AT);

    const back = toSessionDomain(toSesionRow(session));

    expect(back).toEqual(session);
    expect(back).toBeInstanceOf(Session);
    expect(back.stateAt(REVOKED_AT, THIRTY_DAYS_MS)).toBe('revoked');
  });
});
