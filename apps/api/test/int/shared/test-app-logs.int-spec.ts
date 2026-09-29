import { PinoLogger } from 'nestjs-pino';

import { createTestApp } from '../setup/test-app';

const PROBE_EVENT = 'test.log_probe';

/**
 * Arnés de integración (CA-18, CA-21): cada `createTestApp` captura sus propias bitácoras, también la segunda app de
 * una misma suite. nestjs-pino arma un único logger raíz por proceso con el primer destino que recibe; las pruebas de
 * degradación del correo componen dos apps en el mismo archivo y esperan líneas en la segunda.
 */
describe('bitácoras del arnés con varias apps en una suite', () => {
  it('la segunda app registra en su propio `LogSink` y no en el de la primera', async () => {
    const first = await createTestApp();
    await first.close();
    first.logs.clear();
    const second = await createTestApp();

    try {
      const logger = await second.app.resolve(PinoLogger);
      logger.info({ event: PROBE_EVENT });

      expect(second.logs.lines()).toContainEqual(expect.objectContaining({ event: PROBE_EVENT }));
      expect(first.logs.lines()).toEqual([]);
    } finally {
      await second.close();
    }
  });
});
