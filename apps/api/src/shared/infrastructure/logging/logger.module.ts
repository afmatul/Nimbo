import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import { ENV, EnvModule } from '../config/env.module';
import type { SharedEnv } from '../config/resolve-shared-env';

import { buildLoggerModuleParams } from './logger.options';

/**
 * Destino opcional de las bitácoras. En producción no se provee (pino escribe en stdout); el arnés de
 * integración lo registra en un módulo global para capturar las líneas en memoria y afirmar sobre ellas.
 */
export const LOG_STREAM = Symbol('LOG_STREAM');

/** `LoggerModule.forRootAsync` de nestjs-pino con el `LOG_LEVEL` validado; lo importa `SharedModule`. */
export const createLoggerModule = (): DynamicModule =>
  LoggerModule.forRootAsync({
    imports: [EnvModule],
    inject: [ENV, { token: LOG_STREAM, optional: true }],
    useFactory: (env: SharedEnv, stream?: DestinationStream): Params =>
      buildLoggerModuleParams({ level: env.LOG_LEVEL, stream }),
  });
