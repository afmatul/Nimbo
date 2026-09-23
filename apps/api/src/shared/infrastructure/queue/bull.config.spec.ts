import { buildBullConnection } from './bull.config';

describe('buildBullConnection', () => {
  it('CA-14: traduce `REDIS_URL` a opciones de ioredis sin reintentos por comando (BullMQ lo exige)', () => {
    expect(buildBullConnection('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('CA-14: conserva usuario, contraseña y base cuando la URL los trae', () => {
    expect(buildBullConnection('redis://usuario:clave@redis.interno:6380/2')).toEqual({
      host: 'redis.interno',
      port: 6380,
      username: 'usuario',
      password: 'clave',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });
});
