import { compileApi } from './compiled-api';
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
 * El esquema compartido se crea con las migraciones versionadas (plan 001 §8), nunca con `synchronize`, y como
 * el dueño de las tablas (`DATABASE_MIGRATION_URL`, plan 003 §6.8). En paralelo se compila `api` para las suites
 * que arrancan `api` o `worker` como proceso (`compiled-api.ts`).
 */
export default async function globalSetup(): Promise<void> {
  const [infra] = await Promise.all([startTestInfra(), compileApi()]);
  globalThis.nimboTestInfra = infra;
  const infraEnv = infra.env();
  runMigrations(infraEnv.DATABASE_MIGRATION_URL);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    APP_VERSION: 'test',
    LOG_LEVEL: 'info',
    WEB_PUBLIC_URL: 'http://localhost',
    JWT_ACCESS_SECRET: 'secreto-de-prueba-de-al-menos-32-caracteres',
    ...infraEnv,
  });
}
