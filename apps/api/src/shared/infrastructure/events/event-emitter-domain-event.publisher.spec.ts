import { EventEmitter2 } from '@nestjs/event-emitter';

import { EventEmitterDomainEventPublisher } from './event-emitter-domain-event.publisher';

const EVENT = 'storage.file-version-created';
const PAYLOAD = { fileId: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b' };

class ListenerFailure extends Error {}

const setup = () => {
  const emitter = new EventEmitter2();
  const logger = { warn: jest.fn() };
  const publisher = new EventEmitterDomainEventPublisher(emitter, logger);
  return { emitter, logger, publisher };
};

/** ADR-0019 (regla de tres) y plan 019 §2: publicación en proceso después del commit, que nunca lanza. */
describe('EventEmitterDomainEventPublisher', () => {
  it('RN-11: entrega el evento con su nombre y su contenido tal cual a los oyentes', () => {
    const { emitter, logger, publisher } = setup();
    const received: unknown[] = [];
    emitter.on(EVENT, (payload: unknown) => {
      received.push(payload);
    });

    publisher.publish(EVENT, PAYLOAD);

    expect(received).toEqual([PAYLOAD]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('RN-5: un oyente que lanza no propaga y deja `publish_failed` con el nombre y la clase del error, sin contenido', () => {
    const { emitter, logger, publisher } = setup();
    emitter.on(EVENT, () => {
      throw new ListenerFailure('fallo del oyente con datos internos');
    });

    expect(() => {
      publisher.publish(EVENT, PAYLOAD);
    }).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'domain_event.publish_failed',
      name: EVENT,
      errorClass: 'ListenerFailure',
    });
  });

  it('RN-11: sin oyentes, publicar no hace nada ni registra', () => {
    const { logger, publisher } = setup();

    publisher.publish(EVENT, PAYLOAD);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
