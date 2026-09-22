import type { SharedEnvBase } from '../config/env.schema';

import { RedisHealthIndicator } from './redis.health-indicator';

/** Puerto 1: rechaza la conexión de inmediato. La credencial es sintética. */
const UNREACHABLE_REDIS_URL = 'redis://usuario:secreto@127.0.0.1:1';

const buildEnv = (): SharedEnvBase => ({ REDIS_URL: UNREACHABLE_REDIS_URL }) as SharedEnvBase;

describe('RedisHealthIndicator', () => {
  it('CA-21: se llama `redis`', () => {
    expect(new RedisHealthIndicator(buildEnv()).name).toBe('redis');
  });

  it('CA-21 (RN-2): con Redis inalcanzable responde `down` sin volcar la URL por `console.error`', async () => {
    // ioredis no lanza el evento `error` sin oyentes: hace `console.error(..., error.stack)`,
    // que esquiva Pino y dejaría `REDIS_URL` —con su credencial— en la salida estándar.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(new RedisHealthIndicator(buildEnv()).check()).resolves.toBe('down');
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
