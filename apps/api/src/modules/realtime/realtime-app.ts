import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { REALTIME_CONFIG, type RealtimeConfig } from './application/realtime-config';
import { RealtimeIoAdapter } from './infrastructure/realtime-io.adapter';

/**
 * Instala el adaptador del canal en vivo antes de `init`/`listen` (plan 015 §2); lo llaman `main.ts` y el arnés de
 * integración, como `configureHttpApp`. Lee `REALTIME_CONFIG` de la app (no del entorno) para que una prueba la
 * sustituya con tiempos cortos. Exige `RealtimeModule` en la app.
 */
export const configureRealtime = (app: INestApplication): void => {
  const config = app.get<RealtimeConfig>(REALTIME_CONFIG);
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config, app.get(Logger)));
};
