import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';

import type { IDomainEventPublisher } from '../../application/events/i-domain-event-publisher.port';

/** Lo mínimo que el publicador necesita del logger (se inyecta `PinoLogger`; permite un doble en las pruebas). */
export interface DomainEventLogger {
  warn(payload: Record<string, unknown>): void;
}

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/**
 * `IDomainEventPublisher` con `@nestjs/event-emitter` (ADR-0019). Si un oyente lanza de forma síncrona, se registra
 * `domain_event.publish_failed` con el nombre del evento y la clase del error, y no se relanza. La bitácora nunca
 * lleva el contenido del evento ni el mensaje del error, que pueden traer datos del oyente. Requiere en la raíz
 * `EventEmitterModule.forRoot()`; cada módulo productor lo registra como `I_DOMAIN_EVENT_PUBLISHER`.
 */
@Injectable()
export class EventEmitterDomainEventPublisher implements IDomainEventPublisher {
  constructor(
    private readonly emitter: EventEmitter2,
    @Inject(PinoLogger) private readonly logger: DomainEventLogger,
  ) {}

  publish(name: string, payload: object): void {
    try {
      this.emitter.emit(name, payload);
    } catch (error) {
      this.logger.warn({
        event: 'domain_event.publish_failed',
        name,
        errorClass: errorClassOf(error),
      });
    }
  }
}
