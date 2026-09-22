import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import { ENV } from '../config/env.module';
import type { SharedEnvBase } from '../config/env.schema';

import { buildLoggerModuleParams } from './logger.options';

/**
 * Destino opcional de las bitácoras. En producción no se provee (pino escribe en stdout); el arnés de
 * integración lo registra en un módulo global para capturar las líneas en memoria y afirmar sobre ellas.
 */
export const LOG_STREAM = Symbol('LOG_STREAM');

/** `LoggerModule.forRootAsync` de nestjs-pino con el `LOG_LEVEL` del `ENV` global; lo importa `SharedModule`. */
export const createLoggerModule = (): DynamicModule =>
  LoggerModule.forRootAsync({
    inject: [ENV, { token: LOG_STREAM, optional: true }],
    useFactory: (env: SharedEnvBase, stream?: DestinationStream): Params =>
      buildLoggerModuleParams({ level: env.LOG_LEVEL, stream }),
  });
