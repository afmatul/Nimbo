import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { z } from 'zod';

import { workerEnvSchema, workerOptimizerEnvSchema } from '../../src/shared';

type WorkerEnv = z.infer<typeof workerEnvSchema>;
type WorkerOptimizerEnv = z.infer<typeof workerOptimizerEnvSchema>;

/** Clave con que `@Processor(cola)` de `@nestjs/bullmq` guarda `{ name }` en la clase (`bull.constants`). */
const PROCESSOR_METADATA = 'bullmq:processor_metadata';
/** Claves de `@Module({...})` (`MODULE_METADATA` de `@nestjs/common`). */
const IMPORTS = 'imports';
const PROVIDERS = 'providers';

type ModuleNode = Type | DynamicModule;

const isDynamic = (node: unknown): node is DynamicModule =>
  typeof node === 'object' && node !== null && 'module' in node;

const classOf = (provider: Provider): unknown =>
  typeof provider === 'function'
    ? provider
    : 'useClass' in provider
      ? provider.useClass
      : undefined;

const queueOf = (provider: Provider): string | undefined => {
  const target = classOf(provider);
  if (typeof target !== 'function') return undefined;
  const metadata = Reflect.getMetadata(PROCESSOR_METADATA, target) as { name?: string } | undefined;
  return metadata?.name;
};

const staticList = <T>(target: Type, key: string): T[] =>
  (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];

/**
 * Colas de todos los `@Processor` que registra el árbol de módulos de `root` (estáticos y dinámicos), sin arrancar
 * Nest ni conectarse a nada. Una cola repetida en el resultado significa dos consumidores en el mismo proceso.
 */
export function processorQueuesOf(root: ModuleNode): string[] {
  const visited = new Set<unknown>();
  const queues: string[] = [];
  const visit = (node: unknown): void => {
    if (visited.has(node) || (typeof node !== 'function' && !isDynamic(node))) return;
    visited.add(node);
    const moduleClass = isDynamic(node) ? node.module : (node as Type);
    const imports = [
      ...staticList<unknown>(moduleClass, IMPORTS),
      ...(isDynamic(node) ? (node.imports ?? []) : []),
    ];
    const providers = [
      ...staticList<Provider>(moduleClass, PROVIDERS),
      ...(isDynamic(node) ? (node.providers ?? []) : []),
    ];
    for (const provider of providers) {
      const queue = queueOf(provider);
      if (queue !== undefined) queues.push(queue);
    }
    imports.forEach(visit);
  };
  visit(root);
  return queues;
}

const BASE_ENV = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://nimbo:nimbo@localhost:5432/nimbo',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'nimbo',
  MINIO_SECRET_KEY: 'nimbo-secret',
};

/** Cada raíz se prueba con su propio esquema, sin heredar requisitos del otro proceso. */
export const validWorkerOptimizerEnv = (): WorkerOptimizerEnv =>
  workerOptimizerEnvSchema.parse(BASE_ENV);

/** Entorno del `worker` válido y mínimo (los valores por defecto del esquema completan el resto). */
export const validWorkerEnv = (): WorkerEnv =>
  workerEnvSchema.parse({
    ...BASE_ENV,
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_TLS: 'none',
    MAIL_FROM: 'Nimbo <no-responder@nimbo.me>',
  });
