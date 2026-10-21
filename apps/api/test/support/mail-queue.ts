import { Queue } from 'bullmq';

import { MAIL_QUEUE } from '../../src/modules/notifications';
import { buildBullConnection } from '../../src/shared/infrastructure/queue/bull.config';

import { requiredEnv } from './database-urls';

/**
 * Vacía la cola `mail` del Redis de las pruebas (revisión de Adrián del PR #62). Las suites que encolan correos sin
 * consumirlos (el cobro de la 009 encola el comprobante) la dejan limpia al cerrar, y la prueba de contrato del correo
 * la vacía antes de levantar su `worker`: así ninguna depende del orden en que Jest corre las suites.
 */
export async function clearMailQueue(): Promise<void> {
  const queue = new Queue(MAIL_QUEUE, {
    connection: buildBullConnection(requiredEnv('REDIS_URL')),
  });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}
