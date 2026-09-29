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

/**
 * nestjs-pino 5 arma **un** logger raíz por proceso con el primer destino que recibe, y las apps siguientes de la
 * misma suite lo reutilizan. Por eso `LOG_STREAM` es siempre este reenvío, que escribe en el `LogSink` de la última
 * app creada: cada app captura sus propias líneas aunque la suite componga varias una tras otra.
 */
class ActiveSinkStream implements DestinationStream {
  active: LogSink | undefined;

  write(line: string): void {
    this.active?.write(line);
  }
}

const activeSinkStream = new ActiveSinkStream();

/** Módulo global que provee `LOG_STREAM` (`createLoggerModule` lo inyecta como opcional) y activa `sink`. */
export const createLogSinkModule = (sink: LogSink): new () => object => {
  activeSinkStream.active = sink;
  @Global()
  @Module({
    providers: [{ provide: LOG_STREAM, useValue: activeSinkStream }],
    exports: [LOG_STREAM],
  })
  class LogSinkModule {}
  return LogSinkModule;
};
