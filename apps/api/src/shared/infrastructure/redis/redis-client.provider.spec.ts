import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import { ENV } from '../config/env.module';

import { REDIS_CLIENT, redisClientProviders } from './redis-client.provider';

/** URL con credencial: nada de ella puede aparecer en una bitácora (prohibición dura). */
const REDIS_URL = 'redis://usuario:clave-secreta@127.0.0.1:1';

const compile = async (logger: { warn: jest.Mock }) =>
  Test.createTestingModule({
    providers: [
      { provide: ENV, useValue: { REDIS_URL } },
      { provide: PinoLogger, useValue: logger },
      ...redisClientProviders,
    ],
  }).compile();

describe('REDIS_CLIENT (001 CA-15)', () => {
  it('CA-15: registra un oyente de `error` que no escribe la URL ni el mensaje del error', async () => {
    const logger = { warn: jest.fn() };
    const moduleRef = await compile(logger);
    const client = moduleRef.get<Redis>(REDIS_CLIENT);

    expect(client.listenerCount('error')).toBeGreaterThan(0);
    const error = Object.assign(new Error(`connect ECONNREFUSED ${REDIS_URL}`), {
      code: 'ECONNREFUSED',
    });
    client.emit('error', error);

    expect(logger.warn).toHaveBeenCalledWith({ event: 'redis.error', errorCode: 'ECONNREFUSED' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('clave-secreta');
    await moduleRef.close();
  });

  it('CA-15: no conecta al construirse (conexión perezosa)', async () => {
    const moduleRef = await compile({ warn: jest.fn() });

    expect(moduleRef.get<Redis>(REDIS_CLIENT).status).toBe('wait');
    await moduleRef.close();
  });

  it('CA-15: cierra la conexión en `onApplicationShutdown`', async () => {
    const moduleRef = await compile({ warn: jest.fn() });
    const client = moduleRef.get<Redis>(REDIS_CLIENT);
    const disconnect = jest.spyOn(client, 'disconnect');

    await moduleRef.close();

    expect(disconnect).toHaveBeenCalled();
  });
});
