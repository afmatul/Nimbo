import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';

import { ENV, EnvModule } from '../config/env.module';
import type { SharedEnv } from '../config/resolve-shared-env';

import { buildLoggerModuleParams } from './logger.options';

/** `LoggerModule.forRootAsync` de nestjs-pino con el `LOG_LEVEL` validado; lo importa `SharedModule`. */
export const createLoggerModule = (): DynamicModule =>
  LoggerModule.forRootAsync({
    imports: [EnvModule],
    inject: [ENV],
    useFactory: (env: SharedEnv): Params => buildLoggerModuleParams({ level: env.LOG_LEVEL }),
  });
