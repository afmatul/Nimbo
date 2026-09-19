import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import type { LoggerOptionsInput } from './logger.options';
import { buildLoggerModuleParams } from './logger.options';

/** `LoggerModule.forRoot` de nestjs-pino ya configurado; lo importa `SharedModule` (T-16) con el `LOG_LEVEL` validado. */
export const createLoggerModule = (input: LoggerOptionsInput): DynamicModule =>
  LoggerModule.forRoot(buildLoggerModuleParams(input));
