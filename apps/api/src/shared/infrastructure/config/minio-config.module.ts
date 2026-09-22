import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from './env.schema';

/** Token de la configuración de MinIO: solo lo que un cliente de S3 necesita (ISP). */
export const MINIO_CONFIG = Symbol('MINIO_CONFIG');

export type MinioConfig = Pick<
  Env,
  'MINIO_ENDPOINT' | 'MINIO_ACCESS_KEY' | 'MINIO_SECRET_KEY' | 'MINIO_BUCKET' | 'MINIO_REGION'
>;

/**
 * Solo la raíz de composición de `api` lo importa: es el único proceso con contrato de MinIO. Así
 * `MinioHealthIndicator` depende de cinco variables y no de la unión de entornos, y no comprueba nada
 * en tiempo de ejecución. Global porque `HealthModule.forRoot` instancia los indicadores en su propio módulo.
 */
@Global()
@Module({})
export class MinioConfigModule {
  static forRoot(env: MinioConfig): DynamicModule {
    const config: MinioConfig = {
      MINIO_ENDPOINT: env.MINIO_ENDPOINT,
      MINIO_ACCESS_KEY: env.MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY: env.MINIO_SECRET_KEY,
      MINIO_BUCKET: env.MINIO_BUCKET,
      MINIO_REGION: env.MINIO_REGION,
    };
    return {
      module: MinioConfigModule,
      providers: [{ provide: MINIO_CONFIG, useValue: config }],
      exports: [MINIO_CONFIG],
    };
  }
}
