import type { ConnectionOptions } from 'bullmq';

const DEFAULT_REDIS_PORT = 6379;

/** Subconjunto de opciones de ioredis que BullMQ acepta; se tipa aquí para no depender de la versión de ioredis. */
interface BullRedisOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
}

/**
 * Conexión Redis compartida por BullMQ (api y worker) a partir de `REDIS_URL`.
 * `maxRetriesPerRequest: null` es obligatorio para los `Worker` de BullMQ (comandos bloqueantes).
 */
export const buildBullConnection = (redisUrl: string): ConnectionOptions => {
  const url = new URL(redisUrl);
  const options: BullRedisOptions = {
    host: url.hostname,
    port: url.port === '' ? DEFAULT_REDIS_PORT : Number(url.port),
    maxRetriesPerRequest: null,
  };
  if (url.username !== '') options.username = decodeURIComponent(url.username);
  if (url.password !== '') options.password = decodeURIComponent(url.password);
  const db = url.pathname.replace(/^\//, '');
  if (db !== '') options.db = Number(db);
  return options;
};
