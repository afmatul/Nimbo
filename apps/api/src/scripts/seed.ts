import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { demoCorpus } from '../seed/demo-corpus';
import { DemoSeeder, SeedRefusedError } from '../seed/demo-seeder';
import type { SeedInput } from '../seed/demo-seeder';
import { SeedModule } from '../seed/seed.module';
import { apiEnvSchema, CorrelationContext, errorName, loadDotenvFile, loadEnv } from '../shared';
import type { Env } from '../shared';
import { seedEnvSchema } from '../shared/infrastructure/config/env.schema';

const writeLine = (payload: Record<string, unknown>): void => {
  process.stderr.write(`${JSON.stringify(payload)}\n`);
};

/** Solo el motivo de una negativa de la semilla; de un error inesperado, su nombre (el mensaje podría traer datos). */
const failureOf = (error: unknown): Record<string, unknown> =>
  error instanceof SeedRefusedError ? { reason: error.message } : { errorName: errorName(error) };

/** Contexto Nest sin HTTP: siembra, registra cuántas filas creó y cierra conexiones. */
async function seed(env: Env, input: SeedInput): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule.forRoot(env, input), {
    bufferLogs: true,
    abortOnError: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  try {
    const created = await app.get(DemoSeeder).seed();
    logger.log({ event: 'seed.completed', created });
  } catch (error: unknown) {
    logger.error({ event: 'seed.failed', ...failureOf(error) });
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

/**
 * `pnpm seed` (local) y `node dist/scripts/seed.js` (imagen del `api`, con `SEED_ON_START=true`): siembra las cuentas y
 * archivos de demostración. Idempotente. Sale con `1` si el entorno es inválido o la semilla falla. Nunca imprime la
 * contraseña de demostración, correos, nombres de archivo ni tokens.
 */
async function main(): Promise<void> {
  loadDotenvFile();
  const api = loadEnv(apiEnvSchema);
  const seedEnv = loadEnv(seedEnvSchema);
  if (!api.ok || !seedEnv.ok) {
    writeLine({
      event: 'config.invalid',
      issues: [...(api.ok ? [] : api.issues), ...(seedEnv.ok ? [] : seedEnv.issues)],
    });
    process.exitCode = 1;
    return;
  }
  const corpus = demoCorpus({ folderMaxDepth: api.env.FOLDER_MAX_DEPTH });
  await seed(api.env, { corpus, password: seedEnv.env.SEED_DEMO_PASSWORD });
}

void CorrelationContext.run({ correlationId: randomUUID() }, () =>
  main().catch((error: unknown) => {
    writeLine({ event: 'seed.failed', ...failureOf(error) });
    process.exitCode = 1;
  }),
);
