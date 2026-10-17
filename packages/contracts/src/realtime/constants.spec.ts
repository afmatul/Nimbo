import { REALTIME_ERROR_CODES, REALTIME_EVENTS, REALTIME_PATH } from '../index';

describe('contrato del canal en vivo (spec 015)', () => {
  it('CA-4: la ruta del canal es fija', () => {
    expect(REALTIME_PATH).toBe('/socket.io');
  });

  it('CA-4, CA-7: los únicos eventos del canal son el aviso de sesión vencida y el intento de unirse a una sala', () => {
    expect(REALTIME_EVENTS).toEqual({
      SESSION_EXPIRED: 'realtime.session-expired',
      ROOM_JOIN: 'room.join',
    });
  });

  it('CA-14: el catálogo de códigos propios del canal es el exceso de intentos de conexión', () => {
    expect(REALTIME_ERROR_CODES).toEqual({ TOO_MANY_REQUESTS: 'REALTIME_TOO_MANY_REQUESTS' });
  });
});
