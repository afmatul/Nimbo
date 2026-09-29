import { startTestInfra } from './containers';
import type { TestInfra } from './containers';
import { runMigrations } from './migrate';

declare global {
  // Jest exige `var` para compartir estado entre globalSetup y globalTeardown.
  var nimboTestInfra: TestInfra | undefined;
}

/**
 * Un solo juego de contenedores para toda la corrida de `int` (plan 000 §8). Las suites que necesitan
 * detener dependencias (salud) arrancan las suyas con `startTestInfra()` para no afectar al resto.
 * El esquema compartido se crea con las migraciones versionadas (plan 001 §8), nunca con `synchronize`.
 */
export default async function globalSetup(): Promise<void> {
  const infra = await startTestInfra();
  globalThis.nimboTestInfra = infra;
  runMigrations(infra.postgres.getConnectionUri());
  Object.assign(process.env, {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    APP_VERSION: 'test',
    LOG_LEVEL: 'info',
    WEB_PUBLIC_URL: 'http://localhost',
    CORS_ORIGIN: 'http://localhost',
    ...infra.env(),
  });
}
