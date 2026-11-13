import { EventEmitter2 } from '@nestjs/event-emitter';

import { CLIENT_ACCOUNT_VERIFIED } from '../domain/client-account-verified.event';
import type { ClientAccountVerifiedEvent } from '../domain/client-account-verified.event';

import { EventEmitterAccountEventsPublisher } from './event-emitter-account-events.publisher';

const USER_ID = '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b';

const setup = () => {
  const emitter = new EventEmitter2();
  const logger = { info: jest.fn(), warn: jest.fn() };
  const publisher = new EventEmitterAccountEventsPublisher(emitter, logger);
  return { emitter, logger, publisher };
};

/** ADR-0019, plan §6.4: publicación en proceso después del commit, que nunca lanza. */
describe('EventEmitterAccountEventsPublisher', () => {
  it('CA-8: emite `CLIENT_ACCOUNT_VERIFIED` con el `userId` y el plan pendiente, y registra `published` solo con `userId`', () => {
    const { emitter, logger, publisher } = setup();
    const received: ClientAccountVerifiedEvent[] = [];
    emitter.on(CLIENT_ACCOUNT_VERIFIED, (event: ClientAccountVerifiedEvent) => {
      received.push(event);
    });

    publisher.clientAccountVerified({ userId: USER_ID, pendingPlanSlug: 'pro' });

    expect(received).toEqual([{ userId: USER_ID, pendingPlanSlug: 'pro' }]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.account_verified.published',
      userId: USER_ID,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('CA-8: un oyente que lanza de forma síncrona no propaga y deja `publish_failed` en `warn` solo con `userId`', () => {
    const { emitter, logger, publisher } = setup();
    emitter.on(CLIENT_ACCOUNT_VERIFIED, () => {
      throw new Error('fallo del oyente con datos internos');
    });

    expect(() => {
      publisher.clientAccountVerified({ userId: USER_ID, pendingPlanSlug: null });
    }).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'identity.account_verified.publish_failed',
      userId: USER_ID,
    });
    expect(logger.info).not.toHaveBeenCalled();
  });
});
