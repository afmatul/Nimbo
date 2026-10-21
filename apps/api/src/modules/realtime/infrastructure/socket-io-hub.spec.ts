import { EventEmitter2 } from '@nestjs/event-emitter';

import { createActor, ForbiddenError, Role } from '../../../shared';
import type { RealtimeNotice } from '../application/ports/i-realtime-publisher.port';
import { documentRoom, userRoom } from '../domain/room-names';

import type { RealtimeServer } from './realtime-socket';
import { SocketIoHub } from './socket-io-hub';

const USER_ID = '7d2f0a4e-3c1b-4f5a-9e8d-1a2b3c4d5e6f';
const DOCUMENT_ID = '0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e';
const NOTICE: RealtimeNotice = { event: 'prueba.aviso', payload: { secreto: 'contenido' } };

const setup = (emit: jest.Mock = jest.fn()) => {
  const to = jest.fn().mockReturnValue({ emit });
  const logger = { warn: jest.fn() };
  const hub = new SocketIoHub(logger, new EventEmitter2());
  return { hub, to, emit, logger, server: { to, on: jest.fn() } as unknown as RealtimeServer };
};

describe('SocketIoHub como IRealtimePublisher (plan §2)', () => {
  it('CA-12: sin servidor adjunto, avisar a un usuario o a un documento no falla ni espera', () => {
    const { hub, logger } = setup();

    expect(hub.toUser(USER_ID, NOTICE)).toBeUndefined();
    expect(hub.toDocument(DOCUMENT_ID, NOTICE)).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('CA-5: avisa a la sala del usuario con el evento y la carga del aviso', () => {
    const { hub, server, to, emit } = setup();
    hub.attach(server);

    hub.toUser(USER_ID, NOTICE);

    expect(to).toHaveBeenCalledWith(userRoom(USER_ID));
    expect(emit).toHaveBeenCalledWith(NOTICE.event, NOTICE.payload);
  });

  it('avisa a la sala del documento con el evento y la carga del aviso', () => {
    const { hub, server, to, emit } = setup();
    hub.attach(server);

    hub.toDocument(DOCUMENT_ID, NOTICE);

    expect(to).toHaveBeenCalledWith(documentRoom(DOCUMENT_ID));
    expect(emit).toHaveBeenCalledWith(NOTICE.event, NOTICE.payload);
  });

  it('CA-12: un fallo del servidor se atrapa y se registra solo con la clase del error', () => {
    const failingEmit = jest.fn(() => {
      throw new TypeError('fallo interno con datos');
    });
    const { hub, server, logger } = setup(failingEmit);
    hub.attach(server);

    expect(() => hub.toUser(USER_ID, NOTICE)).not.toThrow();
    expect(() => hub.toDocument(DOCUMENT_ID, NOTICE)).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'realtime.publish_failed',
      errorClass: 'TypeError',
    });
  });
});

describe('SocketIoHub como IDocumentRooms sin servidor adjunto (plan §2)', () => {
  it('`admit` lanza ForbiddenError: la conexión no existe', async () => {
    const { hub } = setup();

    await expect(
      hub.admit(createActor(USER_ID, Role.CLIENT), 'conexion', DOCUMENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('`retire` no falla: no hay conexiones que retirar', async () => {
    const { hub } = setup();

    await expect(hub.retire(USER_ID, DOCUMENT_ID)).resolves.toBeUndefined();
  });
});
