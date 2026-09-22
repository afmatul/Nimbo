import { Global, Module } from '@nestjs/common';
import type { DestinationStream } from 'pino';

import { LOG_STREAM } from '../../../src/shared/infrastructure/logging/logger.module';

export type LogLine = Record<string, unknown>;

/** Destino en memoria para pino: cada línea JSON queda parseada y consultable desde la prueba. */
export class LogSink implements DestinationStream {
  private readonly raw: string[] = [];

  write(line: string): void {
    this.raw.push(line);
  }

  lines(): LogLine[] {
    return this.raw.map((line) => JSON.parse(line) as LogLine);
  }

  withCorrelationId(correlationId: string): LogLine[] {
    return this.lines().filter((line) => line.correlationId === correlationId);
  }

  clear(): void {
    this.raw.length = 0;
  }
}

/** Módulo global que provee `LOG_STREAM`; `createLoggerModule` lo inyecta como opcional. */
export const createLogSinkModule = (sink: LogSink): new () => object => {
  @Global()
  @Module({ providers: [{ provide: LOG_STREAM, useValue: sink }], exports: [LOG_STREAM] })
  class LogSinkModule {}
  return LogSinkModule;
};
